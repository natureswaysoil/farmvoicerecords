-- Resolve H-2A housing review findings: tenant integrity, transactional checklist creation,
-- audit provenance, and API access hardening.

create unique index if not exists h2a_housing_inspections_farm_id_id_uidx
  on public.h2a_housing_inspections(farm_id,id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='h2a_housing_inspection_housing_same_farm_fk') then
    alter table public.h2a_housing_inspections
      add constraint h2a_housing_inspection_housing_same_farm_fk
      foreign key (farm_id,housing_id)
      references public.h2a_housing(farm_id,id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname='h2a_housing_item_inspection_same_farm_fk') then
    alter table public.h2a_housing_inspection_items
      add constraint h2a_housing_item_inspection_same_farm_fk
      foreign key (farm_id,inspection_id)
      references public.h2a_housing_inspections(farm_id,id)
      on delete cascade;
  end if;
end $$;

drop trigger if exists h2a_housing_inspections_audit on public.h2a_housing_inspections;
create trigger h2a_housing_inspections_audit
after insert or update or delete on public.h2a_housing_inspections
for each row execute function private.h2a_audit_trigger();

drop trigger if exists h2a_housing_inspection_items_audit on public.h2a_housing_inspection_items;
create trigger h2a_housing_inspection_items_audit
after insert or update or delete on public.h2a_housing_inspection_items
for each row execute function private.h2a_audit_trigger();

create or replace function public.h2a_create_housing_inspection(
  p_farm_id uuid,
  p_housing_id uuid,
  p_inspection_type text,
  p_inspection_date date,
  p_standard_basis text,
  p_authority_or_inspector text,
  p_occupancy_observed integer,
  p_gps_lat double precision,
  p_gps_lng double precision,
  p_gps_accuracy_m double precision,
  p_gps_captured_at timestamptz,
  p_summary text,
  p_checklist jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_inspection_id uuid;
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_checklist is null
     or jsonb_typeof(p_checklist) <> 'array'
     or jsonb_array_length(p_checklist) = 0 then
    raise exception 'Inspection checklist must contain at least one item';
  end if;

  insert into public.h2a_housing_inspections(
    farm_id,housing_id,inspection_type,inspection_date,status,standard_basis,
    authority_or_inspector,occupancy_observed,gps_lat,gps_lng,gps_accuracy_m,
    gps_captured_at,summary,created_by
  ) values (
    p_farm_id,p_housing_id,p_inspection_type,p_inspection_date,'in_progress',p_standard_basis,
    nullif(p_authority_or_inspector,''),p_occupancy_observed,p_gps_lat,p_gps_lng,p_gps_accuracy_m,
    p_gps_captured_at,nullif(p_summary,''),auth.uid()
  )
  returning id into v_inspection_id;

  for v_item in select value from jsonb_array_elements(p_checklist)
  loop
    insert into public.h2a_housing_inspection_items(
      farm_id,inspection_id,requirement_code,category,requirement_label,legal_basis,
      requirement_kind,result,sort_order,created_by
    ) values (
      p_farm_id,
      v_inspection_id,
      v_item->>'code',
      v_item->>'category',
      v_item->>'label',
      nullif(v_item->>'basis',''),
      coalesce(nullif(v_item->>'kind',''),'best_practice'),
      'not_checked',
      coalesce((v_item->>'sort_order')::integer,0),
      auth.uid()
    );
  end loop;

  return v_inspection_id;
end;
$$;

revoke all on function public.h2a_create_housing_inspection(
  uuid,uuid,text,date,text,text,integer,double precision,double precision,double precision,timestamptz,text,jsonb
) from public, anon;

grant execute on function public.h2a_create_housing_inspection(
  uuid,uuid,text,date,text,text,integer,double precision,double precision,double precision,timestamptz,text,jsonb
) to authenticated;

comment on function public.h2a_create_housing_inspection(
  uuid,uuid,text,date,text,text,integer,double precision,double precision,double precision,timestamptz,text,jsonb
) is 'Atomically creates one H-2A housing inspection and its checklist items under caller RLS.';
