begin;
create schema if not exists private;
grant usage on schema private to authenticated;
-- These narrowly scoped predicates read the caller's own authorization only.
-- They avoid farms <-> farm_members recursive policy evaluation.
create or replace function private.core_is_owner(p_farm uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.farms where id=p_farm and owner_user_id=auth.uid())
$$;
create or replace function private.core_is_member(p_farm uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.farm_members where farm_id=p_farm and user_id=auth.uid())
$$;
revoke all on function private.core_is_owner(uuid),private.core_is_member(uuid) from public,anon;
grant execute on function private.core_is_owner(uuid),private.core_is_member(uuid) to authenticated;
drop policy if exists "members or owners read farms" on public.farms;
create policy "members or owners read farms" on public.farms for select to authenticated
 using(private.core_is_owner(id) or private.core_is_member(id));
drop policy if exists "members read memberships" on public.farm_members;
create policy "members read memberships" on public.farm_members for select to authenticated
 using(user_id=auth.uid() or private.core_is_owner(farm_id));

create or replace function private.guard_time_integrity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.clock_out is not null and new.clock_out <= new.clock_in then raise exception 'Clock-out must follow clock-in'; end if;
 if auth.uid() is null then return new; end if;
 if tg_op='INSERT' then
  if new.approval_status<>'pending' or new.reviewed_by is not null or new.reviewed_at is not null
    or new.qbo_sync_status<>'not_synced' or new.qbo_time_activity_id is not null or new.qbo_realm_id is not null
    or new.qbo_synced_at is not null or new.qbo_sync_started_at is not null or new.qbo_sync_error is not null or new.qbo_intuit_tid is not null
  then raise exception 'New time must be pending and unreviewed'; end if;
  if not exists(select 1 from public.farm_members where farm_id=new.farm_id and user_id=new.worker_user_id and role='worker') then raise exception 'Worker must belong to this farm'; end if;
 else
  if new.farm_id<>old.farm_id or new.worker_user_id<>old.worker_user_id then raise exception 'Time identity cannot change'; end if;
  if (old.qbo_sync_status in ('syncing','synced') or old.qbo_time_activity_id is not null) and
   (new.clock_in is distinct from old.clock_in or new.clock_out is distinct from old.clock_out or new.job is distinct from old.job
    or new.field_name is distinct from old.field_name or new.approval_status is distinct from old.approval_status)
  then raise exception 'Reconcile exported time in QuickBooks before changing it'; end if;
  if new.approval_status is distinct from old.approval_status then
   if not private.core_is_owner(old.farm_id) then raise exception 'Owner review is required'; end if;
   if new.clock_out is null then raise exception 'Complete time before review'; end if;
   new.reviewed_by:=auth.uid(); new.reviewed_at:=now();
  elsif new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
   raise exception 'Reviewer fields can only change with an approval decision';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_time_integrity() from public,anon,authenticated;
create trigger core_time_integrity before insert or update on public.time_entries for each row execute function private.guard_time_integrity();

create or replace function private.join_farm_by_code(p_join_code text,p_employee_number text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Sign in is required.'; end if;
 if exists(select 1 from public.farms where owner_user_id=uid) or exists(select 1 from public.farm_members where user_id=uid and role='owner') then
  raise exception 'Use a worker account to join a farm.';
 end if;
 select id into f from public.farms where upper(join_code)=upper(trim(p_join_code));
 if f is null then raise exception 'That farm join code was not found.'; end if;
 -- Repeating a join must not overwrite an existing employee number.
 insert into public.farm_members(farm_id,user_id,role,employee_number)
 values(f,uid,'worker',nullif(trim(p_employee_number),'')) on conflict(farm_id,user_id) do nothing;
 return f;
end $$;
revoke all on function private.join_farm_by_code(text,text) from public,anon;
grant execute on function private.join_farm_by_code(text,text) to authenticated;

alter table public.farm_records add column revision integer not null default 1;
alter table public.farm_records add column change_reason text;
alter table public.farm_records add column updated_by uuid references auth.users(id);
create table public.farm_record_revisions(
 record_id uuid not null references public.farm_records(id) on delete restrict,
 farm_id uuid not null references public.farms(id) on delete restrict,
 revision integer not null, snapshot jsonb not null, changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now(), reason text, primary key(record_id,revision)
);
alter table public.farm_record_revisions enable row level security;
revoke all on public.farm_record_revisions from anon,authenticated;
grant select on public.farm_record_revisions to authenticated;
create policy "farm members read record history" on public.farm_record_revisions for select to authenticated
 using(private.core_is_member(farm_id) or private.core_is_owner(farm_id));
create or replace function private.version_farm_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.field_id is not null and not exists(select 1 from public.fields where id=new.field_id and farm_id=new.farm_id) then raise exception 'Field belongs to another farm'; end if;
 if tg_op='INSERT' then
  new.revision:=1;new.updated_by:=auth.uid();new.updated_at:=now();return new;
 end if;
 if new.farm_id<>old.farm_id or new.created_by<>old.created_by or new.id<>old.id or new.created_at<>old.created_at then raise exception 'Record identity cannot change'; end if;
 if old.status='confirmed' and (new.status<>'confirmed' or length(trim(coalesce(new.change_reason,'')))<5) then
  raise exception 'Confirmed corrections need a reason and must remain confirmed';
 end if;
 insert into public.farm_record_revisions(record_id,farm_id,revision,snapshot,changed_by,reason)
 values(old.id,old.farm_id,old.revision,to_jsonb(old),auth.uid(),new.change_reason);
 new.revision:=old.revision+1;new.updated_by:=auth.uid();new.updated_at:=now();
 return new;
end $$;
revoke all on function private.version_farm_record() from public,anon,authenticated;
create trigger version_farm_record before insert or update on public.farm_records for each row execute function private.version_farm_record();
commit;
