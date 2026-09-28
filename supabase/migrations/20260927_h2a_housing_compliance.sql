-- H-2A housing compliance workspace.
-- Additive extension to the existing H-2A module. FarmVoice records evidence and review;
-- it does not determine legal compliance.

alter table public.h2a_housing
  add column if not exists housing_type text not null default 'employer_provided'
    check (housing_type in ('employer_provided','rental_public','range','other')),
  add column if not exists standard_basis text not null default 'osha_1910_142'
    check (standard_basis in ('osha_1910_142','eta_654','state_local','range_655_235','mixed','other')),
  add column if not exists jurisdiction text,
  add column if not exists year_built integer check (year_built is null or year_built between 1800 and 2200),
  add column if not exists bedrooms integer check (bedrooms is null or bedrooms >= 0),
  add column if not exists sleeping_floor_sqft numeric(10,2) check (sleeping_floor_sqft is null or sleeping_floor_sqft >= 0),
  add column if not exists cooking_living_sleeping_sqft numeric(10,2) check (cooking_living_sleeping_sqft is null or cooking_living_sleeping_sqft >= 0),
  add column if not exists last_self_check_at timestamptz;

create table if not exists public.h2a_housing_inspections (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  housing_id uuid not null references public.h2a_housing(id) on delete cascade,
  inspection_type text not null
    check (inspection_type in ('preoccupancy','agency','reinspection','routine_maintenance','incident_followup')),
  inspection_date date not null,
  status text not null default 'in_progress'
    check (status in ('in_progress','needs_action','ready_for_review','certified','closed')),
  standard_basis text not null default 'osha_1910_142',
  authority_or_inspector text,
  certificate_number text,
  certificate_expires_on date,
  occupancy_observed integer check (occupancy_observed is null or occupancy_observed >= 0),
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy_m double precision,
  gps_captured_at timestamptz,
  summary text,
  evidence_reference text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.h2a_housing_inspection_items (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  inspection_id uuid not null references public.h2a_housing_inspections(id) on delete cascade,
  requirement_code text not null,
  category text not null,
  requirement_label text not null,
  legal_basis text,
  requirement_kind text not null default 'legal'
    check (requirement_kind in ('legal','best_practice')),
  result text not null default 'not_checked'
    check (result in ('not_checked','pass','fail','not_applicable')),
  notes text,
  corrective_action text,
  corrective_due_on date,
  resolved_at timestamptz,
  evidence_reference text,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, requirement_code)
);

create index if not exists h2a_housing_farm_active_idx
  on public.h2a_housing(farm_id,active);
create index if not exists h2a_housing_inspections_housing_date_idx
  on public.h2a_housing_inspections(housing_id,inspection_date desc);
create index if not exists h2a_housing_inspections_farm_status_idx
  on public.h2a_housing_inspections(farm_id,status,inspection_date desc);
create index if not exists h2a_housing_items_inspection_result_idx
  on public.h2a_housing_inspection_items(inspection_id,result);
create index if not exists h2a_housing_items_due_idx
  on public.h2a_housing_inspection_items(farm_id,corrective_due_on)
  where result = 'fail' and resolved_at is null;

alter table public.h2a_housing_inspections enable row level security;
alter table public.h2a_housing_inspection_items enable row level security;

drop policy if exists "h2a housing inspections readable" on public.h2a_housing_inspections;
create policy "h2a housing inspections readable"
on public.h2a_housing_inspections for select to authenticated
using (private.h2a_can_read(farm_id));

drop policy if exists "h2a housing inspections managed" on public.h2a_housing_inspections;
create policy "h2a housing inspections managed"
on public.h2a_housing_inspections for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager'])
);

drop policy if exists "h2a housing inspection items readable" on public.h2a_housing_inspection_items;
create policy "h2a housing inspection items readable"
on public.h2a_housing_inspection_items for select to authenticated
using (private.h2a_can_read(farm_id));

drop policy if exists "h2a housing inspection items managed" on public.h2a_housing_inspection_items;
create policy "h2a housing inspection items managed"
on public.h2a_housing_inspection_items for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager'])
);

grant select,insert,update,delete on public.h2a_housing_inspections to authenticated;
grant select,insert,update,delete on public.h2a_housing_inspection_items to authenticated;

comment on table public.h2a_housing_inspections is
  'Employer housing inspection and maintenance evidence. Status is workflow state, not a legal compliance determination.';
comment on table public.h2a_housing_inspection_items is
  'Checklist results and corrective actions. Legal basis is informational and must be validated for the applicable housing type and jurisdiction.';
