import test from "node:test";
import assert from "node:assert/strict";
import { validCaptureTime } from "../src/lib/records/receipt.ts";
import { netDuration } from "../src/lib/quickbooks-time.ts";
import { recordsCsv, recordPacket } from "../src/lib/records/export.ts";
test("capture boundaries reject invalid, old, future dates",()=>{
 const now=Date.parse("2026-09-30T12:00:00Z");
 for(const delta of [-30*86400000,300000,0]) assert.equal(validCaptureTime(new Date(now+delta).toISOString(),now),true);
 for(const delta of [-30*86400000-1,300001]) assert.equal(validCaptureTime(new Date(now+delta).toISOString(),now),false);
 assert.equal(validCaptureTime("invalid",now),false);
});
test("QuickBooks net minutes subtract breaks across midnight",()=>{
 assert.deepEqual(netDuration("2026-09-29T22:00:00Z","2026-09-30T06:00:00Z",45),{hours:7,minutes:15});
 assert.throws(()=>netDuration("bad","bad",0));
 assert.throws(()=>netDuration("2026-09-30T08:00:00Z","2026-09-30T09:00:00Z",60));
});
test("exports show distinct capture and receipt times with readable labels",()=>{
 const rows=[{id:"1",record_type:"pesticide",status:"draft",created_at:"2026-09-29T12:00:00Z",received_at:"2026-09-30T12:00:00Z",payload:{epaRegistrationNumber:"123"}}];
 assert.match(recordsCsv(rows),/EPA registration number/);
 assert.match(recordsCsv(rows),/Server received time/);
 assert.match(recordPacket(rows),/2026-09-30T12:00:00Z/);
 assert.match(recordPacket([{...rows[0],received_at:null}]),/Unknown \(legacy record\)/);
});
