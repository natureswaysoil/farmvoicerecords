import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const owner="11111111-1111-4111-8111-111111111111", worker="22222222-2222-4222-8222-222222222222", farm="33333333-3333-4333-8333-333333333333";
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create schema extensions;
 -- Digest fixture exercises equality and privileges; production uses pgcrypto SHA-256.
 create function extensions.digest(bytea,text) returns bytea language sql as $$ select decode(md5($1),'hex') $$;`);
 const root=new URL('../supabase/',import.meta.url);
 await db.exec((await readFile(new URL('schema.sql',root),'utf8')).replace('create extension if not exists pgcrypto;',''));
 for(const file of ['20260926_browser_worker_setup.sql','20260929184308_subscriptions_and_ai_quota.sql','20260929202500_subscription_delete_enforcement.sql','20260930010056_review_workflow_integrity.sql','20261003004500_john_deere_connections.sql','20261003213844_production_readiness_guards.sql'])
  await db.exec(await readFile(new URL(`migrations/${file}`,root),'utf8'));
 await db.exec(`grant select,insert,update,delete on farms,farm_members,fields,farm_records to authenticated;
 insert into auth.users values('${owner}'),('${worker}');insert into farms(id,name,join_code,owner_user_id) values('${farm}','Test','TESTAA','${owner}');
 insert into farm_members(farm_id,user_id,role) values('${farm}','${owner}','owner'),('${farm}','${worker}','worker');
 insert into vault.decrypted_secrets values('farmvoice_notification_cron_secret','test-only-secret');
 set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 return db;
}
const full={isRestrictedUse:true,applicatorName:'Alex',certificationNumber:'123',productName:'Product',epaRegNumber:'123-456',amountApplied:2,amountUnit:'oz',cropOrSite:'Corn',fieldLocation:'North',areaTreated:1,areaUnit:'acres',applicationDate:'2026-09-29'};
async function insert(db:PGlite,payload:object,type='pesticide',status='confirmed'){
 return db.query(`insert into farm_records(farm_id,created_by,record_type,status,payload) values($1,$2,$3,$4,$5::jsonb) returning id`,[farm,owner,type,status,JSON.stringify(payload)]);
}
test('direct authenticated database writes cannot confirm incomplete or malformed pesticide/purchase records',async()=>{
 const db=await setup();try{
  for(const payload of [{},{isRestrictedUse:true},{...full,amountApplied:'Infinity'},{...full,areaTreated:'NaN'},{...full,applicationDate:'2026-02-30'},{...full,epaRegNumber:'bad'},{...full,applicatorName:{}},{...full,isRestrictedUse:'false'},{...full,isSpotTreatment:true,areaTreated:0.1}])
   await assert.rejects(insert(db,payload),e=>(e as any).code==='23514');
  await insert(db,full);await insert(db,{isRestrictedUse:false});await insert(db,{},'pesticide','draft');
  await assert.rejects(db.exec("update farm_records set status='confirmed' where status='draft'"),/requires|positive/);
  await assert.rejects(insert(db,{},'purchase'),/quantity/);
  const purchase={vendor:'Supplier',item:'Seed',purchaseDate:'2026-09-29',quantity:1,unit:'bag',totalCost:0};
  await insert(db,purchase,'purchase');
  for(const p of [{...purchase,quantity:0},{...purchase,totalCost:'NaN'},{...purchase,purchaseDate:'2026-02-29'}]) await assert.rejects(insert(db,p,'purchase'));
 }finally{await db.close();}
});
test('spot-treatment checklist accepts supported units and enforces qualification and location',async()=>{
 const db=await setup();try{
  const spot={isRestrictedUse:true,isSpotTreatment:true,productName:'Product',epaRegNumber:'123-456',amountApplied:'1',amountUnit:'oz',fieldLocation:'Spot treatment: North weeds',applicationDate:'2026-09-29',areaTreated:10,areaUnit:'sq ft'};
  for(const [areaTreated,areaUnit] of [[10,'sq ft'],[1,'sq yd'],[0.01,'ha'],[0.01,'acres']]) await insert(db,{...spot,areaTreated,areaUnit});
  for(const p of [{...spot,isGreenhouseOrNursery:true},{...spot,areaUnit:'unknown'},{...spot,fieldLocation:'North'},{...spot,areaTreated:4356}]) await assert.rejects(insert(db,p));
 }finally{await db.close();}
});
test('Deere lease is exclusive, RLS-scoped, recoverable and disconnect works after trial expires',async()=>{
 const db=await setup();try{
  await db.exec(`insert into john_deere_connections(farm_id,connected_by,access_token_ciphertext,refresh_token_ciphertext,access_token_expires_at) values('${farm}','${owner}','encrypted','encrypted','2026-01-01');`);
  const first='44444444-4444-4444-8444-444444444444',second='55555555-5555-4555-8555-555555555555';
  const claim=async(token:string)=>(await db.query<{claimed:boolean}>('select claim_john_deere_refresh($1,$2) as claimed',[farm,token])).rows[0].claimed;
  assert.equal(await claim(first),true);assert.equal(await claim(second),false);
  await db.exec(`select set_config('request.jwt.claim.sub','${worker}',false)`);assert.equal(await claim(second),false);
  assert.equal((await db.query('delete from john_deere_connections returning farm_id')).rows.length,0);
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);update john_deere_connections set refresh_lock_expires_at=now()-interval '1 second'`);assert.equal(await claim(second),true);
  assert.equal((await db.query(`update john_deere_connections set access_token_ciphertext='stale' where refresh_lock_token=$1 returning farm_id`,[first])).rows.length,0);
  await db.exec(`reset role;update farm_billing set trial_ends_at=now()-interval '1 day';set role authenticated;`);
  await assert.rejects(db.exec("update john_deere_connections set last_error='test'"),/subscription/);
  assert.equal((await db.query('delete from john_deere_connections returning farm_id')).rows.length,1);
 }finally{await db.close();}
});
test('notification authorization helper is service-role only and fails closed',async()=>{
 const db=await setup();try{
  await assert.rejects(db.query("select notification_worker_authorize('test-only-secret')"),/permission denied/);
  await db.exec('reset role;set role service_role');
  for(const token of [null,'wrong']) assert.equal((await db.query<{ok:boolean}>('select notification_worker_authorize($1) as ok',[token])).rows[0].ok,false);
  assert.equal((await db.query<{ok:boolean}>('select notification_worker_authorize($1) as ok',['test-only-secret'])).rows[0].ok,true);
 }finally{await db.close();}
});
