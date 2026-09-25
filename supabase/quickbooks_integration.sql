-- QuickBooks integration schema.
-- Applied to the FarmVoice Records Supabase project on 2026-09-25.

create table if not exists public.quickbooks_connections (
  farm_id uuid primary key references public.farms(id) on delete cascade,
  realm_id text not null,
  company_name text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  connected_by uuid not null references auth.users(id) on delete restrict,
  refresh_lock_token uuid,
  refresh_lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quickbooks_employee_mappings (
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  quickbooks_employee_id text not null,
  quickbooks_employee_name text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (farm_id, worker_user_id),
  unique (farm_id, quickbooks_employee_id)
);

alter table public.quickbooks_connections
  add column if not exists refresh_lock_token uuid,
  add column if not exists refresh_lock_expires_at timestamptz,
  add column if not exists reconnect_required boolean not null default false,
  add column if not exists last_auth_error text,
  add column if not exists last_auth_error_at timestamptz,
  add column if not exists last_intuit_tid text,
  add column if not exists last_api_at timestamptz;

alter table public.time_entries
  add column if not exists qbo_sync_status text not null default 'not_synced',
  add column if not exists qbo_time_activity_id text,
  add column if not exists qbo_realm_id text,
  add column if not exists qbo_synced_at timestamptz,
  add column if not exists qbo_sync_started_at timestamptz,
  add column if not exists qbo_sync_error text,
  add column if not exists qbo_intuit_tid text;

alter table public.quickbooks_connections enable row level security;
alter table public.quickbooks_employee_mappings enable row level security;

grant select, insert, update, delete on public.quickbooks_connections to authenticated;
grant select, insert, update, delete on public.quickbooks_employee_mappings to authenticated;

drop policy if exists "farm owners manage quickbooks connection" on public.quickbooks_connections;
create policy "farm owners manage quickbooks connection"
on public.quickbooks_connections
for all
to authenticated
using (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_connections.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_connections.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
);

drop policy if exists "farm owners manage quickbooks employee mappings" on public.quickbooks_employee_mappings;
create policy "farm owners manage quickbooks employee mappings"
on public.quickbooks_employee_mappings
for all
to authenticated
using (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_employee_mappings.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_employee_mappings.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
);


alter table public.farms
  add column if not exists timezone text not null default 'UTC';

create index if not exists qbo_connections_refresh_lock_idx
  on public.quickbooks_connections (refresh_lock_expires_at);

create index if not exists time_entries_qbo_status_idx
  on public.time_entries (farm_id, approval_status, qbo_sync_status, clock_in);

drop index if exists public.time_entries_one_open_per_worker_idx;
create unique index if not exists time_entries_one_open_per_worker_farm_idx
  on public.time_entries (farm_id, worker_user_id)
  where clock_out is null;

do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shifts_positive_duration'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_positive_duration check (ends_at > starts_at);
  end if;
end $;

create or replace function public.claim_quickbooks_refresh(p_farm_id uuid, p_token uuid)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  with claimed as (
    update public.quickbooks_connections
       set refresh_lock_token = p_token,
           refresh_lock_expires_at = now() + interval '60 seconds'
     where farm_id = p_farm_id
       and (refresh_lock_expires_at is null or refresh_lock_expires_at < now())
    returning 1
  )
  select exists(select 1 from claimed);
$$;

revoke all on function public.claim_quickbooks_refresh(uuid,uuid) from public;
revoke all on function public.claim_quickbooks_refresh(uuid,uuid) from anon;
grant execute on function public.claim_quickbooks_refresh(uuid,uuid) to authenticated;


-- Re-apply the team/time security rules for existing FarmVoice databases.
alter table public.shifts enable row level security;
alter table public.time_entries enable row level security;

drop policy if exists "members read shifts" on public.shifts;
drop policy if exists "owners or assigned workers read shifts" on public.shifts;
create policy "owners or assigned workers read shifts"
on public.shifts
for select
to authenticated
using (
  worker_user_id = (select auth.uid())
  or exists (
    select 1 from public.farms f
    where f.id = shifts.farm_id
      and f.owner_user_id = (select auth.uid())
  )
);

create or replace function public.guard_worker_time_entry_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if exists (
    select 1 from public.farms f
    where f.id = old.farm_id
      and f.owner_user_id = (select auth.uid())
  ) then
    return new;
  end if;

  if old.worker_user_id <> (select auth.uid()) then
    raise exception 'Workers may update only their own time entries';
  end if;

  if new.farm_id is distinct from old.farm_id
     or new.worker_user_id is distinct from old.worker_user_id
     or new.shift_id is distinct from old.shift_id
     or new.job is distinct from old.job
     or new.field_name is distinct from old.field_name
     or new.field_id is distinct from old.field_id
     or new.clock_in is distinct from old.clock_in
     or new.clock_in_lat is distinct from old.clock_in_lat
     or new.clock_in_lng is distinct from old.clock_in_lng
     or new.clock_in_accuracy_m is distinct from old.clock_in_accuracy_m
     or new.photo_path is distinct from old.photo_path
     or new.approval_status is distinct from old.approval_status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.qbo_sync_status is distinct from old.qbo_sync_status
     or new.qbo_time_activity_id is distinct from old.qbo_time_activity_id
     or new.qbo_realm_id is distinct from old.qbo_realm_id
     or new.qbo_synced_at is distinct from old.qbo_synced_at
     or new.qbo_sync_started_at is distinct from old.qbo_sync_started_at
     or new.qbo_sync_error is distinct from old.qbo_sync_error
     or new.qbo_intuit_tid is distinct from old.qbo_intuit_tid
     or new.created_at is distinct from old.created_at then
    raise exception 'Workers may only complete clock-out fields';
  end if;

  if old.clock_out is not null then
    raise exception 'Completed time entries cannot be changed by workers';
  end if;

  if new.clock_out is null then
    raise exception 'Clock-out time is required';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_worker_time_entry_update_trigger on public.time_entries;
create trigger guard_worker_time_entry_update_trigger
before update on public.time_entries
for each row execute function public.guard_worker_time_entry_update();


create table if not exists public.quickbooks_error_logs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  operation text not null,
  endpoint text,
  http_status integer,
  intuit_tid text,
  error_code text,
  error_message text not null,
  error_detail text,
  reconnect_required boolean not null default false,
  context jsonb not null default '{}'::jsonb
);

alter table public.quickbooks_error_logs enable row level security;
grant select, insert on public.quickbooks_error_logs to authenticated;

drop policy if exists "farm owners read quickbooks error logs" on public.quickbooks_error_logs;
create policy "farm owners read quickbooks error logs"
on public.quickbooks_error_logs
for select
to authenticated
using (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_error_logs.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
);

drop policy if exists "farm owners insert quickbooks error logs" on public.quickbooks_error_logs;
create policy "farm owners insert quickbooks error logs"
on public.quickbooks_error_logs
for insert
to authenticated
with check (
  exists (
    select 1 from public.farm_members fm
    where fm.farm_id = quickbooks_error_logs.farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  )
);

create index if not exists quickbooks_error_logs_farm_time_idx
  on public.quickbooks_error_logs (farm_id, occurred_at desc);
