-- John Deere Operations Center connection metadata and field mappings.

create table if not exists public.john_deere_connections (
  farm_id uuid primary key references public.farms(id) on delete cascade,
  connected_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'connected'
    check (status in ('connected','needs_organization_access','error','disconnected')),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  organizations jsonb not null default '[]'::jsonb,
  selected_org_id text,
  selected_org_name text,
  connections_url text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.john_deere_field_mappings (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  org_id text not null,
  deere_field_id text not null,
  deere_field_name text not null,
  field_id uuid not null references public.fields(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(farm_id, org_id, deere_field_id)
);

create index if not exists john_deere_field_mappings_field_idx
  on public.john_deere_field_mappings(farm_id, field_id);

alter table public.john_deere_connections enable row level security;
alter table public.john_deere_field_mappings enable row level security;

revoke all on table public.john_deere_connections from anon, authenticated;
revoke all on table public.john_deere_field_mappings from anon, authenticated;

grant select, insert, update, delete on table public.john_deere_connections to authenticated;
grant select, insert, update, delete on table public.john_deere_field_mappings to authenticated;

create policy "owners read john deere connections"
on public.john_deere_connections
for select to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_connections.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create policy "owners create john deere connections"
on public.john_deere_connections
for insert to authenticated
with check (
  connected_by = (select auth.uid())
  and exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_connections.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create policy "owners update john deere connections"
on public.john_deere_connections
for update to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_connections.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_connections.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create policy "owners delete john deere connections"
on public.john_deere_connections
for delete to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_connections.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create policy "owners read john deere field mappings"
on public.john_deere_field_mappings
for select to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_field_mappings.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create policy "owners create john deere field mappings"
on public.john_deere_field_mappings
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_field_mappings.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
  and exists (
    select 1 from public.fields f
    where f.id = john_deere_field_mappings.field_id
      and f.farm_id = john_deere_field_mappings.farm_id
  )
);

create policy "owners update john deere field mappings"
on public.john_deere_field_mappings
for update to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_field_mappings.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_field_mappings.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
  and exists (
    select 1 from public.fields f
    where f.id = john_deere_field_mappings.field_id
      and f.farm_id = john_deere_field_mappings.farm_id
  )
);

create policy "owners delete john deere field mappings"
on public.john_deere_field_mappings
for delete to authenticated
using (
  exists (
    select 1 from public.farm_members m
    where m.farm_id = john_deere_field_mappings.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

drop trigger if exists require_farm_write_plan on public.john_deere_connections;
create trigger require_farm_write_plan
before insert or update or delete on public.john_deere_connections
for each row execute function private.require_farm_write_plan();

drop trigger if exists require_farm_write_plan on public.john_deere_field_mappings;
create trigger require_farm_write_plan
before insert or update or delete on public.john_deere_field_mappings
for each row execute function private.require_farm_write_plan();
