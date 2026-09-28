-- Extend Smart Photo Evidence to all user-facing FarmVoice record modules.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('farm-photo-evidence','farm-photo-evidence',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.farm_photo_target_farm(p_module text,p_record_type text,p_record_id uuid)
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare v_farm uuid;
begin
  case
    when p_module='records' and p_record_type='farm_record' then select farm_id into v_farm from public.farm_records where id=p_record_id;
    when p_module='fields' and p_record_type='field' then select farm_id into v_farm from public.fields where id=p_record_id;
    when p_module='fields' and p_record_type='field_history_event' then select farm_id into v_farm from public.field_history_events where id=p_record_id;
    when p_module='team' and p_record_type='shift' then select farm_id into v_farm from public.shifts where id=p_record_id;
    when p_module='team' and p_record_type='time_entry' then select farm_id into v_farm from public.time_entries where id=p_record_id;
    when p_module='h2a' and p_record_type='contract' then select farm_id into v_farm from public.h2a_contracts where id=p_record_id;
    when p_module='h2a' and p_record_type='worker' then select farm_id into v_farm from public.h2a_workers where id=p_record_id;
    when p_module='h2a' and p_record_type='daily_record' then select farm_id into v_farm from public.h2a_daily_records where id=p_record_id;
    when p_module='h2a' and p_record_type='document' then select farm_id into v_farm from public.h2a_documents where id=p_record_id;
    when p_module='h2a' and p_record_type='housing' then select farm_id into v_farm from public.h2a_housing where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_assignment' then select farm_id into v_farm from public.h2a_housing_assignments where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_inspection' then select farm_id into v_farm from public.h2a_housing_inspections where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_inspection_item' then select farm_id into v_farm from public.h2a_housing_inspection_items where id=p_record_id;
    when p_module='h2a' and p_record_type='notification' then select farm_id into v_farm from public.h2a_notifications where id=p_record_id;
    when p_module='h2a' and p_record_type='pay_statement' then select farm_id into v_farm from public.h2a_pay_statements where id=p_record_id;
    when p_module='h2a' and p_record_type='recruitment' then select farm_id into v_farm from public.h2a_recruitment where id=p_record_id;
    when p_module='h2a' and p_record_type='separation' then select farm_id into v_farm from public.h2a_separations where id=p_record_id;
    when p_module='h2a' and p_record_type='training' then select farm_id into v_farm from public.h2a_training where id=p_record_id;
    when p_module='h2a' and p_record_type='transportation' then select farm_id into v_farm from public.h2a_transportation where id=p_record_id;
    when p_module='h2a' and p_record_type='wage_rate' then select farm_id into v_farm from public.h2a_wage_rates where id=p_record_id;
    when p_module='h2a' and p_record_type='acknowledgment' then select farm_id into v_farm from public.h2a_acknowledgments where id=p_record_id;
    when p_module='h2a_housing' and p_record_type='housing_inspection_item' then select farm_id into v_farm from public.h2a_housing_inspection_items where id=p_record_id;
    else return null;
  end case;
  return v_farm;
end;
$$;
revoke all on function private.farm_photo_target_farm(text,text,uuid) from public,anon,authenticated;

create or replace function private.farm_photo_can_access(p_farm_id uuid,p_module text,p_record_type text,p_record_id uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_target_farm uuid; v_worker uuid;
begin
  if auth.uid() is null then return false; end if;
  v_target_farm:=private.farm_photo_target_farm(p_module,p_record_type,p_record_id);
  if v_target_farm is null or v_target_farm<>p_farm_id then return false; end if;
  if p_module in ('h2a','h2a_housing') then return private.h2a_can_read(p_farm_id); end if;
  if p_module='team' and p_record_type='shift' then
    select worker_user_id into v_worker from public.shifts where id=p_record_id and farm_id=p_farm_id;
    return v_worker=auth.uid() or private.is_farm_owner(p_farm_id);
  end if;
  if p_module='team' and p_record_type='time_entry' then
    select worker_user_id into v_worker from public.time_entries where id=p_record_id and farm_id=p_farm_id;
    return v_worker=auth.uid() or private.is_farm_owner(p_farm_id);
  end if;
  return private.is_farm_member(p_farm_id);
end;
$$;
revoke all on function private.farm_photo_can_access(uuid,text,text,uuid) from public,anon,authenticated;

create or replace function private.validate_farm_photo_evidence_context()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_farm uuid; v_parent uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if tg_op='INSERT' then new.captured_by:=auth.uid();
  elsif new.captured_by is distinct from old.captured_by then raise exception 'Photo evidence uploader is immutable';
  end if;

  v_farm:=private.farm_photo_target_farm(new.module,new.record_type,new.record_id);
  if v_farm is null then raise exception 'Unsupported or missing Smart Photo Evidence target';
  end if;
  if v_farm<>new.farm_id then raise exception 'Photo evidence target belongs to a different farm'; end if;

  if new.module='fields' and new.record_type='field_history_event' then
    select field_id into v_parent from public.field_history_events where id=new.record_id;
    if new.parent_record_id is distinct from v_parent then raise exception 'Field-history photo must point to its field'; end if;
  elsif new.module='team' and new.record_type='time_entry' and new.parent_record_id is not null then
    select shift_id into v_parent from public.time_entries where id=new.record_id;
    if new.parent_record_id is distinct from v_parent then raise exception 'Time-entry photo parent does not match its shift'; end if;
  elsif new.module in ('h2a','h2a_housing') and new.record_type='housing_inspection_item' then
    select inspection_id into v_parent from public.h2a_housing_inspection_items where id=new.record_id;
    if new.parent_record_id is distinct from v_parent then raise exception 'Housing checklist photo must point to its inspection'; end if;
  end if;

  if new.module='h2a_housing' then
    if new.storage_bucket<>'h2a-housing-evidence'
       or new.storage_path not like concat(new.farm_id::text,'/',new.parent_record_id::text,'/',new.record_id::text,'/%')
    then raise exception 'Housing evidence storage path does not match its record'; end if;
  else
    if new.storage_bucket<>'farm-photo-evidence'
       or new.storage_path not like concat(new.farm_id::text,'/',new.module,'/',new.record_type,'/',new.record_id::text,'/%')
    then raise exception 'Smart Photo Evidence storage path does not match its record'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_farm_photo_evidence_context() from public,anon,authenticated;

drop policy if exists "farm photo evidence read" on public.farm_photo_evidence;
create policy "farm photo evidence read" on public.farm_photo_evidence for select to authenticated
using (private.farm_photo_can_access(farm_id,module,record_type,record_id));
drop policy if exists "farm photo evidence insert" on public.farm_photo_evidence;
create policy "farm photo evidence insert" on public.farm_photo_evidence for insert to authenticated
with check (captured_by=(select auth.uid()) and private.farm_photo_can_access(farm_id,module,record_type,record_id));
drop policy if exists "farm photo evidence update" on public.farm_photo_evidence;
create policy "farm photo evidence update" on public.farm_photo_evidence for update to authenticated
using (private.farm_photo_can_access(farm_id,module,record_type,record_id) and (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id)))
with check (private.farm_photo_can_access(farm_id,module,record_type,record_id) and (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id)));
drop policy if exists "farm photo evidence delete" on public.farm_photo_evidence;
create policy "farm photo evidence delete" on public.farm_photo_evidence for delete to authenticated
using (private.farm_photo_can_access(farm_id,module,record_type,record_id) and (captured_by=(select auth.uid()) or private.is_farm_owner(farm_id)));

