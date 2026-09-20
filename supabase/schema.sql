-- FarmVoice Records initial cloud schema.
-- Apply to a dedicated FarmVoice Supabase project.

create extension if not exists pgcrypto;

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  join_code text not null unique check (char_length(join_code) between 6 and 10),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.farm_members (
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','worker')),
  employee_number text,
  created_at timestamptz not null default now(),
  primary key (farm_id,user_id),
  unique (farm_id,employee_number)
);

create table public.farm_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  record_type text not null check (record_type in ('pesticide','purchase')),
  status text not null check (status in ('draft','confirmed')),
  payload jsonb not null default '{}'::jsonb,
  recording_lat double precision,
  recording_lng double precision,
  recording_accuracy_m double precision,
  recording_captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  job text not null,
  field_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  jobsite_lat double precision,
  jobsite_lng double precision,
  radius_m integer check (radius_m is null or radius_m >= 25),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  job text,
  field_name text,
  clock_in timestamptz not null,
  clock_out timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_accuracy_m double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_accuracy_m double precision,
  photo_path text,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_records enable row level security;
alter table public.shifts enable row level security;
alter table public.time_entries enable row level security;

grant select,insert,update on public.farms to authenticated;
grant select,insert,update,delete on public.farm_members to authenticated;
grant select,insert,update on public.farm_records to authenticated;
grant select,insert,update,delete on public.shifts to authenticated;
grant select,insert,update on public.time_entries to authenticated;

create policy "farm members read farms" on public.farms for select to authenticated
using (exists(select 1 from public.farm_members m where m.farm_id=id and m.user_id=(select auth.uid())));
create policy "users create owned farms" on public.farms for insert to authenticated
with check (owner_user_id=(select auth.uid()));
create policy "owners update farms" on public.farms for update to authenticated
using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));

create policy "members read memberships" on public.farm_members for select to authenticated
using (user_id=(select auth.uid()) or exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=(select auth.uid())));
create policy "owners add memberships" on public.farm_members for insert to authenticated
with check (exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=(select auth.uid())));
create policy "owners update memberships" on public.farm_members for update to authenticated
using (exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=(select auth.uid())))
with check (exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=(select auth.uid())));
create policy "owners remove memberships" on public.farm_members for delete to authenticated
using (exists(select 1 from public.farms f where f.id=farm_id and f.owner_user_id=(select auth.uid())));

create policy "members read records" on public.farm_records for select to authenticated
using (exists(select 1 from public.farm_members m where m.farm_id=farm_records.farm_id and m.user_id=(select auth.uid())));
create policy "members create records" on public.farm_records for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.farm_members m where m.farm_id=farm_records.farm_id and m.user_id=(select auth.uid())));
create policy "creator or owner updates records" on public.farm_records for update to authenticated
using (created_by=(select auth.uid()) or exists(select 1 from public.farms f where f.id=farm_records.farm_id and f.owner_user_id=(select auth.uid())))
with check (exists(select 1 from public.farm_members m where m.farm_id=farm_records.farm_id and m.user_id=(select auth.uid())));

create policy "members read shifts" on public.shifts for select to authenticated
using (exists(select 1 from public.farm_members m where m.farm_id=shifts.farm_id and m.user_id=(select auth.uid())));
create policy "owners create shifts" on public.shifts for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.farms f where f.id=shifts.farm_id and f.owner_user_id=(select auth.uid())));
create policy "owners update shifts" on public.shifts for update to authenticated
using (exists(select 1 from public.farms f where f.id=shifts.farm_id and f.owner_user_id=(select auth.uid())))
with check (exists(select 1 from public.farms f where f.id=shifts.farm_id and f.owner_user_id=(select auth.uid())));
create policy "owners delete shifts" on public.shifts for delete to authenticated
using (exists(select 1 from public.farms f where f.id=shifts.farm_id and f.owner_user_id=(select auth.uid())));

create policy "members read time entries" on public.time_entries for select to authenticated
using (worker_user_id=(select auth.uid()) or exists(select 1 from public.farms f where f.id=time_entries.farm_id and f.owner_user_id=(select auth.uid())));
create policy "workers create own time" on public.time_entries for insert to authenticated
with check (worker_user_id=(select auth.uid()) and exists(select 1 from public.farm_members m where m.farm_id=time_entries.farm_id and m.user_id=(select auth.uid())));
create policy "worker or owner updates time" on public.time_entries for update to authenticated
using (worker_user_id=(select auth.uid()) or exists(select 1 from public.farms f where f.id=time_entries.farm_id and f.owner_user_id=(select auth.uid())))
with check (worker_user_id=(select auth.uid()) or exists(select 1 from public.farms f where f.id=time_entries.farm_id and f.owner_user_id=(select auth.uid())));

create index farm_members_user_idx on public.farm_members(user_id);
create index farm_records_farm_created_idx on public.farm_records(farm_id,created_at desc);
create index shifts_farm_start_idx on public.shifts(farm_id,starts_at);
create index time_entries_farm_clock_idx on public.time_entries(farm_id,clock_in desc);
