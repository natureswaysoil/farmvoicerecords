create schema if not exists private;
create table public.farm_billing (
  farm_id uuid primary key references public.farms(id) on delete cascade,
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'trialing',
  core_enabled boolean not null default false,
  h2a_enabled boolean not null default false,
  paid_through timestamptz,
  h2a_paid_through timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.farm_billing enable row level security;
create policy "members read billing" on public.farm_billing for select to authenticated using (
 exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=auth.uid()) or
 exists(select 1 from public.farm_members m where m.farm_id=farm_billing.farm_id and m.user_id=auth.uid())
);
revoke all on public.farm_billing from anon, authenticated;
grant select on public.farm_billing to authenticated;
grant all on public.farm_billing to service_role;
insert into public.farm_billing(farm_id) select id from public.farms on conflict do nothing;
create function private.start_farm_trial() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.farm_billing(farm_id) values(new.id); return new; end $$;
revoke all on function private.start_farm_trial() from public, anon, authenticated;
create trigger start_farm_trial after insert on public.farms for each row execute function private.start_farm_trial();
create function public.farm_plan_access(p_farm_id uuid, p_feature text default 'core') returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.farm_billing b where b.farm_id=p_farm_id
 and (exists(select 1 from public.farms f where f.id=p_farm_id and f.owner_user_id=auth.uid())
 or exists(select 1 from public.farm_members m where m.farm_id=p_farm_id and m.user_id=auth.uid()))
 and p_feature in ('core','h2a')
 and (b.trial_ends_at > now() or (b.status in ('active','trialing') and b.core_enabled and b.paid_through > now()
 and (p_feature='core' or (b.h2a_enabled and b.h2a_paid_through > now())))))
$$;
revoke all on function public.farm_plan_access(uuid,text) from public, anon;
grant execute on function public.farm_plan_access(uuid,text) to authenticated;
-- Restrictive policies supplement, never replace, existing authorization policies.
-- Reads/exports and clock-out remain available after expiry.
do $$ declare t record; feature text; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='farm_id'
 and (table_name in ('farm_records','fields','field_history_events','shifts','farm_photo_evidence') or table_name like 'h2a_%')
 loop
 feature := case when t.table_name like 'h2a_%' then 'h2a' else 'core' end;
 execute format('create policy subscription_insert on public.%I as restrictive for insert to authenticated with check (public.farm_plan_access(farm_id,%L))',t.table_name,feature);
 execute format('create policy subscription_update on public.%I as restrictive for update to authenticated using (public.farm_plan_access(farm_id,%L)) with check (public.farm_plan_access(farm_id,%L))',t.table_name,feature,feature);
 end loop;
end $$;
create table private.record_ai_usage(user_id uuid not null references auth.users(id) on delete cascade, bucket timestamptz not null, requests integer not null, primary key(user_id,bucket));
alter table private.record_ai_usage enable row level security;
create function public.consume_record_ai_request(p_farm_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare used integer; begin
 if auth.uid() is null or not public.farm_plan_access(p_farm_id,'core') then return false; end if;
 insert into private.record_ai_usage(user_id,bucket,requests) values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id,bucket) do update set requests=private.record_ai_usage.requests+1 where private.record_ai_usage.requests < 30 returning requests into used;
 delete from private.record_ai_usage where user_id=auth.uid() and bucket < now()-interval '2 days';
 return used is not null;
end $$;
revoke all on function public.consume_record_ai_request(uuid) from public,anon;
grant execute on function public.consume_record_ai_request(uuid) to authenticated;
-- Security-definer RPC writes must also respect subscriptions. Authenticated
-- reads remain governed by existing policies; service jobs are unaffected.
create function private.require_farm_write_plan() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null and not public.farm_plan_access(new.farm_id,case when tg_table_name like 'h2a_%' then 'h2a' else 'core' end) then
  raise exception 'Trial or subscription required for this write' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.require_farm_write_plan() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='farm_id'
 and (table_name in ('farm_records','fields','field_history_events','shifts','farm_photo_evidence') or table_name like 'h2a_%') loop
 execute format('create trigger require_farm_write_plan before insert or update on public.%I for each row execute function private.require_farm_write_plan()',t.table_name);
 end loop;
end $$;
alter table public.farm_billing add column checkout_lock_until timestamptz not null default '-infinity';

alter table public.farm_billing add column webhook_lock_until timestamptz not null default '-infinity';
-- New shifts cannot start after expiry, while clock-out and review of existing
-- time remain available to avoid stranding a worker or their pay records.
create policy subscription_insert on public.time_entries as restrictive for insert to authenticated
with check(public.farm_plan_access(farm_id,'core'));
create trigger require_farm_write_plan before insert on public.time_entries
for each row execute function private.require_farm_write_plan();
