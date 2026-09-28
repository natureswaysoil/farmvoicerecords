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
revoke all on table public.farm_photo_evidence from anon;
revoke all on table public.farm_photo_evidence from authenticated;
grant select, insert, update, delete on table public.farm_photo_evidence to authenticated;

create or replace function private.validate_farm_photo_evidence_context()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_farm_id uuid; v_inspection_id uuid;
begin
  if new.module <> 'h2a_housing' or new.record_type <> 'housing_inspection_item' then raise exception 'Photo evidence context is not enabled.'; end if;
  select i.farm_id,i.inspection_id into v_farm_id,v_inspection_id from public.h2a_housing_inspection_items i join public.h2a_housing_inspections hi on hi.id=i.inspection_id and hi.farm_id=i.farm_id where i.id=new.record_id;
  if v_farm_id is null or v_farm_id<>new.farm_id or v_inspection_id is distinct from new.parent_record_id then raise exception 'Photo evidence context does not match the housing inspection item.'; end if;
  if new.storage_bucket<>'h2a-housing-evidence' or new.storage_path not like concat(new.farm_id::text,'/',v_inspection_id::text,'/',new.record_id::text,'/%') then raise exception 'Photo evidence storage path does not match its housing context.'; end if;
  return new;
end;
$$;
revoke all on function private.validate_farm_photo_evidence_context() from public,anon,authenticated;
drop trigger if exists validate_farm_photo_evidence_context on public.farm_photo_evidence;
create trigger validate_farm_photo_evidence_context before insert or update of farm_id,module,record_type,record_id,parent_record_id,storage_bucket,storage_path on public.farm_photo_evidence for each row execute function private.validate_farm_photo_evidence_context();

drop policy if exists "farm photo evidence read" on public.farm_photo_evidence;
create policy "farm photo evidence read" on public.farm_photo_evidence for select to authenticated using (module='h2a_housing' and private.h2a_can_read(farm_id));
drop policy if exists "farm photo evidence insert" on public.farm_photo_evidence;
create policy "farm photo evidence insert" on public.farm_photo_evidence for insert to authenticated with check (module='h2a_housing' and private.h2a_can_read(farm_id) and captured_by=(select auth.uid()));
drop policy if exists "farm photo evidence update" on public.farm_photo_evidence;
create policy "farm photo evidence update" on public.farm_photo_evidence for update to authenticated using (module='h2a_housing' and private.h2a_can_read(farm_id) and (captured_by=(select auth.uid()) or private.h2a_is_owner(farm_id))) with check (module='h2a_housing' and private.h2a_can_read(farm_id) and (captured_by=(select auth.uid()) or private.h2a_is_owner(farm_id)));
drop policy if exists "farm photo evidence delete" on public.farm_photo_evidence;
create policy "farm photo evidence delete" on public.farm_photo_evidence for delete to authenticated using (module='h2a_housing' and private.h2a_can_read(farm_id) and (captured_by=(select auth.uid()) or private.h2a_is_owner(farm_id)));
comment on table public.farm_photo_evidence is 'Shared FarmVoice photo/evidence index. Module and record context are captured when the file is taken so evidence is routed automatically to the correct farm record.';
comment on column public.farm_photo_evidence.metadata is 'Context snapshot such as housing_id, requirement_code, field_id, equipment_id, pesticide application id, or other module-specific identifiers.';
