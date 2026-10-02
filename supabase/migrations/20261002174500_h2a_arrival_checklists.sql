begin;

create table public.h2a_worker_arrival_checklist (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null,
  contract_id uuid,
  checklist_version text not null default 'federal-2026-v1',
  item_key text not null,
  status text not null default 'required_now'
    check (status in ('required_now','due_later','complete','exception')),
  due_on date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  exception_reason text,
  evidence_reference text,
  worker_acknowledged_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, worker_id, checklist_version, item_key),
  foreign key (farm_id, worker_id)
    references public.h2a_workers(farm_id, id) on delete cascade,
  foreign key (farm_id, contract_id)
    references public.h2a_contracts(farm_id, id)
    on delete set null (contract_id),
  check (status <> 'exception' or nullif(trim(coalesce(exception_reason,'')),'') is not null),
  check (status <> 'complete' or completed_at is not null)
);

create table public.h2a_farm_readiness_checklist (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid not null,
  checklist_version text not null default 'federal-2026-v1',
  item_key text not null,
  status text not null default 'required_now'
    check (status in ('required_now','due_later','complete','exception')),
  due_on date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  exception_reason text,
  evidence_reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, contract_id, checklist_version, item_key),
  foreign key (farm_id, contract_id)
    references public.h2a_contracts(farm_id, id) on delete cascade,
  check (status <> 'exception' or nullif(trim(coalesce(exception_reason,'')),'') is not null),
  check (status <> 'complete' or completed_at is not null)
);

create index h2a_worker_arrival_checklist_worker_idx
  on public.h2a_worker_arrival_checklist(farm_id,worker_id,status,due_on);
create index h2a_farm_readiness_checklist_contract_idx
  on public.h2a_farm_readiness_checklist(farm_id,contract_id,status,due_on);

alter table public.h2a_worker_arrival_checklist enable row level security;
alter table public.h2a_farm_readiness_checklist enable row level security;

revoke all on public.h2a_worker_arrival_checklist from anon,authenticated;
revoke all on public.h2a_farm_readiness_checklist from anon,authenticated;
grant select,insert,update,delete on public.h2a_worker_arrival_checklist to authenticated;
grant select,insert,update,delete on public.h2a_farm_readiness_checklist to authenticated;

create policy "h2a arrival checklist admin read"
on public.h2a_worker_arrival_checklist for select to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a arrival checklist admin manage"
on public.h2a_worker_arrival_checklist for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a readiness checklist admin read"
on public.h2a_farm_readiness_checklist for select to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a readiness checklist admin manage"
on public.h2a_farm_readiness_checklist for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create trigger h2a_worker_arrival_checklist_plan
before insert or update or delete on public.h2a_worker_arrival_checklist
for each row execute function private.require_farm_write_plan();

create trigger h2a_farm_readiness_checklist_plan
before insert or update or delete on public.h2a_farm_readiness_checklist
for each row execute function private.require_farm_write_plan();

create trigger h2a_worker_arrival_checklist_provenance
before insert or update on public.h2a_worker_arrival_checklist
for each row execute function private.h2a_guard_created_by();

create trigger h2a_farm_readiness_checklist_provenance
before insert or update on public.h2a_farm_readiness_checklist
for each row execute function private.h2a_guard_created_by();

create trigger h2a_worker_arrival_checklist_audit
after insert or update or delete on public.h2a_worker_arrival_checklist
for each row execute function private.h2a_audit_trigger();

create trigger h2a_farm_readiness_checklist_audit
after insert or update or delete on public.h2a_farm_readiness_checklist
for each row execute function private.h2a_audit_trigger();


-- Provision checklist rows for every H-2A worker and every H-2A contract.
create or replace function private.h2a_seed_worker_arrival_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  v_item text;
  v_status text;