create or replace function private.farm_photo_storage_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_farm uuid; v_module text;
begin
  v_farm:=split_part(p_name,'/',1)::uuid;
  v_module:=split_part(p_name,'/',2);
  if v_module='h2a' then return private.h2a_can_read(v_farm); end if;
  if v_module in ('records','fields') then return private.is_farm_member(v_farm); end if;
  if v_module='team' then return private.is_farm_member(v_farm); end if;
  return false;
exception when others then return false;
end;
$$;
revoke all on function private.farm_photo_storage_allowed(text) from public,anon,authenticated;

drop policy if exists "farm photo evidence objects read" on storage.objects;
create policy "farm photo evidence objects read" on storage.objects for select to authenticated
using (bucket_id='farm-photo-evidence' and private.farm_photo_storage_allowed(name));
drop policy if exists "farm photo evidence objects insert" on storage.objects;
create policy "farm photo evidence objects insert" on storage.objects for insert to authenticated
with check (bucket_id='farm-photo-evidence' and private.farm_photo_storage_allowed(name));
drop policy if exists "farm photo evidence objects delete" on storage.objects;
create policy "farm photo evidence objects delete" on storage.objects for delete to authenticated
using (bucket_id='farm-photo-evidence' and private.farm_photo_storage_allowed(name) and owner_id=(select auth.uid()::text));
