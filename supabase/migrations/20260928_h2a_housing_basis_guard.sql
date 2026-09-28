-- Enforce housing/checklist basis integrity inside the transactional RPC.
-- Client-side guards remain UX only; this is the authoritative database check.

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
  v_housing_standard text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select h.standard_basis
    into v_housing_standard
    from public.h2a_housing h
   where h.id = p_housing_id
     and h.farm_id = p_farm_id
     and h.active = true;

  if not found then
    raise exception 'Housing profile not found for this farm';
  end if;

  if v_housing_standard is distinct from p_standard_basis then
    raise exception 'Inspection standard basis (%) does not match housing profile basis (%)',
      p_standard_basis, v_housing_standard;
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
    p_farm_id,p_housing_id,p_inspection_type,p_inspection_date,'in_progress',v_housing_standard,
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
