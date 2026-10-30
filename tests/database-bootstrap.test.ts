import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
// @ts-ignore Node executes the .mjs generator directly.
import {bootstrapSources,bootstrapSql} from '../scripts/database-bootstrap.mjs';
test('fresh project bootstrap replays every SQL source in dependency order',async()=>{
 const db=new PGlite();try{
  // Supabase-managed schemas/extensions are fixtures, not a hosted service emulation.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   grant usage on schema auth to authenticated;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner uuid,owner_id text);
   create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
   create schema extensions;set search_path=public,extensions;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
   create function extensions.digest(bytea,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;
   create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;create schema cron;create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text);
   create function cron.unschedule(text) returns boolean language plpgsql as $$begin delete from cron.job where jobname=$1;return true;end$$;
   create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;`);
  const sources=await bootstrapSources();
  assert.ok(sources.length >= 35);
  await db.exec((await bootstrapSql()).replace(/create extension if not exists (pgcrypto|pg_cron|pg_net)[^;]*;/gi,''));
  const [{count}]=(await db.query<{count:number}>("select count(*)::integer as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows;
  assert.ok(count>40);
  assert.equal((await db.query("select jobname from cron.job where jobname='farmvoice-h2a-housing-reminders'")).rows.length,1);
  assert.equal((await db.query("select id from storage.buckets where id='farm-photo-evidence'")).rows.length,1);
  assert.equal((await db.query("select 1 from pg_trigger where tgname='confirmed_record_payload_guard'")).rows.length,1);
 }finally{await db.close();}
});