begin
  if new.worker_type <> 'h2a' then
    return new;
  end if;

  foreach v_item in array array[
    'work_contract_disclosed',
    'wage_terms_reviewed',
    'deductions_disclosed',
    'worker_rights_notice',
    'i9_section1',
    'i9_section2',
    'work_authorization_dates',
    'tin_ssn_status',
    'federal_withholding_election',
    'payroll_setup',
    'housing_assignment',
    'housing_no_charge',
    'housing_rules',
    'daily_transportation',
    'inbound_costs_recorded',
    'recruitment_fee_interview',
    'fee_reimbursement_review',
    'inbound_reimbursement_50pct',
    'workers_comp',
    'tools_equipment',
    'meal_arrangement',
    'safety_orientation',
    'emergency_contact',
    'first_work_date',
    'three_fourths_tracking'
  ]
  loop
    v_status := case
      when v_item in (
        'tin_ssn_status',
        'fee_reimbursement_review',
        'inbound_reimbursement_50pct',
        'three_fourths_tracking'
      ) then 'due_later'
      else 'required_now'
    end;

    insert into public.h2a_worker_arrival_checklist(
      farm_id,
      worker_id,
      contract_id,
      checklist_version,
      item_key,
      status,
      due_on,
      created_by
    )
    values (
      new.farm_id,
      new.id,
      new.contract_id,
      'federal-2026-v1',
      v_item,
      v_status,
      case
        when v_item='i9_section1' then new.first_work_date
        when v_item='i9_section2' and new.first_work_date is not null then
          (
            select d::date
            from generate_series(
              new.first_work_date + interval '1 day',
              new.first_work_date + interval '10 days',
              interval '1 day'
            ) d
            where extract(isodow from d) < 6
            order by d
            offset 2
            limit 1
          )
        when v_item='first_work_date' then
          coalesce(
            new.first_work_date,
            (
              select c.start_date
              from public.h2a_contracts c
              where c.farm_id=new.farm_id and c.id=new.contract_id
            )
          )
        when v_item='inbound_reimbursement_50pct' and new.contract_id is not null then
          (
            select (
              c.start_date
              + ((c.end_date - c.start_date) / 2)
            )::date
            from public.h2a_contracts c
            where c.farm_id=new.farm_id and c.id=new.contract_id
          )
        when v_item='three_fourths_tracking' then
          coalesce(
            (
              select c.start_date
              from public.h2a_contracts c
              where c.farm_id=new.farm_id and c.id=new.contract_id
            ),
            new.first_work_date
          )
        else null
      end,
      coalesce(new.created_by, (select auth.uid()))
    )
    on conflict (farm_id,worker_id,checklist_version,item_key)
    do update set
      contract_id=excluded.contract_id,
      due_on=case
        when public.h2a_worker_arrival_checklist.status in ('complete','exception')
          then public.h2a_worker_arrival_checklist.due_on
        else excluded.due_on
      end,
      updated_at=now();
  end loop;

  return new;
end;
$;
revoke all on function private.h2a_seed_worker_arrival_checklist()
from public,anon,authenticated;

drop trigger if exists h2a_worker_arrival_seed on public.h2a_workers;
create trigger h2a_worker_arrival_seed
after insert or update of worker_type,contract_id,first_work_date on public.h2a_workers
for each row execute function private.h2a_seed_worker_arrival_checklist();

create or replace function private.h2a_seed_farm_readiness_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  v_item text;
begin
  foreach v_item in array array[
    'certified_job_order',
    'rights_poster_english',
    'rights_poster_other_languages',
    'housing_certification',
    'workers_comp_current',
    'daily_transport_plan',
    'wage_rate_verified',
    'pay_statement_setup',
    'recruiter_fee_controls',
    'meal_arrangement_ready',
    'record_retention_process'
  ]
  loop
    insert into public.h2a_farm_readiness_checklist(
      farm_id,
      contract_id,
      checklist_version,
      item_key,
      status,
      created_by
    )
    values (
      new.farm_id,
      new.id,
      'federal-2026-v1',
      v_item,
      'required_now',
      coalesce(new.created_by, (select auth.uid()))
    )
    on conflict (farm_id,contract_id,checklist_version,item_key)
    do nothing;
  end loop;

  return new;
end;
$;
revoke all on function private.h2a_seed_farm_readiness_checklist()
from public,anon,authenticated;

drop trigger if exists h2a_contract_readiness_seed on public.h2a_contracts;
create trigger h2a_contract_readiness_seed
after insert on public.h2a_contracts
for each row execute function private.h2a_seed_farm_readiness_checklist();


