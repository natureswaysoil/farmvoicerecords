import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("database enforces trials, H-2A entitlement, ownership, quota and definer writes", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    stranger = "22222222-2222-4222-8222-222222222222",
    farm = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.farms(id uuid primary key,owner_user_id uuid);create table public.farm_members(farm_id uuid,user_id uuid);create table public.farm_records(id uuid default gen_random_uuid(),farm_id uuid);create table public.time_entries(farm_id uuid);create table public.h2a_documents(id uuid default gen_random_uuid(),farm_id uuid);alter table farm_records enable row level security;alter table h2a_documents enable row level security;create policy baseline on farm_records for all to authenticated using(true) with check(true);create policy baseline on h2a_documents for all to authenticated using(true) with check(true);grant select on farms,farm_members to authenticated;grant all on farm_records,h2a_documents to authenticated;insert into auth.users values('${owner}'),('${stranger}');insert into farms values('${farm}','${owner}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260929184308_subscriptions_and_ai_quota.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const allowed = async (feature = "core") =>
      (
        await db.query<{ ok: boolean }>(
          `select public.farm_plan_access($1,$2) as ok`,
          [farm, feature],
        )
      ).rows[0].ok;
    assert.equal(await allowed(), true);
    assert.equal(await allowed("h2a"), true);
    await db.exec(`insert into farm_records(farm_id) values('${farm}');`);
    for (let i = 0; i < 30; i++)
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            `select public.consume_record_ai_request($1) as ok`,
            [farm],
          )
        ).rows[0].ok,
        true,
      );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          `select public.consume_record_ai_request($1) as ok`,
          [farm],
        )
      ).rows[0].ok,
      false,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${stranger}',false)`,
    );
    assert.equal(await allowed(), false);
    await assert.rejects(() =>
      db.exec(`insert into farm_records(farm_id) values('${farm}')`),
    );
    await db.exec(
      `reset role;update farm_billing set trial_ends_at=now()-interval '1 day';set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    assert.equal(await allowed(), false);
    assert.equal((await db.query("select * from farm_records")).rows.length, 1);
    await assert.rejects(() =>
      db.exec(`insert into farm_records(farm_id) values('${farm}')`),
    );
    await db.exec(
      `reset role;update farm_billing set status='active',core_enabled=true,paid_through=now()+interval '1 month';set role authenticated;`,
    );
    assert.equal(await allowed(), true);
    assert.equal(await allowed("h2a"), false);
    await assert.rejects(() =>
      db.exec(`insert into h2a_documents(farm_id) values('${farm}')`),
    );
    await assert.rejects(() =>
      db.exec(`update farm_billing set h2a_enabled=true`),
    );
    await db.exec(
      `reset role;update farm_billing set h2a_enabled=true,h2a_paid_through=now()+interval '1 month';create function public.test_definer_write() returns void language sql security definer set search_path='' as $$ insert into public.h2a_documents(farm_id) values('${farm}') $$;set role authenticated;`,
    );
    assert.equal(await allowed("h2a"), true);
    await db.exec("select public.test_definer_write()");
    await db.exec(
      `reset role;update farm_billing set status='canceled';set role authenticated;`,
    );
    await assert.rejects(() => db.exec("select public.test_definer_write()"));
  } finally {
    await db.close();
  }
});
