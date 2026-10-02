export type QueuedEvidence = {
  id:string;
  farmId:string;
  userId:string;
  module:"records"|"fields"|"team"|"h2a";
  recordType:string;
  recordId:string;
  parentRecordId?:string|null;
  category:string;
  storagePath:string;
  fileName:string;
  mimeType:string;
  capturedAt:string;
  gps?:{lat:number|null;lng:number|null;accuracy?:number|null;capturedAt?:string|null}|null;
  metadata:Record<string,unknown>;
  blob:Blob;
};

const DB="farmvoice-offline-v1";
const STORE="evidence";
const syncFlights = new Map<string, Promise<number>>();

function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"}); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

export async function queueEvidence(item:QueuedEvidence){
  const database=await db();
  await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  database.close();
}

export async function queuedEvidence(farmId:string,userId:string){
  const database=await db();
  const all=await new Promise<QueuedEvidence[]>((resolve,reject)=>{
    const req=database.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result as QueuedEvidence[]);
    req.onerror=()=>reject(req.error);
  });
  database.close();
  return all.filter(x=>x.farmId===farmId&&x.userId===userId).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
}

async function removeEvidence(id:string){
  const database=await db();
  await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  database.close();
}

export async function remapQueuedEvidenceRecordId(
  farmId:string,
  userId:string,
  fromRecordId:string,
  toRecordId:string,
){
  if (!fromRecordId || fromRecordId===toRecordId) return 0;
  const database=await db();
  const all=await new Promise<QueuedEvidence[]>((resolve,reject)=>{
    const req=database.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result as QueuedEvidence[]);
    req.onerror=()=>reject(req.error);
  });
  const matches=all.filter(x =>
    x.farmId===farmId &&
    x.userId===userId &&
    (x.recordId===fromRecordId || x.parentRecordId===fromRecordId)
  );
  if (!matches.length) {
    database.close();
    return 0;
  }
  await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction(STORE,"readwrite");
    const store=tx.objectStore(STORE);
    for (const item of matches) {
      store.put({
        ...item,
        recordId:item.recordId===fromRecordId ? toRecordId : item.recordId,
        parentRecordId:item.parentRecordId===fromRecordId ? toRecordId : item.parentRecordId,
      });
    }
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  database.close();
  return matches.length;
}

async function runEvidenceSync(supabase:any,farmId:string,userId:string){
  let synced=0;
  for(const item of await queuedEvidence(farmId,userId)){
    const upload=await supabase.storage.from("farm-photo-evidence").upload(item.storagePath,item.blob,{cacheControl:"3600",upsert:false,contentType:item.mimeType||undefined});
    if(upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw upload.error;
    const row=await supabase.from("farm_photo_evidence").upsert({
      id:item.id,farm_id:item.farmId,module:item.module,record_type:item.recordType,record_id:item.recordId,
      parent_record_id:item.parentRecordId??null,category:item.category,storage_bucket:"farm-photo-evidence",
      storage_path:item.storagePath,file_name:item.fileName,mime_type:item.mimeType||null,captured_at:item.capturedAt,
      captured_by:item.userId,gps_lat:item.gps?.lat??null,gps_lng:item.gps?.lng??null,
      gps_accuracy_m:item.gps?.accuracy??null,gps_captured_at:item.gps?.capturedAt??null,metadata:item.metadata,
    },{onConflict:"id"});
    if(row.error) throw row.error;
    await removeEvidence(item.id);
    synced++;
  }
  return synced;
}

export function syncEvidence(supabase:any,farmId:string,userId:string){
  const key=`${userId}:${farmId}`;
  const existing=syncFlights.get(key);
  if(existing) return existing;
  const flight=runEvidenceSync(supabase,farmId,userId).finally(()=>{
    if(syncFlights.get(key)===flight) syncFlights.delete(key);
  });
  syncFlights.set(key,flight);
  return flight;
}
