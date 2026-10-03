-- Equipment and machine-operation imports for FarmVoice Core.
-- Apply after the core subscription migrations.

create table if not exists public.equipment_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  source text not null check (char_length(source) between 1 and 80),
  source_record_id text,
  import_fingerprint text not null,
  machine text,
  operation text not null check (char_length(operation) between 1 and 120),
  started_at timestamptz,
  ended_at timestamptz,
  product text,
  rate numeric check (rate is null or rate >= 0),
  rate_unit text,
  area numeric check (area is null or area >= 0),
  area_unit text,
  yield_value numeric check (yield_value is null or yield_value >= 0),
  yield_unit text,
  moisture numeric check (moisture is null or (moisture >= 0 and moisture <= 100)),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint equipment_records_time_order
    check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint equipment_records_fingerprint_unique
    unique (farm_id, import_fingerprint)
);

create index if not exists equipment_records_farm_field_started_idx
  on public.equipment_records(farm_id, field_id, started_at desc);

create unique index if not exists equipment_records_source_record_unique_idx
  on public.equipment_records(farm_id, source, source_record_id)
  where source_record_id is not null;

alter table public.equipment_records enable row level security;

revoke all on table public.equipment_records from anon, authenticated;
grant select, insert, update, delete on table public.equipment_records to authenticated;

create policy "farm members read equipment records"
on public.equipment_records
for select
to authenticated
using (
  exists (
    select 1
    from public.farm_members m
    where m.farm_id = equipment_records.farm_id
      and m.user_id = (select auth.uid())
  )
);

create policy "farm owners create equipment records"
on public.equipment_records
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_members m
    where m.farm_id = equipment_records.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
  and exists (
    select 1
    from public.fields f
    where f.id = equipment_records.field_id
      and f.farm_id = equipment_records.farm_id
  )
);

create policy "farm owners update equipment records"
on public.equipment_records
for update
to authenticated
using (
  exists (
    select 1
    from public.farm_members m
    where m.farm_id = equipment_records.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
)
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.farm_members m
    where m.farm_id = equipment_records.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
  and exists (
    select 1
    from public.fields f
    where f.id = equipment_records.field_id
      and f.farm_id = equipment_records.farm_id
  )
);

create policy "farm owners delete equipment records"
on public.equipment_records
for delete
to authenticated
using (
  exists (
    select 1
    from public.farm_members m
    where m.farm_id = equipment_records.farm_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
);

create or replace function private.equipment_record_field_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  history_type text;
  history_summary text;
begin
  if lower(new.operation) ~ '(harvest|combine)' then
    history_type := 'harvest';
  elsif lower(new.operation) ~ '(spray|apply|application|fertiliz)' then
    history_type := 'input';
  elsif lower(new.operation) ~ '(plant|seed)' then
    history_type := 'planting';
  else
    history_type := 'note';
  end if;

  history_summary := concat_ws(
    ' · ',
    nullif(new.operation, ''),
    nullif(new.machine, ''),
    case
      when new.product is not null and new.rate is not null
        then new.product || ' @ ' || new.rate || coalesce(' ' || new.rate_unit, '')
      when new.product is not null then new.product
      when new.rate is not null then new.rate || coalesce(' ' || new.rate_unit, '')
    end,
    case
      when new.area is not null then new.area || coalesce(' ' || new.area_unit, '')
    end,
    case
      when new.yield_value is not null then 'Yield ' || new.yield_value || coalesce(' ' || new.yield_unit, '')
    end,
    case
      when new.moisture is not null then 'Moisture ' || new.moisture || '%'
    end
  );

  insert into public.field_history_events (
    field_id,
    farm_id,
    event_type,
    event_date,
    summary,
    details,
    created_by
  ) values (
    new.field_id,
    new.farm_id,
    history_type,
    coalesce(new.started_at::date, new.created_at::date),
    history_summary,
    jsonb_strip_nulls(
      jsonb_build_object(
        'equipment_record_id', new.id,
        'source', new.source,
        'source_record_id', new.source_record_id,
        'machine', new.machine,
        'operation', new.operation,
        'started_at', new.started_at,
        'ended_at', new.ended_at,
        'product', new.product,
        'rate', new.rate,
        'rate_unit', new.rate_unit,
        'area', new.area,
        'area_unit', new.area_unit,
        'yield_value', new.yield_value,
        'yield_unit', new.yield_unit,
        'moisture', new.moisture
      )
    ),
    new.created_by
  );

  return new;
end;
$$;

revoke all on function private.equipment_record_field_history() from public, anon, authenticated;

drop trigger if exists equipment_record_field_history on public.equipment_records;
create trigger equipment_record_field_history
after insert on public.equipment_records
for each row
execute function private.equipment_record_field_history();

drop trigger if exists require_farm_write_plan on public.equipment_records;
create trigger require_farm_write_plan
before insert or update or delete on public.equipment_records
for each row
execute function private.require_farm_write_plan();
