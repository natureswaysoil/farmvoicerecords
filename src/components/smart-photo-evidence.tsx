"use client";
import { useRef,useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type Props={
 farmId:string; userId:string; module:"records"|"fields"|"team"|"h2a";
 recordType:string; recordId:string; parentRecordId?:string|null; category?:string;
 label?:string; metadata?:Record<string,unknown>; gps?:{lat:number|null;lng:number|null;accuracy?:number|null;capturedAt?:string|null}|null;
 onUploaded?:(path:string)=>void; onMessage?:(message:string)=>void;
};
export default function SmartPhotoEvidence(p:Props){
 const [supabase]=useState(()=>createClient());const [busy,setBusy]=useState(false);
 const camera=useRef<HTMLInputElement>(null),library=useRef<HTMLInputElement>(null);
 async function upload(file?:File){if(!file||busy)return;setBusy(true);let path="";let evidenceId="";
  try{
   const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,"-")||"photo.jpg";
   path=`${p.farmId}/${p.module}/${p.recordType}/${p.recordId}/${Date.now()}-${safe}`;
   const up=await supabase.storage.from("farm-photo-evidence").upload(path,file,{cacheControl:"3600",upsert:false});if(up.error)throw up.error;
   const row=await supabase.from("farm_photo_evidence").insert({farm_id:p.farmId,module:p.module,record_type:p.recordType,record_id:p.recordId,parent_record_id:p.parentRecordId??null,category:p.category??"general",storage_bucket:"farm-photo-evidence",storage_path:path,file_name:file.name,mime_type:file.type||null,captured_at:new Date().toISOString(),captured_by:p.userId,gps_lat:p.gps?.lat??null,gps_lng:p.gps?.lng??null,gps_accuracy_m:p.gps?.accuracy??null,gps_captured_at:p.gps?.capturedAt??null,metadata:p.metadata??{}}).select("id").single();
   if(row.error)throw row.error;evidenceId=row.data.id;p.onUploaded?.(path);p.onMessage?.("Photo filed automatically with this record.");
  }catch(e){if(evidenceId)await supabase.from("farm_photo_evidence").delete().eq("id",evidenceId);if(path)await supabase.storage.from("farm-photo-evidence").remove([path]);p.onMessage?.(e instanceof Error?e.message:"Unable to save photo evidence.");}
  finally{setBusy(false);if(camera.current)camera.current.value="";if(library.current)library.current.value="";}
 }
 return <div className="stack"><div className="inline"><button type="button" className="btn secondary" disabled={busy} onClick={()=>camera.current?.click()}>{busy?"Uploading…":`📷 ${p.label??"Take photo"}`}</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>library.current?.click()}>🖼 Choose existing</button></div><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e=>void upload(e.target.files?.[0])}/><input ref={library} hidden type="file" accept="image/*,application/pdf" onChange={e=>void upload(e.target.files?.[0])}/></div>;
}