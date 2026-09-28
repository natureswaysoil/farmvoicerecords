"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import { type FarmContext } from "@/src/lib/farm-cloud";
import { loadH2aFarmChoices, pickH2aFarm, selectH2aFarm, type H2aFarmChoice } from "@/src/lib/h2a-farm-context";
import SmartPhotoEvidence from "@/src/components/smart-photo-evidence";

type Worker={id:string;employee_number:string;legal_name:string;preferred_name:string|null};
type Doc={id:string;worker_id:string|null;document_type:string;title:string;issued_on:string|null;expires_on:string|null;storage_reference:string|null;created_at:string};
type Ack={id:string;worker_id:string;acknowledgment_type:string;document_title:string|null;language:string|null;acknowledged_at:string|null;method:string|null;witness_name:string|null};

export default function H2ADocumentsPage(){
 const [supabase]=useState(()=>createClient());
 const [ctx,setCtx]=useState<FarmContext|null>(null);
 const [farmChoices,setFarmChoices]=useState<H2aFarmChoice[]>([]);
 const [workers,setWorkers]=useState<Worker[]>([]);
 const [docs,setDocs]=useState<Doc[]>([]);
 const [acks,setAcks]=useState<Ack[]>([]);
 const [message,setMessage]=useState("Loading document records...");
 const [file,setFile]=useState<File|null>(null);
 const [doc,setDoc]=useState({workerId:"",type:"work_contract",title:"",issued:"",expires:""});
 const [ack,setAck]=useState({workerId:"",type:"work_contract_received",title:"",language:"Spanish",method:"paper",witness:""});

 async function load(preferredFarmId?:string){
  try{
   const choices=await loadH2aFarmChoices(supabase);setFarmChoices(choices);
   const farm=preferredFarmId?choices.find(c=>c.farmId===preferredFarmId)??null:pickH2aFarm(choices);
   if(!choices.length){setMessage("Sign in first.");return}
   if(!farm){setCtx(null);setMessage("Choose the farm whose H-2A documents you want to manage.");return}
   selectH2aFarm(farm.farmId);setCtx(farm);
   const [w,d,a]=await Promise.all([
    supabase.from("h2a_workers").select("id,employee_number,legal_name,preferred_name").eq("farm_id",farm.farmId).order("employee_number"),
    supabase.from("h2a_documents").select("id,worker_id,document_type,title,issued_on,expires_on,storage_reference,created_at").eq("farm_id",farm.farmId).order("created_at",{ascending:false}),
    supabase.from("h2a_acknowledgments").select("id,worker_id,acknowledgment_type,document_title,language,acknowledged_at,method,witness_name").eq("farm_id",farm.farmId).order("created_at",{ascending:false})
   ]);
   for(const r of [w,d,a])if(r.error)throw r.error;
   setWorkers((w.data??[]) as Worker[]);setDocs((d.data??[]) as Doc[]);setAcks((a.data??[]) as Ack[]);setMessage("");
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to load documents.")}
 }
 useEffect(()=>{void load()},[supabase]);

 async function upload(e:FormEvent){
  e.preventDefault();if(!ctx||!file)return;
  const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,"-");
  const path=`${ctx.farmId}/${doc.workerId||"general"}/${crypto.randomUUID()}-${safe}`;
  const up=await supabase.storage.from("h2a-documents").upload(path,file,{upsert:false});
  if(up.error){setMessage(up.error.message);return}
  const {error}=await supabase.from("h2a_documents").insert({farm_id:ctx.farmId,worker_id:doc.workerId||null,document_type:doc.type,title:doc.title||file.name,issued_on:doc.issued||null,expires_on:doc.expires||null,storage_reference:path,created_by:ctx.userId});
  if(error){await supabase.storage.from("h2a-documents").remove([path]);setMessage(error.message);return}
  setMessage("Private H-2A document uploaded.");setFile(null);setDoc({...doc,title:""});void load()
 }

 async function openDoc(path:string|null){
  if(!path)return;const {data,error}=await supabase.storage.from("h2a-documents").createSignedUrl(path,60);
  if(error||!data){setMessage(error?.message??"Unable to open document.");return}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 }

 async function saveAck(e:FormEvent){
  e.preventDefault();if(!ctx)return;
  const {error}=await supabase.from("h2a_acknowledgments").insert({farm_id:ctx.farmId,worker_id:ack.workerId,acknowledgment_type:ack.type,document_title:ack.title||null,language:ack.language||null,acknowledged_at:new Date().toISOString(),method:ack.method,witness_name:ack.witness||null,created_by:ctx.userId});
  setMessage(error?error.message:"Worker acknowledgment recorded.");if(!error)void load();
 }

 const name=(id:string|null)=>{const w=workers.find(x=>x.id===id);return w?(w.preferred_name||w.legal_name):"General"};

 return <main className="container section stack">
  <div><div className="kicker">H-2A documents</div><h1 style={{fontSize:"clamp(36px,6vw,60px)"}}>Private document vault & acknowledgments</h1><p className="lede">Store worker and contract documents privately and record paper/tablet acknowledgments even when workers do not have phones.</p><p><Link className="btn secondary" href="/h2a">Back to H-2A dashboard</Link></p></div>
  {message&&<div className="notice">{message}</div>}
  {farmChoices.length>1&&<section className="card form"><div className="field"><label>Farm</label><select value={ctx?.farmId??""} onChange={e=>{const id=e.target.value;if(!id){setCtx(null);setMessage("Choose the farm whose H-2A documents you want to manage.");return}selectH2aFarm(id);void load(id)}}><option value="">Choose a farm</option>{farmChoices.map(f=><option key={f.farmId} value={f.farmId}>{f.name}</option>)}</select></div></section>}
  <section className="grid-2">
   <form className="card form" onSubmit={upload}><div><div className="kicker">Document vault</div><h2>Upload document</h2></div><div className="field"><label>Worker</label><select value={doc.workerId} onChange={e=>setDoc({...doc,workerId:e.target.value})}><option value="">General / contract</option>{workers.map(w=><option key={w.id} value={w.id}>{w.employee_number} · {w.legal_name}</option>)}</select></div><div className="field"><label>Document type</label><select value={doc.type} onChange={e=>setDoc({...doc,type:e.target.value})}><option value="work_contract">Work contract / job order</option><option value="passport">Passport copy</option><option value="visa">Visa</option><option value="i94">I-94</option><option value="i9_reference">I-9 reference</option><option value="w4">W-4</option><option value="housing">Housing</option><option value="training">Training</option><option value="pay_statement">Pay statement</option><option value="transportation">Transportation receipt</option><option value="separation">Separation notice</option><option value="other">Other</option></select></div><div className="field"><label>Title</label><input value={doc.title} onChange={e=>setDoc({...doc,title:e.target.value})}/></div><div className="row"><div className="field"><label>Issued</label><input type="date" value={doc.issued} onChange={e=>setDoc({...doc,issued:e.target.value})}/></div><div className="field"><label>Expires</label><input type="date" value={doc.expires} onChange={e=>setDoc({...doc,expires:e.target.value})}/></div></div><div className="field"><label>File</label><input type="file" required onChange={e=>setFile(e.target.files?.[0]??null)}/></div><button className="btn">Upload private document</button></form>
   <form className="card form" onSubmit={saveAck}><div><div className="kicker">Worker acknowledgment</div><h2>Record acknowledgment</h2></div><div className="field"><label>Worker</label><select required value={ack.workerId} onChange={e=>setAck({...ack,workerId:e.target.value})}><option value="">Select</option>{workers.map(w=><option key={w.id} value={w.id}>{w.employee_number} · {w.legal_name}</option>)}</select></div><div className="field"><label>Acknowledgment type</label><select value={ack.type} onChange={e=>setAck({...ack,type:e.target.value})}><option value="work_contract_received">Work contract received</option><option value="worker_rights">Worker rights notice</option><option value="housing_rules">Housing rules</option><option value="safety_training">Safety training</option><option value="deductions_disclosure">Deductions disclosure</option><option value="wage_notice">Wage notice</option><option value="other">Other</option></select></div><div className="field"><label>Document/title</label><input value={ack.title} onChange={e=>setAck({...ack,title:e.target.value})}/></div><div className="row"><div className="field"><label>Language</label><input value={ack.language} onChange={e=>setAck({...ack,language:e.target.value})}/></div><div className="field"><label>Method</label><select value={ack.method} onChange={e=>setAck({...ack,method:e.target.value})}><option value="paper">Paper</option><option value="tablet">Shared tablet</option><option value="verbal_witness">Verbal with witness</option><option value="other">Other</option></select></div></div><div className="field"><label>Witness (if applicable)</label><input value={ack.witness} onChange={e=>setAck({...ack,witness:e.target.value})}/></div><button className="btn">Record acknowledgment</button></form>
  </section>
  <section className="card"><h2>Recent documents</h2>{docs.length?<div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Worker</th><th>Type</th><th>Title</th><th>Expires</th><th>File</th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td>{name(d.worker_id)}</td><td>{d.document_type}</td><td>{d.title}</td><td>{d.expires_on??"—"}</td><td>{d.storage_reference?<button className="btn secondary" onClick={()=>void openDoc(d.storage_reference)}>Open</button>:"—"}{ctx&&<SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="document" recordId={d.id} category="document_evidence" metadata={{document_type:d.document_type,title:d.title}} onMessage={setMessage}/>}</td></tr>)}</tbody></table></div>:<p className="muted">No documents uploaded yet.</p>}</section>
  <section className="card"><h2>Recent acknowledgments</h2>{acks.length?<div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Worker</th><th>Type</th><th>Language</th><th>Method</th><th>Witness</th><th>Evidence</th></tr></thead><tbody>{acks.map(a=><tr key={a.id}><td>{name(a.worker_id)}</td><td>{a.acknowledgment_type}</td><td>{a.language??"—"}</td><td>{a.method??"—"}</td><td>{a.witness_name??"—"}</td><td>{ctx&&<SmartPhotoEvidence farmId={ctx.farmId} userId={ctx.userId} module="h2a" recordType="acknowledgment" recordId={a.id} category="acknowledgment_evidence" metadata={{acknowledgment_type:a.acknowledgment_type,worker_id:a.worker_id}} onMessage={setMessage}/>}</td></tr>)}</tbody></table></div>:<p className="muted">No acknowledgments yet.</p>}</section>
  <div className="notice"><strong>Privacy:</strong> Limit access to sensitive identity and immigration documents. FarmVoice stores these files privately; employers remain responsible for lawful collection, access, retention and disclosure.</div>
 </main>
}
