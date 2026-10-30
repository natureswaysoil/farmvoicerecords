import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const resend = Deno.env.get("RESEND_API_KEY");
const from = Deno.env.get("FARMVOICE_NOTIFICATION_FROM") || "FarmVoice Records <notifications@farmvoicerecords.com>";

const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function message(e:any){
 const p=e.payload||{};
 if(e.event_type==="housing.certificate.expiring"){
  const n=String(p.housing_name||"H-2A housing"), d=String(p.expires_on||"soon");
  return {subject:`FarmVoice: ${n} certificate expires ${d}`,text:`FarmVoice housing reminder: ${n} has a certificate expiration date of ${d}. Sign in to FarmVoice Records to review it.`,html:`<h2>Housing certificate reminder</h2><p><strong>${esc(n)}</strong> expires <strong>${esc(d)}</strong>.</p><p>Sign in to FarmVoice Records to review it.</p>`};
 }
 const label=String(p.requirement_label||p.requirement_code||"Housing corrective action"), due=String(p.due_on||"not recorded");
 return {subject:"FarmVoice: housing corrective action needs attention",text:`FarmVoice housing reminder: ${label}. Due: ${due}. Sign in to review it.`,html:`<h2>Housing corrective action</h2><p><strong>${esc(label)}</strong> needs attention. Due: <strong>${esc(due)}</strong>.</p>`};
}
async function rpc(fn:string,args:any={}){const {data,error}=await db.rpc(fn,args);if(error)throw error;return data;}
Deno.serve(async req=>{
 if(req.method!=="POST") return Response.json({error:"POST required"},{status:405});
 const {data:authorized,error:authError}=await db.rpc("notification_worker_authorize",{p_token:req.headers.get("x-farmvoice-cron-secret")});
 if(authError||authorized!==true) return Response.json({error:"Unauthorized"},{status:401});
 if(!resend) return Response.json({error:"RESEND_API_KEY is not configured"},{status:503});
 try{
  await rpc("notification_worker_release_stale");
  const events=await rpc("notification_worker_claim",{p_limit:25}) as any[];
  let sent=0,failed=0;
  for(const e of events){
   try{
    const recipients=await rpc("notification_worker_recipients",{p_farm_id:e.farm_id}) as any[];
    for(const r of recipients.filter((x:any)=>x.email_enabled&&x.email)){
     const {data:existing}=await db.from("notification_deliveries").select("id,status").eq("outbox_id",e.id).eq("recipient_user_id",r.user_id).eq("channel","email").maybeSingle();
     if(existing?.status==="sent"||existing?.status==="delivered"){sent++;continue;}
     const {data:d,error}=await db.from("notification_deliveries").upsert({farm_id:e.farm_id,outbox_id:e.id,recipient_user_id:r.user_id,channel:"email",provider:"resend",status:"queued",attempt_count:e.attempt_count},{onConflict:"outbox_id,recipient_user_id,channel"}).select("id").single();
     if(error)throw error;
     const m=message(e);
     const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json","Idempotency-Key":`farmvoice-${d.id}`},body:JSON.stringify({from,to:[r.email],subject:m.subject,text:m.text,html:m.html})});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(`Resend ${response.status}: ${JSON.stringify(body)}`);
     await db.from("notification_deliveries").update({status:"sent",provider_message_id:body.id??null,sent_at:new Date().toISOString(),last_error:null}).eq("id",d.id);
     sent++;
    }
    await rpc("notification_worker_complete",{p_outbox_id:e.id});
   }catch(err){failed++;await rpc("notification_worker_retry",{p_outbox_id:e.id,p_error:err instanceof Error?err.message:String(err)});}
  }
  return Response.json({ok:true,claimed:events.length,sent,failed});
 }catch(err){return Response.json({ok:false,error:err instanceof Error?err.message:String(err)},{status:500});}
});
