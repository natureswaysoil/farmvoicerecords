import test from "node:test";
import assert from "node:assert/strict";
import {
  activeQueuedWorkerTime,
  cacheCloudActiveWorkerTime,
  cachedCloudActiveWorkerTime,
  queuedWorkerTimes,
  storeWorkerTime,
} from "../src/lib/worker-time-offline.ts";
import {
  h2aDailyBatches,
  isRetryableH2aSyncError,
  storeH2aDailyBatch,
} from "../src/lib/h2a-offline.ts";
import { cachedFields } from "../src/lib/farm-cloud.ts";

function installStorage() {
  const map = new Map<string,string>();
  Object.defineProperty(globalThis,"localStorage",{
    configurable:true,
    value:{
      get length(){ return map.size; },
      key(i:number){ return [...map.keys()][i] ?? null; },
      getItem(k:string){ return map.get(k) ?? null; },
      setItem(k:string,v:string){ map.set(k,String(v)); },
      removeItem(k:string){ map.delete(k); },
      clear(){ map.clear(); },
    },
  });
}

test("offline worker clock queue is farm/account scoped and preserves active clock-in", () => {
  installStorage();
  const row = {
    id:"11111111-1111-4111-8111-111111111111",
    farmId:"22222222-2222-4222-8222-222222222222",
    userId:"33333333-3333-4333-8333-333333333333",
    job:"Harvest",
    fieldName:"North",
    clockIn:"2026-10-02T12:00:00.000Z",
    clockOut:null,
    clockInLat:35,
    clockInLng:-78,
    clockInAccuracyM:8,
    clockOutLat:null,
    clockOutLng:null,
    clockOutAccuracyM:null,
    mode:"insert" as const,
    queuedAt:"2026-10-02T12:00:00.000Z",
  };
  storeWorkerTime(row);
  assert.equal(queuedWorkerTimes(row.userId,row.farmId).length,1);
  assert.equal(activeQueuedWorkerTime(row.userId,row.farmId)?.id,row.id);
  assert.equal(queuedWorkerTimes("44444444-4444-4444-8444-444444444444",row.farmId).length,0);
});

test("cached cloud active worker time survives reload but queued clock-out suppresses it", () => {
  installStorage();
  const userId="33333333-3333-4333-8333-333333333333";
  const farmId="22222222-2222-4222-8222-222222222222";
  const id="11111111-1111-4111-8111-111111111111";
  cacheCloudActiveWorkerTime(userId,farmId,{id,clock_in:"2026-10-02T12:00:00.000Z"});
  assert.equal(cachedCloudActiveWorkerTime(userId,farmId)?.id,id);

  storeWorkerTime({
    id,farmId,userId,job:"Harvest",fieldName:"North",
    clockIn:"2026-10-02T12:00:00.000Z",clockOut:"2026-10-02T20:00:00.000Z",
    clockInLat:null,clockInLng:null,clockInAccuracyM:null,
    clockOutLat:null,clockOutLng:null,clockOutAccuracyM:null,
    mode:"update",queuedAt:"2026-10-02T20:00:00.000Z",
  });
  assert.equal(cachedCloudActiveWorkerTime(userId,farmId),null);
});

test("offline H-2A batches remain scoped and keep stable row ids", () => {
  installStorage();
  const batch = {
    id:"11111111-1111-4111-8111-111111111111",
    farmId:"22222222-2222-4222-8222-222222222222",
    userId:"33333333-3333-4333-8333-333333333333",
    queuedAt:"2026-10-02T12:00:00.000Z",
    rows:[{
      id:"77777777-7777-4777-8777-777777777777",
      farm_id:"22222222-2222-4222-8222-222222222222",
      worker_id:"55555555-5555-4555-8555-555555555555",
      work_date:"2026-10-02",
      hours_worked:8,
    }],
  };
  storeH2aDailyBatch(batch);
  const rows=h2aDailyBatches(batch.userId,batch.farmId);
  assert.equal(rows.length,1);
  assert.equal(rows[0].rows[0].id,"77777777-7777-4777-8777-777777777777");
  assert.equal(h2aDailyBatches(batch.userId,"66666666-6666-4666-8666-666666666666").length,0);
});

test("H-2A retry classifier queues connectivity failures but not authorization failures", () => {
  assert.equal(isRetryableH2aSyncError(new Error("Failed to fetch")),true);
  assert.equal(isRetryableH2aSyncError({status:503,message:"service unavailable"}),true);
  assert.equal(isRetryableH2aSyncError({status:403,message:"permission denied"}),false);
  assert.equal(isRetryableH2aSyncError({status:400,message:"invalid record"}),false);
});

test("field cache is isolated by account as well as farm", () => {
  installStorage();
  localStorage.setItem(
    "farmvoice-fields:user-a:farm-1",
    JSON.stringify([{id:"field-a",farm_id:"farm-1",name:"Private A"}]),
  );
  localStorage.setItem(
    "farmvoice-fields:user-b:farm-1",
    JSON.stringify([{id:"field-b",farm_id:"farm-1",name:"Private B"}]),
  );
  assert.equal(cachedFields("user-a","farm-1")[0].id,"field-a");
  assert.equal(cachedFields("user-b","farm-1")[0].id,"field-b");
});
