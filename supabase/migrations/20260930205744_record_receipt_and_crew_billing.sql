begin;
-- Unknown legacy receipt times stay NULL; never invent historical server timestamps.
alter table public.farm_records add column received_at timestamptz;
alter table public.farm_records alter column received_at set default now();
create function private.guard_record_receipt() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.received_at:=statement_timestamp();
  if not isfinite(new.created_at) or new.created_at < new.received_at - interval '30 days' or new.created_at > new.received_at + interval '5 minutes' then
   raise exception 'Capture time must be within the last 30 days and at most 5 minutes ahead';
  end if;
 elsif new.received_at is distinct from old.received_at then raise exception 'Server receipt time is immutable';
 end if;
 return new;
end $$;
revoke all on function private.guard_record_receipt() from public,anon,authenticated;
create trigger guard_record_receipt before insert or update on public.farm_records for each row execute function private.guard_record_receipt();
alter table private.farm_storage_usage alter column limit_bytes set default 10000000000;
-- Preserve explicitly customized allowances. Never delete files when reducing an allowance.
update private.farm_storage_usage set limit_bytes=10000000000 where limit_bytes=100000000000;
create or replace function public.farm_storage_status(p_farm_id uuid) returns table(used_bytes bigint,limit_bytes bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.core_is_member(p_farm_id) or private.core_is_owner(p_farm_id)) then raise exception 'Farm access required'; end if;
 return query select coalesce(u.used_bytes,0::bigint),coalesce(u.limit_bytes,10000000000::bigint) from (values(p_farm_id)) f(id) left join private.farm_storage_usage u on u.farm_id=f.id;
end $$;

create table public.quickbooks_crew_mappings (
 farm_id uuid not null references public.farms(id) on delete cascade,
 worker_id uuid not null,
 quickbooks_employee_id text not null,
 quickbooks_employee_name text,
 created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(farm_id,worker_id), unique(farm_id,quickbooks_employee_id),
 foreign key(farm_id,worker_id) references public.crew_workers(farm_id,id) on delete cascade
);
alter table public.quickbooks_crew_mappings enable row level security;
revoke all on public.quickbooks_crew_mappings from anon,authenticated;
grant select,insert,update,delete on public.quickbooks_crew_mappings to authenticated;
create policy "owner manages crew QBO mappings" on public.quickbooks_crew_mappings for all to authenticated using(private.core_is_owner(farm_id)) with check(private.core_is_owner(farm_id));
-- Serialize mapping writes for each farm before checking the other namespace.
create function private.guard_qbo_employee_mapping() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.farm_id::text, 0));
 if tg_table_name='quickbooks_crew_mappings' then
  if exists(select 1 from public.quickbooks_employee_mappings where farm_id=new.farm_id and quickbooks_employee_id=new.quickbooks_employee_id) then
   raise exception 'QuickBooks employee is already mapped to an account worker';
  end if;
 else
  if exists(select 1 from public.quickbooks_crew_mappings where farm_id=new.farm_id and quickbooks_employee_id=new.quickbooks_employee_id) then
   raise exception 'QuickBooks employee is already mapped to a crew worker';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_qbo_employee_mapping() from public,anon,authenticated;
create trigger guard_qbo_employee_mapping before insert or update on public.quickbooks_employee_mappings for each row execute function private.guard_qbo_employee_mapping();
create trigger guard_qbo_employee_mapping before insert or update on public.quickbooks_crew_mappings for each row execute function private.guard_qbo_employee_mapping();
alter table public.crew_time_entries
 add column qbo_sync_status text not null default 'not_synced' check(qbo_sync_status in ('not_synced','syncing','synced','error')),
 add column qbo_time_activity_id text,
 add column qbo_realm_id text,
 add column qbo_synced_at timestamptz,
 add column qbo_sync_started_at timestamptz,
 add column qbo_sync_error text,
 add column qbo_intuit_tid text;
create or replace function private.guard_crew_time() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if tg_op='INSERT' then
  if not private.core_can_record_crew(new.farm_id) or not public.farm_plan_access(new.farm_id,'core') then raise exception 'Active Core plan and crew access required'; end if;
  if new.approval_status<>'pending' or new.reviewed_by is not null or new.reviewed_at is not null or new.review_reason is not null then raise exception 'New crew time must be unreviewed'; end if;
  if new.qbo_sync_status <> 'not_synced' or new.qbo_time_activity_id is not null or new.qbo_realm_id is not null or new.qbo_synced_at is not null or new.qbo_sync_started_at is not null or new.qbo_sync_error is not null or new.qbo_intuit_tid is not null then raise exception 'New crew time cannot have sync metadata'; end if;
  new.entered_by:=auth.uid();new.created_at:=now();
  if not exists(select 1 from public.crew_workers where id=new.worker_id and farm_id=new.farm_id and active) then raise exception 'Choose an active worker in this farm'; end if;
 else
  if not private.core_is_owner(old.farm_id) then raise exception 'Owner review required'; end if;
  if (to_jsonb(new)-array['approval_status','reviewed_by','reviewed_at','review_reason','qbo_sync_status','qbo_time_activity_id','qbo_realm_id','qbo_synced_at','qbo_sync_started_at','qbo_sync_error','qbo_intuit_tid']) is distinct from (to_jsonb(old)-array['approval_status','reviewed_by','reviewed_at','review_reason','qbo_sync_status','qbo_time_activity_id','qbo_realm_id','qbo_synced_at','qbo_sync_started_at','qbo_sync_error','qbo_intuit_tid']) then raise exception 'Submitted crew time is immutable. Reject and submit a corrected entry.'; end if;
  if new.approval_status=old.approval_status then
   if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at or new.review_reason is distinct from old.review_reason then raise exception 'Review metadata is immutable'; end if;
   return new;
  end if;
  if old.qbo_sync_status in ('syncing','synced') or old.qbo_time_activity_id is not null then raise exception 'Synced crew time must be corrected in QuickBooks before changing approval'; end if;
  if (to_jsonb(new)-array['approval_status','reviewed_by','reviewed_at','review_reason']) is distinct from (to_jsonb(old)-array['approval_status','reviewed_by','reviewed_at','review_reason']) then raise exception 'Do not change sync metadata during review'; end if;
  if new.approval_status='rejected' and length(trim(coalesce(new.review_reason,'')))<5 then raise exception 'Explain why the entry is rejected'; end if;
  new.reviewed_by:=auth.uid();new.reviewed_at:=now();
  insert into public.crew_review_events(entry_id,farm_id,old_status,new_status,reason,reviewer) values(old.id,old.farm_id,old.approval_status,new.approval_status,new.review_reason,auth.uid());
 end if;
 return new;
end $$;
commit;
