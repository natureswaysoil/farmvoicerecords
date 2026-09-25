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
  add column if not exists refresh_lock_expires_at timestamptz;

alter table public.time_entries
  add column if not exists qbo_sync_status text not null default 'not_synced',
  add column if not exists qbo_time_activity_id text,
  add column if not exists qbo_realm_id text,
  add column if not exists qbo_synced_at timestamptz,
  add column if not exists qbo_sync_started_at timestamptz,
  add column if not exists qbo_sync_error text;

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
