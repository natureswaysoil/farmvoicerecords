-- H-2A employer recordkeeping module for FarmVoice Records.
-- Workers do not need FarmVoice accounts; crew leaders can maintain crew records from one device.

create schema if not exists private;

create table if not exists public.h2a_user_roles (
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('h2a_admin','crew_leader','payroll','housing_manager')),
  created_at timestamptz not null default now(),
  primary key (farm_id,user_id,role)
);

create table if not exists public.h2a_contracts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  eta_case_number text,
  job_order_number text,
  start_date date not null,
  end_date date not null,
  crop_or_commodity text,
  job_duties text,
  worksites text,
  expected_hours_per_day numeric(6,2),
  expected_days_per_week numeric(4,2),
  pay_frequency text default 'biweekly',
  hourly_wage numeric(12,4),
  piece_rate_description text,
  meal_arrangement text,
  transportation_terms text,
  workers_comp_carrier text,
  workers_comp_policy text,
  workers_comp_expires_on date,
  employer_fein text,
  employer_address text,
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.h2a_workers (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete set null,
  employee_number text not null,
  legal_name text not null,
  preferred_name text,
  worker_type text not null default 'h2a'
    check (worker_type in ('h2a','corresponding','domestic_ag','supervisor','other')),
  country_of_origin text,
  preferred_language text,
  phone text,
  email text,
  emergency_contact text,
  visa_issue_date date,
  visa_expiration_date date,
  arrival_date date,
  work_authorization_start date,
  work_authorization_end date,
  first_work_date date,
  last_work_date date,
  status text not null default 'expected'
    check (status in ('expected','active','inactive','completed','separated')),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, employee_number)
);

create table if not exists public.h2a_daily_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete set null,
  worker_id uuid not null references public.h2a_workers(id) on delete cascade,
  work_date date not null,
  crew_name text,
  worksite text,
  field_name text,
  job text,
  hours_offered numeric(6,2) not null default 0 check (hours_offered >= 0 and hours_offered <= 24),
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  hours_worked numeric(6,2) not null default 0 check (hours_worked >= 0 and hours_worked <= 24),
  absence_reason text,
  piece_unit text,
  piece_quantity numeric(12,3),
  piece_rate numeric(12,4),
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy_m double precision,
  gps_captured_at timestamptz,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  locked_at timestamptz,
  crew_leader_attested_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  change_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, worker_id, work_date)
);