-- Backfill existing contracts.
insert into public.h2a_farm_readiness_checklist(
  farm_id,contract_id,checklist_version,item_key,status,created_by
)
select
  c.farm_id,
  c.id,
  'federal-2026-v1',
  item_key,
  'required_now',
  c.created_by
from public.h2a_contracts c
cross join unnest(array[
  'certified_job_order',
  'rights_poster_english',
  'rights_poster_other_languages',
  'housing_certification',
  'workers_comp_current',
  'daily_transport_plan',
  'wage_rate_verified',
  'pay_statement_setup',
  'recruiter_fee_controls',
  'meal_arrangement_ready',
  'record_retention_process'
]) as item_key
on conflict (farm_id,contract_id,checklist_version,item_key) do nothing;

-- Backfill existing H-2A workers.
insert into public.h2a_worker_arrival_checklist(
  farm_id,worker_id,contract_id,checklist_version,item_key,status,due_on,created_by
)
select
  w.farm_id,
  w.id,
  w.contract_id,
  'federal-2026-v1',
  item_key,
  case
    when item_key in (
      'tin_ssn_status',
      'fee_reimbursement_review',
      'inbound_reimbursement_50pct',
      'three_fourths_tracking'
    ) then 'due_later'
    else 'required_now'
  end,
  case
    when item_key='i9_section1' then w.first_work_date
    when item_key='i9_section2' and w.first_work_date is not null then
      (
        select d::date
        from generate_series(
          w.first_work_date + interval '1 day',
          w.first_work_date + interval '10 days',
          interval '1 day'
        ) d
        where extract(isodow from d) < 6
        order by d
        offset 2
        limit 1
      )
    when item_key='first_work_date' then coalesce(w.first_work_date,c.start_date)
    when item_key='inbound_reimbursement_50pct'
      and c.start_date is not null and c.end_date is not null
      then (c.start_date + ((c.end_date-c.start_date)/2))::date
    when item_key='three_fourths_tracking'
      then coalesce(c.start_date,w.first_work_date)
    else null
  end,
  w.created_by
from public.h2a_workers w
left join public.h2a_contracts c
  on c.farm_id=w.farm_id and c.id=w.contract_id
cross join unnest(array[
  'work_contract_disclosed',
  'wage_terms_reviewed',
  'deductions_disclosed',
  'worker_rights_notice',
  'i9_section1',
  'i9_section2',
  'work_authorization_dates',
  'tin_ssn_status',
  'federal_withholding_election',
  'payroll_setup',
  'housing_assignment',
  'housing_no_charge',
  'housing_rules',
  'daily_transportation',
  'inbound_costs_recorded',
  'recruitment_fee_interview',
  'fee_reimbursement_review',
  'inbound_reimbursement_50pct',
  'workers_comp',
  'tools_equipment',
  'meal_arrangement',
  'safety_orientation',
  'emergency_contact',
  'first_work_date',
  'three_fourths_tracking'
]) as item_key
where w.worker_type='h2a'
on conflict (farm_id,worker_id,checklist_version,item_key) do nothing;

