begin;

create table public.precision_import_batches (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  source_system text not null default 'generic'
    check (length(trim(source_system)) between 1 and 80),
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  file_type text not null check (file_type in ('csv','geojson')),
  status text not null default 'imported'
    check (status in ('imported','partial','failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  error_summary text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.precision_operations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null,
  import_batch_id uuid references public.precision_import_batches(id) on delete set null,
  operation_type text not null
    check (operation_type in ('application','harvest','planting','other')),
  source_system text not null default 'generic'
    check (length(trim(source_system)) between 1 and 80),
  external_id text,
  started_at timestamptz,
  ended_at timestamptz,
  crop text,
  field_name_source text,
  machine_name text,
  implement_name text,
  operator_name text,
  acres double precision check (acres is null or acres >= 0),
  product_name text,
  product_rate double precision check (product_rate is null or product_rate >= 0),
  product_rate_unit text,
  total_product double precision check (total_product is null or total_product >= 0),
  total_product_unit text,
  average_yield double precision check (average_yield is null or average_yield >= 0),
  yield_unit text,
  total_yield double precision check (total_yield is null or total_yield >= 0),
  total_yield_unit text,
  average_moisture_pct double precision
    check (average_moisture_pct is null or (average_moisture_pct >= 0 and average_moisture_pct <= 100)),
  centroid_lat double precision check (centroid_lat is null or centroid_lat between -90 and 90),
  centroid_lng double precision check (centroid_lng is null or centroid_lng between -180 and 180),
  geometry_geojson jsonb,
  raw_summary jsonb not null default '{}'::jsonb,
  pesticide_record_id uuid references public.farm_records(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (
    geometry_geojson is null
    or jsonb_typeof(geometry_geojson) in ('object','array')
  )
);

create table public.precision_operation_samples (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.precision_operations(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 0),
  recorded_at timestamptz,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  application_rate double precision check (application_rate is null or application_rate >= 0),
  application_rate_unit text,
  yield_value double precision check (yield_value is null or yield_value >= 0),
  yield_unit text,
  moisture_pct double precision check (moisture_pct is null or (moisture_pct >= 0 and moisture_pct <= 100)),
  speed_value double precision check (speed_value is null or speed_value >= 0),
  speed_unit text,
  product_name text,
  raw_sample jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(operation_id, sequence_no)
);

create index precision_import_batches_farm_idx
  on public.precision_import_batches(farm_id, created_at desc);
create index precision_operations_farm_time_idx
  on public.precision_operations(farm_id, started_at desc, operation_type);
create index precision_operations_field_idx
  on public.precision_operations(farm_id, field_id, operation_type);
create index precision_operations_external_idx
  on public.precision_operations(farm_id, source_system, external_id)
  where external_id is not null;
create index precision_operation_samples_operation_idx
  on public.precision_operation_samples(operation_id, sequence_no);
create index precision_operation_samples_farm_idx
  on public.precision_operation_samples(farm_id, recorded_at desc);

alter table public.precision_import_batches enable row level security;
alter table public.precision_operations enable row level security;
alter table public.precision_operation_samples enable row level security;

revoke all on public.precision_import_batches from anon,authenticated;
revoke all on public.precision_operations from anon,authenticated;
revoke all on public.precision_operation_samples from anon,authenticated;

grant select,insert,update,delete on public.precision_import_batches to authenticated;
grant select,insert,update,delete on public.precision_operations to authenticated;
grant select,insert,delete on public.precision_operation_samples to authenticated;

create policy "precision batches visible to farm members"
on public.precision_import_batches for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members create precision batches"
on public.precision_import_batches for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and created_by=auth.uid()
);

create policy "batch creators or owners update precision batches"
on public.precision_import_batches for update to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid())
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and (private.core_is_owner(farm_id) or created_by=auth.uid())
);

create policy "batch creators or owners delete precision batches"
on public.precision_import_batches for delete to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid());

create policy "precision operations visible to farm members"
on public.precision_operations for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members create precision operations"
on public.precision_operations for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and created_by=auth.uid()
);

create policy "operation creators or owners update precision operations"
on public.precision_operations for update to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid())
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and (private.core_is_owner(farm_id) or created_by=auth.uid())
);

create policy "operation creators or owners delete precision operations"
on public.precision_operations for delete to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid());

create policy "precision samples visible to farm members"
on public.precision_operation_samples for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members add precision samples"
on public.precision_operation_samples for insert to authenticated
with check (
  private.core_is_owner(farm_id) or private.core_is_member(farm_id)
);

create policy "operation owners delete precision samples"
on public.precision_operation_samples for delete to authenticated
using (
  private.core_is_owner(farm_id)
  or exists (
    select 1 from public.precision_operations o
    where o.id=operation_id
      and o.farm_id=farm_id
      and o.created_by=auth.uid()
  )
);

create trigger precision_import_batches_plan
before insert or update or delete on public.precision_import_batches
for each row execute function private.require_farm_write_plan();

create trigger precision_operations_plan
before insert or update or delete on public.precision_operations
for each row execute function private.require_farm_write_plan();

create trigger precision_operation_samples_plan
before insert or delete on public.precision_operation_samples
for each row execute function private.require_farm_write_plan();

commit;
