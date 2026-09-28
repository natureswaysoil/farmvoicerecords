create table if not exists public.farm_photo_evidence (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  module text not null check (length(trim(module)) between 1 and 80),
  record_type text not null check (length(trim(record_type)) between 1 and 120),
  record_id uuid not null,
  parent_record_id uuid,
  category text not null default 'general' check (length(trim(category)) between 1 and 80),
  storage_bucket text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  captured_at timestamptz not null default now(),
  captured_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  gps_lat double precision check (gps_lat is null or gps_lat between -90 and 90),
  gps_lng double precision check (gps_lng is null or gps_lng between -180 and 180),
  gps_accuracy_m double precision check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  gps_captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);
create index if not exists farm_photo_evidence_context_idx on public.farm_photo_evidence(farm_id,module,record_type,record_id,captured_at desc);
create index if not exists farm_photo_evidence_parent_idx on public.farm_photo_evidence(farm_id,parent_record_id,captured_at desc) where parent_record_id is not null;
create index if not exists farm_photo_evidence_captured_by_idx on public.farm_photo_evidence(captured_by);
alter table public.farm_photo_evidence enable row level security;
drop policy if exists "farm photo evidence read" on public.farm_photo_evidence;
create policy "farm photo evidence read" on public.farm_photo_evidence for select to authenticated using (private.is_farm_member(farm_id));
drop policy if exists "farm photo evidence insert" on public.farm_photo_evidence;
create policy "farm photo evidence insert" on public.farm_photo_evidence for insert to authenticated with check (private.is_farm_member(farm_id) and captured_by=(select auth.uid()));
drop policy if exists "farm photo evidence update" on public.farm_photo_evidence;
create policy "farm photo evidence update" on public.farm_photo_evidence for update to authenticated using (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id)) with check (private.is_farm_member(farm_id) and (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id)));
drop policy if exists "farm photo evidence delete" on public.farm_photo_evidence;
create policy "farm photo evidence delete" on public.farm_photo_evidence for delete to authenticated using (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id));
comment on table public.farm_photo_evidence is 'Shared FarmVoice photo/evidence index. Module and record context are captured when the file is taken so evidence is routed automatically to the correct farm record.';
comment on column public.farm_photo_evidence.metadata is 'Context snapshot such as housing_id, requirement_code, field_id, equipment_id, pesticide application id, or other module-specific identifiers.';