create table if not exists public.h2a_housing (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  address text not null,
  max_occupancy integer check (max_occupancy is null or max_occupancy > 0),
  inspection_authority text,
  inspection_date date,
  certificate_number text,
  certificate_expires_on date,
  emergency_contact text,
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.h2a_housing_assignments (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null references public.h2a_workers(id) on delete cascade,
  housing_id uuid not null references public.h2a_housing(id) on delete cascade,
  unit_or_bed text,
  check_in_date date not null,
  check_out_date date,
  no_rent_confirmed boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (check_out_date is null or check_out_date >= check_in_date)
);

create table if not exists public.h2a_transportation (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid references public.h2a_workers(id) on delete set null,
  transport_type text not null check (transport_type in ('inbound','daily','outbound','other')),
  travel_date date not null,
  origin text,
  destination text,
  carrier_or_vehicle text,
  driver_name text,
  worker_paid numeric(12,2) not null default 0,
  employer_paid numeric(12,2) not null default 0,
  subsistence_amount numeric(12,2) not null default 0,
  reimbursement_due numeric(12,2) not null default 0,
  reimbursement_paid numeric(12,2) not null default 0,
  reimbursement_date date,
  receipt_reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_training (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid references public.h2a_workers(id) on delete cascade,
  training_type text not null,
  training_date date not null,
  instructor text,
  language text,
  material_version text,
  acknowledgment text,
  retraining_due_on date,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_documents (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid references public.h2a_workers(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete cascade,
  document_type text not null,
  title text not null,
  issued_on date,
  expires_on date,
  storage_reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_recruitment (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete cascade,
  applicant_name text,
  contact_date date,
  contact_method text,
  recruitment_source text,
  response text,
  disposition text check (disposition is null or disposition in ('hired','declined','rejected','pending')),
  disposition_reason text,
  supporting_reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_separations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null references public.h2a_workers(id) on delete cascade,
  separation_date date not null,
  separation_type text not null check (separation_type in ('completed','voluntary','terminated','abandonment','other')),
  reason text,
  final_pay_reviewed boolean not null default false,
  outbound_transport_reviewed boolean not null default false,
  three_fourths_reviewed boolean not null default false,
  dol_notice_required boolean,
  dol_notice_completed_at timestamptz,
  dhs_notice_required boolean,
  dhs_notice_completed_at timestamptz,
  documentation_reference text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_wage_rates (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete cascade,
  effective_date date not null,
  end_date date,
  hourly_rate numeric(12,4) not null,
  piece_rate_description text,
  source text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= effective_date)
);

create table if not exists public.h2a_pay_statements (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null references public.h2a_workers(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete set null,
  period_start date not null,
  period_end date not null,
  payday date,
  hours_offered numeric(8,2) not null default 0,
  hours_worked numeric(8,2) not null default 0,
  hourly_rate numeric(12,4),
  piece_units numeric(12,3),
  piece_earnings numeric(12,2) not null default 0,
  gross_earnings numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  reimbursements numeric(12,2) not null default 0,
  net_amount numeric(12,2),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  quickbooks_status text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.h2a_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null references public.h2a_workers(id) on delete cascade,
  acknowledgment_type text not null,
  document_title text,
  document_version text,
  language text,
  acknowledged_at timestamptz,
  method text check (method is null or method in ('tablet','paper','verbal_witness','other')),
  witness_name text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_notifications (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid references public.h2a_workers(id) on delete cascade,
  contract_id uuid references public.h2a_contracts(id) on delete cascade,
  notice_type text not null,
  due_on date,
  completed_at timestamptz,
  reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.h2a_audit_events (
  id bigserial primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists h2a_contracts_farm_dates_idx on public.h2a_contracts(farm_id,start_date,end_date);
create index if not exists h2a_workers_farm_contract_idx on public.h2a_workers(farm_id,contract_id,status);
create index if not exists h2a_daily_farm_date_idx on public.h2a_daily_records(farm_id,work_date);
create index if not exists h2a_daily_worker_date_idx on public.h2a_daily_records(worker_id,work_date);
create index if not exists h2a_housing_assignment_worker_idx on public.h2a_housing_assignments(worker_id,check_in_date);
create index if not exists h2a_training_worker_date_idx on public.h2a_training(worker_id,training_date);
create index if not exists h2a_documents_worker_idx on public.h2a_documents(worker_id,document_type);

alter table public.h2a_user_roles enable row level security;
alter table public.h2a_contracts enable row level security;
alter table public.h2a_workers enable row level security;
alter table public.h2a_daily_records enable row level security;
alter table public.h2a_housing enable row level security;
alter table public.h2a_housing_assignments enable row level security;
alter table public.h2a_transportation enable row level security;
alter table public.h2a_training enable row level security;
alter table public.h2a_documents enable row level security;
alter table public.h2a_recruitment enable row level security;
alter table public.h2a_separations enable row level security;
alter table public.h2a_audit_events enable row level security;
alter table public.h2a_wage_rates enable row level security;
alter table public.h2a_pay_statements enable row level security;
alter table public.h2a_acknowledgments enable row level security;
alter table public.h2a_notifications enable row level security;

create or replace function private.h2a_is_owner(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.farms f
      where f.id = p_farm_id
        and f.owner_user_id = auth.uid()
    );
$$;

create or replace function private.h2a_has_role(p_farm_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.h2a_user_roles r
      where r.farm_id = p_farm_id
        and r.user_id = auth.uid()
        and r.role = any(p_roles)
    );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.h2a_is_owner(uuid) from public;
revoke all on function private.h2a_has_role(uuid,text[]) from public;
grant execute on function private.h2a_is_owner(uuid) to authenticated;
grant execute on function private.h2a_has_role(uuid,text[]) to authenticated;

create or replace function private.h2a_can_read(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, private
as $$
  select private.h2a_is_owner(p_farm_id)
    or private.h2a_has_role(p_farm_id, array['h2a_admin','crew_leader','payroll','housing_manager']);
$$;

revoke all on function private.h2a_can_read(uuid) from public;
grant execute on function private.h2a_can_read(uuid) to authenticated;

create policy "h2a roles visible to owner and assignee"
on public.h2a_user_roles for select to authenticated
using (private.h2a_is_owner(farm_id) or user_id = (select auth.uid()));

create policy "h2a owner manages roles"
on public.h2a_user_roles for all to authenticated
using (private.h2a_is_owner(farm_id))
with check (private.h2a_is_owner(farm_id));

create policy "h2a contracts readable"
on public.h2a_contracts for select to authenticated
using (private.h2a_can_read(farm_id));

create policy "h2a admin manages contracts"
on public.h2a_contracts for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a workers readable"
on public.h2a_workers for select to authenticated
using (private.h2a_can_read(farm_id));

create policy "h2a admin manages workers"
on public.h2a_workers for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a daily readable"
on public.h2a_daily_records for select to authenticated
using (private.h2a_can_read(farm_id));

create policy "h2a daily crew manages"
on public.h2a_daily_records for insert to authenticated
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader'])
);

create policy "h2a daily crew updates"
on public.h2a_daily_records for update to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader'])
);

create policy "h2a housing readable"
on public.h2a_housing for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a housing managed"
on public.h2a_housing for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager']));

create policy "h2a housing assignments readable"
on public.h2a_housing_assignments for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a housing assignments managed"
on public.h2a_housing_assignments for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager']));

create policy "h2a transportation readable"
on public.h2a_transportation for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a transportation managed"
on public.h2a_transportation for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader','payroll']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader','payroll']));

create policy "h2a training readable"
on public.h2a_training for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a training managed"
on public.h2a_training for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader']));

create policy "h2a documents readable"
on public.h2a_documents for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll','housing_manager']));
create policy "h2a documents managed"
on public.h2a_documents for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a recruitment readable"
on public.h2a_recruitment for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));
create policy "h2a recruitment managed"
on public.h2a_recruitment for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a separations readable"
on public.h2a_separations for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']));
create policy "h2a separations managed"
on public.h2a_separations for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a wage rates readable"
on public.h2a_wage_rates for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a wage rates managed"
on public.h2a_wage_rates for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']));

create policy "h2a pay statements readable"
on public.h2a_pay_statements for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']));
create policy "h2a pay statements managed"
on public.h2a_pay_statements for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']));

create policy "h2a acknowledgments readable"
on public.h2a_acknowledgments for select to authenticated using (private.h2a_can_read(farm_id));
create policy "h2a acknowledgments managed"
on public.h2a_acknowledgments for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','crew_leader']));

create policy "h2a notifications readable"
on public.h2a_notifications for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin','payroll']));
create policy "h2a notifications managed"
on public.h2a_notifications for all to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']))
with check (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

create policy "h2a audit owner admin read"
on public.h2a_audit_events for select to authenticated
using (private.h2a_is_owner(farm_id) or private.h2a_has_role(farm_id,array['h2a_admin']));

grant select, insert, update, delete on public.h2a_user_roles to authenticated;
grant select, insert, update, delete on public.h2a_contracts to authenticated;
grant select, insert, update, delete on public.h2a_workers to authenticated;
grant select, insert, update on public.h2a_daily_records to authenticated;
grant select, insert, update, delete on public.h2a_housing to authenticated;
grant select, insert, update, delete on public.h2a_housing_assignments to authenticated;
grant select, insert, update, delete on public.h2a_transportation to authenticated;
grant select, insert, update, delete on public.h2a_training to authenticated;
grant select, insert, update, delete on public.h2a_documents to authenticated;
grant select, insert, update, delete on public.h2a_recruitment to authenticated;
grant select, insert, update, delete on public.h2a_separations to authenticated;
grant select on public.h2a_audit_events to authenticated;
grant select, insert, update, delete on public.h2a_wage_rates to authenticated;
grant select, insert, update, delete on public.h2a_pay_statements to authenticated;
grant select, insert, update, delete on public.h2a_acknowledgments to authenticated;
grant select, insert, update, delete on public.h2a_notifications to authenticated;
grant usage, select on sequence public.h2a_audit_events_id_seq to authenticated;

create or replace function private.h2a_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_farm_id uuid;
  v_record_id text;
begin
  v_farm_id := coalesce(new.farm_id, old.farm_id);
  v_record_id := coalesce(new.id::text, old.id::text);

  insert into public.h2a_audit_events(
    farm_id, table_name, record_id, action, changed_by, old_data, new_data
  ) values (
    v_farm_id, tg_table_name, v_record_id, tg_op, auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.h2a_audit_trigger() from public;

create or replace function private.guard_h2a_daily_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if private.h2a_is_owner(old.farm_id)
     or private.h2a_has_role(old.farm_id,array['h2a_admin']) then
    return new;
  end if;

  if not private.h2a_has_role(old.farm_id,array['crew_leader']) then
    raise exception 'H-2A daily records may be updated only by an authorized crew leader or administrator';
  end if;

  if old.approved_at is not null then
    raise exception 'Approved H-2A daily records are locked';
  end if;

  if new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by then
    raise exception 'Crew leaders cannot approve H-2A daily records';
  end if;

  if old.locked_at is not null
     and nullif(trim(coalesce(new.change_reason,'')),'') is null then
    raise exception 'A reason is required to change a locked crew record';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_h2a_daily_update() from public;

drop trigger if exists h2a_daily_guard on public.h2a_daily_records;
create trigger h2a_daily_guard
before update on public.h2a_daily_records
for each row execute function private.guard_h2a_daily_update();

do $$
declare
  t text;
begin
  foreach t in array array[
    'h2a_contracts','h2a_workers','h2a_daily_records','h2a_housing',
    'h2a_housing_assignments','h2a_transportation','h2a_training',
    'h2a_documents','h2a_recruitment','h2a_separations','h2a_user_roles',
    'h2a_wage_rates','h2a_pay_statements','h2a_acknowledgments','h2a_notifications'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.h2a_audit_trigger()',
      t || '_audit', t
    );
  end loop;
end $$;