-- Allow Smart Photo Evidence to attach directly to checklist items.
create or replace function private.farm_photo_target_farm(
  p_module text,
  p_record_type text,
  p_record_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_farm uuid;
begin
  case
    when p_module='records' and p_record_type='farm_record' then
      select farm_id into v_farm from public.farm_records where id=p_record_id;
    when p_module='fields' and p_record_type='field' then
      select farm_id into v_farm from public.fields where id=p_record_id;
    when p_module='fields' and p_record_type='field_history_event' then
      select farm_id into v_farm from public.field_history_events where id=p_record_id;
    when p_module='team' and p_record_type='shift' then
      select farm_id into v_farm from public.shifts where id=p_record_id;
    when p_module='team' and p_record_type='time_entry' then
      select farm_id into v_farm from public.time_entries where id=p_record_id;
    when p_module='h2a' and p_record_type='contract' then
      select farm_id into v_farm from public.h2a_contracts where id=p_record_id;
    when p_module='h2a' and p_record_type='worker' then
      select farm_id into v_farm from public.h2a_workers where id=p_record_id;
    when p_module='h2a' and p_record_type='daily_record' then
      select farm_id into v_farm from public.h2a_daily_records where id=p_record_id;
    when p_module='h2a' and p_record_type='document' then
      select farm_id into v_farm from public.h2a_documents where id=p_record_id;
    when p_module='h2a' and p_record_type='housing' then
      select farm_id into v_farm from public.h2a_housing where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_assignment' then
      select farm_id into v_farm from public.h2a_housing_assignments where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_inspection' then
      select farm_id into v_farm from public.h2a_housing_inspections where id=p_record_id;
    when p_module='h2a' and p_record_type='housing_inspection_item' then
      select farm_id into v_farm from public.h2a_housing_inspection_items where id=p_record_id;
    when p_module='h2a' and p_record_type='notification' then
      select farm_id into v_farm from public.h2a_notifications where id=p_record_id;
    when p_module='h2a' and p_record_type='pay_statement' then
      select farm_id into v_farm from public.h2a_pay_statements where id=p_record_id;
    when p_module='h2a' and p_record_type='recruitment' then
      select farm_id into v_farm from public.h2a_recruitment where id=p_record_id;
    when p_module='h2a' and p_record_type='separation' then
      select farm_id into v_farm from public.h2a_separations where id=p_record_id;
    when p_module='h2a' and p_record_type='training' then
      select farm_id into v_farm from public.h2a_training where id=p_record_id;
    when p_module='h2a' and p_record_type='transportation' then
      select farm_id into v_farm from public.h2a_transportation where id=p_record_id;
    when p_module='h2a' and p_record_type='wage_rate' then
      select farm_id into v_farm from public.h2a_wage_rates where id=p_record_id;
    when p_module='h2a' and p_record_type='acknowledgment' then
      select farm_id into v_farm from public.h2a_acknowledgments where id=p_record_id;
    when p_module='h2a' and p_record_type='arrival_checklist' then
      select farm_id into v_farm from public.h2a_worker_arrival_checklist where id=p_record_id;
    when p_module='h2a' and p_record_type='readiness_checklist' then
      select farm_id into v_farm from public.h2a_farm_readiness_checklist where id=p_record_id;
    when p_module='h2a_housing' and p_record_type='housing_inspection_item' then
      select farm_id into v_farm from public.h2a_housing_inspection_items where id=p_record_id;
    else return null;
  end case;
  return v_farm;
end;
$$;
revoke all on function private.farm_photo_target_farm(text,text,uuid)
from public,anon,authenticated;

create or replace function private.farm_photo_can_access(
  p_farm_id uuid,
  p_module text,
  p_record_type text,
  p_record_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_farm uuid;
  v_worker uuid;
begin
  if auth.uid() is null then return false; end if;
  v_target_farm:=private.farm_photo_target_farm(
    p_module,p_record_type,p_record_id
  );
  if v_target_farm is null or v_target_farm<>p_farm_id then
    return false;
  end if;

  if p_module in ('h2a','h2a_housing') then
    case p_record_type
      when 'document' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(
            p_farm_id,array['h2a_admin','payroll','housing_manager']
          );
      when 'pay_statement' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin','payroll']);
      when 'recruitment' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin']);
      when 'separation' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin','payroll']);
      when 'notification' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin','payroll']);
      when 'arrival_checklist' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin']);
      when 'readiness_checklist' then
        return private.h2a_is_owner(p_farm_id)
          or private.h2a_has_role(p_farm_id,array['h2a_admin']);
      else
        return private.h2a_can_read(p_farm_id);
    end case;
  end if;

  if p_module='team' and p_record_type='shift' then
    select worker_user_id into v_worker
    from public.shifts
    where id=p_record_id and farm_id=p_farm_id;
    return v_worker=auth.uid() or private.farm_photo_is_owner(p_farm_id);
  end if;
  if p_module='team' and p_record_type='time_entry' then
    select worker_user_id into v_worker
    from public.time_entries
    where id=p_record_id and farm_id=p_farm_id;
    return v_worker=auth.uid() or private.farm_photo_is_owner(p_farm_id);
  end if;
  if p_module in ('records','fields') then
    return private.farm_photo_is_member(p_farm_id);
  end if;
  return false;
end;
$$;
revoke all on function private.farm_photo_can_access(uuid,text,text,uuid)
from public,anon,authenticated;
grant execute on function private.farm_photo_can_access(uuid,text,text,uuid)
to authenticated;

commit;
