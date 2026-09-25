-- FarmVoice Records initial cloud schema.
-- Apply to a dedicated FarmVoice Supabase project.

create extension if not exists pgcrypto;

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  join_code text not null unique check (char_length(join_code) between 6 and 10),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  timezone text not null default 'UTC',
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

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  fsa_farm_number text not null,
  fsa_tract_number text not null,
  fsa_field_number text not null,
  area_type text not null default 'field' check (area_type in ('field','bed','greenhouse','pasture','orchard','block','other')),
  size_value numeric,
  size_unit text,
  current_crop text,
  previous_land_use text,
  planting_date date,
  harvest_date date,
  organic_status text check (organic_status is null or organic_status in ('not_organic','transition','certified_organic','exempt','unknown')),
  buffer_notes text,
  adjoining_land_notes text,
  boundary_notes text,
  management_notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(farm_id,fsa_farm_number,fsa_tract_number,fsa_field_number)
);

create table public.farm_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null,
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

create table public.field_history_events (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  event_type text not null check (event_type in ('crop','planting','harvest','input','land_use','organic_status','buffer','boundary','adjoining_land','management_change','note')),
  event_date date,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
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
  field_id uuid references public.fields(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  job text,
  field_name text,
  field_id uuid references public.fields(id) on delete set null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_accuracy_m double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_accuracy_m double precision,
  photo_path text,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  qbo_sync_status text not null default 'not_synced'
    check (qbo_sync_status in ('not_synced','syncing','synced','error')),
  qbo_time_activity_id text,
  qbo_realm_id text,
  qbo_synced_at timestamptz,
  qbo_sync_error text,
  created_at timestamptz not null default now()
);

create index shifts_farm_start_idx on public.shifts(farm_id, starts_at);
create index shifts_worker_user_idx on public.shifts(worker_user_id);
create index time_entries_farm_clock_idx on public.time_entries(farm_id, clock_in);
create index time_entries_worker_user_idx on public.time_entries(worker_user_id);
create index time_entries_qbo_status_idx on public.time_entries(farm_id, approval_status, qbo_sync_status, clock_in);
