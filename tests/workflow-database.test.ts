import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const root = new URL("../", import.meta.url);
const owner = "11111111-1111-4111-8111-111111111111",
  worker = "22222222-2222-4222-8222-222222222222",
  farm = "33333333-3333-4333-8333-333333333333",
  ownerB = "44444444-4444-4444-8444-444444444444",
  farmB = "55555555-5555-4555-8555-555555555555",
  stranger = "66666666-6666-4666-8666-666666666666";
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;`,
  );
  // pgcrypto is supplied by Supabase; PGlite has built-in gen_random_uuid.
  await db.exec(
    (await readFile(new URL("supabase/schema.sql", root), "utf8")).replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  for (const file of [
    "20260926_browser_worker_setup.sql",
    "20260929184308_subscriptions_and_ai_quota.sql",
    "20260929202500_subscription_delete_enforcement.sql",
    "20260930010056_review_workflow_integrity.sql",
    "20260930010706_core_crew_records.sql",
  ])
    await db.exec(
      await readFile(new URL(`supabase/migrations/${file}`, root), "utf8"),
    );
  await db.exec(
    `grant select,insert,update,delete on farms,farm_members,fields,farm_records,time_entries,shifts,field_history_events to authenticated;insert into auth.users values('${owner}'),('${worker}'),('${ownerB}'),('${stranger}');insert into farms(id,name,join_code,owner_user_id) values('${farm}','Farm A','AAAAAA','${owner}'),('${farmB}','Farm B','BBBBBB','${ownerB}');insert into farm_members(farm_id,user_id,role,employee_number) values('${farm}','${owner}','owner',null),('${farm}','${worker}','worker','A001'),('${farmB}','${ownerB}','owner',null);`,
  );
  return db;
}
async function as(db: PGlite, id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
test("real core schema: RLS reads, forged approval denial, owner review, correct farm joins", async () => {
  const db = await setup();
  try {
    await as(db, worker);
    assert.equal((await db.query("select * from farms")).rows.length, 1);
    assert.equal((await db.query("select * from farm_members")).rows.length, 1);
    await assert.rejects(
      db.exec(
        `insert into time_entries(farm_id,worker_user_id,clock_in,clock_out,approval_status,reviewed_by) values('${farm}','${worker}','2026-09-29 08:00Z','2026-09-29 16:00Z','approved','${owner}')`,
      ),
      /pending/,
    );
    await db.exec(
      `insert into time_entries(id,farm_id,worker_user_id,clock_in) values('77777777-7777-4777-8777-777777777777','${farm}','${worker}','2026-09-29 08:00Z');update time_entries set clock_out='2026-09-29 16:00Z';`,
    );
    await assert.rejects(
      db.exec("update time_entries set approval_status='approved'"),
      /Owner review/,
    );
    await as(db, owner);
    await db.exec("update time_entries set approval_status='approved'");
    const row = (
      await db.query<{ reviewed_by: string }>(
        "select reviewed_by from time_entries",
      )
    ).rows[0];
    assert.equal(row.reviewed_by, owner);
    await as(db, stranger);
    assert.equal((await db.query("select * from farms")).rows.length, 0);
    assert.equal((await db.query("select * from time_entries")).rows.length, 0);
    await as(db, worker);
    await assert.rejects(
      db.query("select public.join_farm_by_code('INVALID',null)"),
      /not found/,
    );
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select public.join_farm_by_code('BBBBBB','B001') as id",
        )
      ).rows[0].id,
      farmB,
    );
    assert.equal(
      (
        await db.query<{ employee_number: string }>(
          `select employee_number from farm_members where farm_id='${farm}'`,
        )
      ).rows[0].employee_number,
      "A001",
    );
  } finally {
    await db.close();
  }
});
test("record revisions preserve originals and reject unreasoned confirmed changes", async () => {
  const db = await setup();
  try {
    await as(db, owner);
    await db.exec(
      `insert into farm_records(id,farm_id,created_by,record_type,status,payload) values('77777777-7777-4777-8777-777777777777','${farm}','${owner}','purchase','draft','{"item":"Seed"}');update farm_records set status='confirmed';`,
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from farm_records",
        )
      ).rows[0].revision,
      2,
    );
    assert.equal(
      (await db.query("select * from farm_record_revisions")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec(`update farm_records set payload='{"item":"Other"}'`),
      /corrections need a reason/,
    );
    await db.exec(
      `update farm_records set payload='{"item":"Other"}',change_reason='Correct product name';`,
    );
    assert.equal(
      (await db.query("select * from farm_record_revisions")).rows.length,
      2,
    );
    await assert.rejects(
      db.exec("delete from farm_record_revisions"),
      /permission denied/,
    );
    await as(db, stranger);
    assert.equal(
      (await db.query("select * from farm_record_revisions")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("crew entry is atomic, idempotent, farm scoped and separately approved", async () => {
  const db = await setup();
  try {
    await as(db, owner);
    const person = "77777777-7777-4777-8777-777777777777";
    await db.exec(
      `insert into crew_workers(id,farm_id,name,employee_number) values('${person}','${farm}','Ana','C001');insert into crew_leaders values('${farm}','${worker}');`,
    );
    await as(db, worker);
    const entry = {
      id: "88888888-8888-4888-8888-888888888888",
      worker_id: person,
      clock_in: "2026-09-29T08:00:00Z",
      clock_out: "2026-09-29T16:00:00Z",
      break_minutes: 30,
      job: "Harvest",
      field_name: "North",
      supervisor_lat: null,
      supervisor_lng: null,
    };
    await db.query("select submit_crew_time($1,$2)", [
      farm,
      JSON.stringify([entry]),
    ]);
    await db.query("select submit_crew_time($1,$2)", [
      farm,
      JSON.stringify([entry]),
    ]);
    assert.equal(
      (await db.query("select * from crew_time_entries")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update crew_time_entries set approval_status='approved' returning id",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select submit_crew_time($1,$2)", [
        farmB,
        JSON.stringify([entry]),
      ]),
      /Crew access/,
    );
    const second = { ...entry, id: "99999999-9999-4999-8999-999999999999" };
    await assert.rejects(
      db.query("select submit_crew_time($1,$2)", [
        farm,
        JSON.stringify([
          second,
          { ...entry, id: crypto.randomUUID(), break_minutes: 999 },
        ]),
      ]),
      /check constraint/,
    );
    assert.equal(
      (await db.query("select * from crew_time_entries")).rows.length,
      1,
    );
    await as(db, owner);
    await db.exec("update crew_time_entries set approval_status='approved'");
    assert.equal(
      (await db.query("select * from crew_review_events")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec("update crew_time_entries set break_minutes=0"),
      /immutable/,
    );
    await as(db, stranger);
    assert.equal(
      (await db.query("select * from crew_time_entries")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("storage accounting rolls back over-quota uploads and isolates farm usage", async () => {
  const db = await setup();
  try {
    await db.exec(
      `create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);insert into storage.objects(bucket_id,name,metadata) values('farm-photo-evidence','${farm}/before.jpg','{"size":40}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "supabase/migrations/20260930011259_farm_storage_allowance.sql",
          root,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `update private.farm_storage_usage set limit_bytes=100 where farm_id='${farm}';`,
    );
    await as(db, owner);
    assert.equal(
      Number(
        (
          await db.query<{ used_bytes: number }>(
            "select * from farm_storage_status($1)",
            [farm],
          )
        ).rows[0].used_bytes,
      ),
      40,
    );
    await assert.rejects(
      db.query("select * from farm_storage_status($1)", [farmB]),
      /Farm access/,
    );
    await db.exec("reset role");
    await db.exec(
      `insert into storage.objects(bucket_id,name,metadata) values('h2a-documents','${farm}/contract.pdf','{"size":50}');`,
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name,metadata) values('farm-photo-evidence','${farm}/over.jpg','{"size":11}');`,
      ),
      /allowance reached/,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      2,
    );
    assert.equal(
      Number(
        (
          await db.query<{ used_bytes: number }>(
            `select used_bytes from private.farm_storage_usage where farm_id='${farm}'`,
          )
        ).rows[0].used_bytes,
      ),
      90,
    );
    await assert.rejects(
      db.exec(
        `update storage.objects set name='${farmB}/moved.jpg' where name like '%before.jpg'`,
      ),
      /Move files/,
    );
    await db.exec(
      `update storage.objects set metadata='{"size":45}' where name like '%before.jpg';delete from storage.objects where name like '%contract.pdf';`,
    );
    assert.equal(
      Number(
        (
          await db.query<{ used_bytes: number }>(
            `select used_bytes from private.farm_storage_usage where farm_id='${farm}'`,
          )
        ).rows[0].used_bytes,
      ),
      45,
    );
    await as(db, stranger);
    await assert.rejects(
      db.query("select * from farm_storage_status($1)", [farm]),
      /Farm access/,
    );
  } finally {
    await db.close();
  }
});

test("receipt timestamp cannot be forged; capture bounds and legacy times are honest", async () => {
 const db = await setup();
 try {
  await db.exec("create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb)");
  await db.exec(await readFile(new URL("supabase/migrations/20260930011259_farm_storage_allowance.sql",root),"utf8"));
  const qboSchema = await readFile(new URL("supabase/quickbooks_integration.sql",root),"utf8");
  await db.exec(qboSchema.match(/create table if not exists public.quickbooks_employee_mappings \([\s\S]*?\n\);/)![0]);
  await db.exec("grant select,insert,update on quickbooks_employee_mappings to authenticated");
  await db.exec(await readFile(new URL("supabase/migrations/20260930205744_record_receipt_and_crew_billing.sql",root),"utf8"));
  await as(db,owner);
  const insert = (time: string) => db.exec(`insert into farm_records(farm_id,created_by,record_type,status,payload,created_at,received_at) values('${farm}','${owner}','purchase','draft','{}',${time},'2000-01-01')`);
  await assert.rejects(insert("now()-interval '31 days'"),/Capture time/);
  await assert.rejects(insert("now()+interval '6 minutes'"),/Capture time/);
  await insert("now()-interval '29 days'");
  assert.equal((await db.query<{fresh:boolean}>("select received_at > now()-interval '1 minute' as fresh from farm_records")).rows[0].fresh,true);
  await assert.rejects(db.exec("update farm_records set received_at='2000-01-01'"),/immutable/);
  assert.equal((await db.query<{limit_bytes:number}>(`select * from farm_storage_status('${farm}')`)).rows[0].limit_bytes,10000000000);
  await db.exec(`insert into crew_workers(id,farm_id,name,employee_number) values('77777777-7777-4777-8777-777777777777','${farm}','Crew member','C1');insert into crew_time_entries(id,farm_id,worker_id,clock_in,clock_out,break_minutes,job) values('88888888-8888-4888-8888-888888888888','${farm}','77777777-7777-4777-8777-777777777777',now()-interval '8 hours',now(),30,'Harvest');update crew_time_entries set approval_status='approved';update crew_time_entries set qbo_sync_status='syncing';`);
  await assert.rejects(db.exec("update crew_time_entries set approval_status='rejected',review_reason='Wrong hours'"),/Synced crew/);
  await db.exec("update crew_time_entries set qbo_sync_status='synced',qbo_time_activity_id='qbo1'");
  await assert.rejects(db.exec("update crew_time_entries set break_minutes=0"),/immutable/);
  await db.exec(`insert into quickbooks_employee_mappings(farm_id,worker_user_id,quickbooks_employee_id,created_by) values('${farm}','${worker}','qbo-employee','${owner}')`);
  await assert.rejects(db.exec(`insert into quickbooks_crew_mappings(farm_id,worker_id,quickbooks_employee_id,created_by) values('${farm}','77777777-7777-4777-8777-777777777777','qbo-employee','${owner}')`),/already mapped/);
  await db.exec(`insert into quickbooks_crew_mappings(farm_id,worker_id,quickbooks_employee_id,created_by) values('${farm}','77777777-7777-4777-8777-777777777777','qbo-crew','${owner}')`);
  await assert.rejects(db.exec(`update quickbooks_employee_mappings set quickbooks_employee_id='qbo-crew' where farm_id='${farm}'`),/already mapped/);
  await as(db,worker);
  assert.equal((await db.query("select * from quickbooks_crew_mappings")).rows.length,0);
 } finally { await db.close(); }
});
