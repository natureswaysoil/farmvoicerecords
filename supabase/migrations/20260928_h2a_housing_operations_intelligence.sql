-- Operational housing compliance extensions.
-- Adds certification lifecycle, contract linkage, recurring self-check scheduling,
-- closed-loop corrective actions, and assignment-time occupancy safeguards.

alter table public.h2a_housing
  add column if not exists certificate_issued_on date,
  add column if not exists certified_capacity integer check (certified_capacity is null or certified_capacity >= 0),
  add column if not exists certificate_document_reference text,
  add column if not exists self_check_frequency text not null default 'monthly'
    check (self_check_frequency in ('weekly','monthly','none')),
  add column if not exists next_self_check_on date;

alter table public.h2a_housing_assignments
  add column if not exists contract_id uuid;

alter table public.h2a_housing_inspection_items
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists repair_evidence_reference text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

create index if not exists h2a_housing_assignments_contract_idx
  on public.h2a_housing_assignments(farm_id, contract_id);

alter table public.h2a_housing_assignments
  drop constraint if exists h2a_housing_assignments_farm_contract_fkey;
alter table public.h2a_housing_assignments
  add constraint h2a_housing_assignments_farm_contract_fkey
  foreign key (farm_id, contract_id)
  references public.h2a_contracts(farm_id, id)
  on delete restrict;
create index if not exists h2a_housing_next_self_check_idx
  on public.h2a_housing(farm_id, next_self_check_on)
  where active = true and self_check_frequency <> 'none';
create index if not exists h2a_housing_items_assigned_open_idx
  on public.h2a_housing_inspection_items(farm_id, assigned_to, corrective_due_on)
  where result = 'fail' and resolved_at is null;

update public.h2a_housing_assignments a
set contract_id = w.contract_id
from public.h2a_workers w
where a.worker_id = w.id and a.contract_id is null and w.contract_id is not null;

update public.h2a_housing
set next_self_check_on = case
  when self_check_frequency = 'weekly' then coalesce(last_self_check_at::date, inspection_date, current_date) + 7
  when self_check_frequency = 'monthly' then (coalesce(last_self_check_at::date, inspection_date, current_date) + interval '1 month')::date
  else null
end
where next_self_check_on is null;

create or replace function private.h2a_effective_housing_capacity(p_housing_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  with caps as (
    select max_occupancy, certified_capacity,
      case when standard_basis='osha_1910_142' and sleeping_floor_sqft is not null
        then floor(sleeping_floor_sqft/50.0)::integer end as sleeping_capacity,
      case when standard_basis='osha_1910_142' and cooking_living_sleeping_sqft is not null
        then floor(cooking_living_sleeping_sqft/100.0)::integer end as combined_room_capacity
    from public.h2a_housing where id=p_housing_id
  )
  select min(v) from caps
  cross join lateral unnest(array[max_occupancy,certified_capacity,sleeping_capacity,combined_room_capacity]) x(v)
  where v is not null;
$$;
revoke all on function private.h2a_effective_housing_capacity(uuid) from public, anon;
grant execute on function private.h2a_effective_housing_capacity(uuid) to authenticated;

create or replace function private.h2a_validate_housing_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_housing public.h2a_housing%rowtype;
  v_worker public.h2a_workers%rowtype;
  v_contract_farm uuid;
  v_capacity integer;
  v_overlaps integer;
  v_check_date date;
  v_certificate_exists boolean;
begin
  -- Serialize assignment changes per housing record so concurrent inserts cannot
  -- both observe the same available capacity.
  select * into v_housing from public.h2a_housing where id=new.housing_id for update;
  if v_housing.id is null or v_housing.farm_id<>new.farm_id then raise exception 'Housing must belong to the selected farm.'; end if;
  select * into v_worker from public.h2a_workers where id=new.worker_id;
  if v_worker.id is null or v_worker.farm_id<>new.farm_id then raise exception 'Worker must belong to the selected farm.'; end if;
  if new.contract_id is null then new.contract_id:=v_worker.contract_id; end if;
  if new.contract_id is not null then
    select farm_id into v_contract_farm from public.h2a_contracts where id=new.contract_id;
    if v_contract_farm is distinct from new.farm_id then raise exception 'H-2A contract must belong to the selected farm.'; end if;
  end if;
  if new.check_out_date is not null and new.check_out_date<new.check_in_date then raise exception 'Housing check-out cannot be before check-in.'; end if;
  v_check_date:=greatest(new.check_in_date,current_date);
  if new.check_out_date is null or new.check_out_date>=current_date then
    select exists (
      select 1 from storage.objects o
      where o.bucket_id='h2a-housing-evidence'
        and o.name=v_housing.certificate_document_reference
        and o.name like concat(v_housing.farm_id::text,'/certificates/',v_housing.id::text,'/%')
    ) into v_certificate_exists;
    if v_housing.certificate_number is null or v_housing.certificate_issued_on is null or v_housing.certificate_expires_on is null
       or v_housing.certificate_issued_on>v_check_date or v_housing.certificate_expires_on<v_check_date or not v_certificate_exists then
      raise exception 'Housing certification is not ready for this assignment.';
    end if;
    v_capacity:=private.h2a_effective_housing_capacity(new.housing_id);
    if v_capacity is null or v_capacity<1 then raise exception 'Housing capacity is not configured.'; end if;
    select count(*) into v_overlaps from public.h2a_housing_assignments a
      where a.housing_id=new.housing_id and a.id is distinct from new.id
        and daterange(a.check_in_date,coalesce(a.check_out_date,'infinity'::date),'[]')
          && daterange(new.check_in_date,coalesce(new.check_out_date,'infinity'::date),'[]');
    if v_overlaps+1>v_capacity then raise exception 'Housing assignment would exceed effective capacity (%).',v_capacity; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.h2a_validate_housing_assignment() from public, anon, authenticated;
drop trigger if exists h2a_validate_housing_assignment on public.h2a_housing_assignments;
create trigger h2a_validate_housing_assignment
before insert or update of farm_id,worker_id,housing_id,contract_id,check_in_date,check_out_date
on public.h2a_housing_assignments for each row execute function private.h2a_validate_housing_assignment();

comment on function private.h2a_effective_housing_capacity(uuid) is
  'Planning capacity. Uses recorded/certified limits and OSHA square-footage-derived limits only when OSHA 1910.142 is selected. Applicability of state/local rules still requires review.';