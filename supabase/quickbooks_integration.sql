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

alter table public.time_entries
  add column if not exists qbo_sync_status text not null default 'not_synced',
  add column if not exists qbo_time_activity_id text,
  add column if not exists qbo_synced_at timestamptz,
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
