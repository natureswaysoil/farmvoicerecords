begin;
create table public.crew_leaders(farm_id uuid not null references public.farms(id),user_id uuid not null references auth.users(id),primary key(farm_id,user_id),foreign key(farm_id,user_id) references public.farm_members(farm_id,user_id) on delete cascade);
alter table public.crew_leaders enable row level security;
revoke all on public.crew_leaders from anon,authenticated;
grant select,insert,delete on public.crew_leaders to authenticated;
create policy "crew assignments visible" on public.crew_leaders for select to authenticated using(user_id=auth.uid() or private.core_is_owner(farm_id));
create policy "owner assigns crew leaders" on public.crew_leaders for insert to authenticated with check(private.core_is_owner(farm_id));
create policy "owner removes crew leaders" on public.crew_leaders for delete to authenticated using(private.core_is_owner(farm_id));
create function private.core_can_record_crew(f uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.core_is_owner(f) or exists(select 1 from public.crew_leaders where farm_id=f and user_id=auth.uid()))
$$;
revoke all on function private.core_can_record_crew(uuid) from public,anon;
grant execute on function private.core_can_record_crew(uuid) to authenticated;
create table public.crew_workers(
 id uuid primary key default gen_random_uuid(),farm_id uuid not null references public.farms(id),
 name text not null check(length(trim(name)) between 1 and 160),employee_number text not null check(length(trim(employee_number)) between 1 and 40),
 active boolean not null default true,created_at timestamptz not null default now(),unique(farm_id,employee_number),unique(farm_id,id)
);
create table public.crew_time_entries(
 id uuid primary key,farm_id uuid not null references public.farms(id),worker_id uuid not null,
 clock_in timestamptz not null,clock_out timestamptz not null,
 break_minutes integer not null default 0 check(break_minutes>=0),job text not null check(length(trim(job)) between 1 and 200),field_name text,
 entered_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 supervisor_lat double precision check(supervisor_lat between -90 and 90),supervisor_lng double precision check(supervisor_lng between -180 and 180),
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_reason text,
 foreign key(farm_id,worker_id) references public.crew_workers(farm_id,id),
 check(clock_out>clock_in and clock_out-clock_in<=interval '24 hours'),
 check(extract(epoch from(clock_out-clock_in))>break_minutes*60)
);
create index crew_time_period on public.crew_time_entries(farm_id,clock_in,id);
alter table public.crew_workers enable row level security;
alter table public.crew_time_entries enable row level security;
revoke all on public.crew_workers,public.crew_time_entries from anon,authenticated;
grant select,insert,update on public.crew_workers,public.crew_time_entries to authenticated;
create policy "crew roster read" on public.crew_workers for select to authenticated using(private.core_can_record_crew(farm_id));
create policy "crew roster insert" on public.crew_workers for insert to authenticated with check(private.core_is_owner(farm_id) and public.farm_plan_access(farm_id,'core'));
create policy "crew roster update" on public.crew_workers for update to authenticated using(private.core_is_owner(farm_id) and public.farm_plan_access(farm_id,'core')) with check(private.core_is_owner(farm_id) and public.farm_plan_access(farm_id,'core'));
create policy "crew time read" on public.crew_time_entries for select to authenticated using(private.core_can_record_crew(farm_id));
create policy "crew time insert" on public.crew_time_entries for insert to authenticated with check(private.core_can_record_crew(farm_id) and entered_by=auth.uid() and public.farm_plan_access(farm_id,'core'));
create policy "crew owner review" on public.crew_time_entries for update to authenticated using(private.core_is_owner(farm_id)) with check(private.core_is_owner(farm_id));
create table public.crew_review_events(id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.crew_time_entries(id),farm_id uuid not null references public.farms(id),old_status text,new_status text,reason text,reviewer uuid references auth.users(id),reviewed_at timestamptz not null default now());
alter table public.crew_review_events enable row level security;
revoke all on public.crew_review_events from anon,authenticated;
grant select on public.crew_review_events to authenticated;
create policy "crew review history read" on public.crew_review_events for select to authenticated using(private.core_can_record_crew(farm_id));
create function private.guard_crew_time() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if tg_op='INSERT' then
  if not private.core_can_record_crew(new.farm_id) or not public.farm_plan_access(new.farm_id,'core') then raise exception 'Active Core plan and crew access required'; end if;
  if new.approval_status<>'pending' or new.reviewed_by is not null or new.reviewed_at is not null or new.review_reason is not null then raise exception 'New crew time must be unreviewed'; end if;
  new.entered_by:=auth.uid();new.created_at:=now();
  if not exists(select 1 from public.crew_workers where id=new.worker_id and farm_id=new.farm_id and active) then raise exception 'Choose an active worker in this farm'; end if;
 else
  if not private.core_is_owner(old.farm_id) then raise exception 'Owner review required'; end if;
  if (to_jsonb(new)-array['approval_status','reviewed_by','reviewed_at','review_reason']) is distinct from (to_jsonb(old)-array['approval_status','reviewed_by','reviewed_at','review_reason']) then raise exception 'Submitted crew time is immutable. Reject and submit a corrected entry.'; end if;
  if new.approval_status=old.approval_status then raise exception 'Choose a different review decision'; end if;
  if new.approval_status='rejected' and length(trim(coalesce(new.review_reason,'')))<5 then raise exception 'Explain why the entry is rejected'; end if;
  new.reviewed_by:=auth.uid();new.reviewed_at:=now();
  insert into public.crew_review_events(entry_id,farm_id,old_status,new_status,reason,reviewer) values(old.id,old.farm_id,old.approval_status,new.approval_status,new.review_reason,auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.guard_crew_time() from public,anon,authenticated;
create trigger guard_crew_time before insert or update on public.crew_time_entries for each row execute function private.guard_crew_time();
-- One transaction for the whole crew, with stable IDs for offline retry.
create function public.submit_crew_time(p_farm_id uuid,p_entries jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; existing public.crew_time_entries; n integer:=0;
begin
 if not private.core_can_record_crew(p_farm_id) then raise exception 'Crew access required'; end if;
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries) not between 1 and 200 then raise exception 'Choose between 1 and 200 crew workers'; end if;
 for item in select value from jsonb_array_elements(p_entries) loop
  select * into existing from public.crew_time_entries where id=(item->>'id')::uuid;
  if found then
   if existing.farm_id<>p_farm_id or existing.entered_by<>auth.uid() or existing.worker_id<>(item->>'worker_id')::uuid
    or existing.clock_in<>(item->>'clock_in')::timestamptz or existing.clock_out<>(item->>'clock_out')::timestamptz
    or existing.break_minutes<>coalesce((item->>'break_minutes')::integer,0) or existing.job is distinct from item->>'job'
    or existing.field_name is distinct from nullif(item->>'field_name','') then raise exception 'Crew entry ID is already in use'; end if;
  else
   insert into public.crew_time_entries(id,farm_id,worker_id,clock_in,clock_out,break_minutes,job,field_name,supervisor_lat,supervisor_lng)
   values((item->>'id')::uuid,p_farm_id,(item->>'worker_id')::uuid,(item->>'clock_in')::timestamptz,(item->>'clock_out')::timestamptz,coalesce((item->>'break_minutes')::integer,0),item->>'job',nullif(item->>'field_name',''),(item->>'supervisor_lat')::double precision,(item->>'supervisor_lng')::double precision);
  end if;n:=n+1;
 end loop;return n;
end $$;
revoke all on function public.submit_crew_time(uuid,jsonb) from public,anon;
grant execute on function public.submit_crew_time(uuid,jsonb) to authenticated;
commit;
