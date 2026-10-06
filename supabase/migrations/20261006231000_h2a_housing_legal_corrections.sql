-- Correct detailed H-2A housing checklist criteria identified after review.
-- New template versions preserve previously captured inspection snapshots unchanged.

update public.compliance_template_versions
set status='superseded', effective_to=date '2026-10-05'
where module='h2a_housing'
  and version in ('farmvoice-osha-1910-142-v2','farmvoice-eta-654-v1')
  and status='active';

with j as (
  select id from public.compliance_jurisdictions where code='US-FED'
)
insert into public.compliance_template_versions(
  jurisdiction_id,module,housing_type,standard_basis,version,effective_from,
  source_authority,source_reference,status,content_hash
)
select j.id,'h2a_housing','employer_provided','osha_1910_142',
       'farmvoice-osha-1910-142-v3',date '2026-10-06',
       'U.S. Department of Labor / OSHA',
       'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.142',
       'active',
       encode(digest('farmvoice-osha-1910-142-v3|2026-10-06|legal-corrections','sha256'),'hex')
from j
on conflict (jurisdiction_id,module,version) do update
set status='active',
    source_authority=excluded.source_authority,
    source_reference=excluded.source_reference,
    content_hash=excluded.content_hash;

with old_tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-osha-1910-142-v2'
), new_tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-osha-1910-142-v3'
)
insert into public.compliance_requirements(
  template_version_id,requirement_code,category,requirement_label,legal_basis,
  requirement_kind,applicability,validation_rule,sort_order,active
)
select new_tv.id,r.requirement_code,r.category,r.requirement_label,r.legal_basis,
       r.requirement_kind,r.applicability,r.validation_rule,r.sort_order,r.active
from old_tv
join public.compliance_requirements r on r.template_version_id=old_tv.id
cross join new_tv
on conflict (template_version_id,requirement_code) do update
set category=excluded.category,
    requirement_label=excluded.requirement_label,
    legal_basis=excluded.legal_basis,
    requirement_kind=excluded.requirement_kind,
    applicability=excluded.applicability,
    validation_rule=excluded.validation_rule,
    sort_order=excluded.sort_order,
    active=excluded.active;

with tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-osha-1910-142-v3'
)
update public.compliance_requirements r
set requirement_label = case r.requirement_code
  when 'OSHA_DOUBLE_BUNK_SPACING' then 'Double bunks are at least 4 ft apart laterally/end to end, with at least 27 in clear space between lower and upper bunks.'
  when 'OSHA_WOOD_FLOOR' then 'Wood floors are smooth and tight, kept in good repair, and elevated at least 1 ft above ground at all points.'
  when 'OSHA_WINDOW_AREA' then 'Living-quarter windows total at least 10% of floor area.'
  when 'OSHA_WINDOW_OPENING' then 'At least one-half of each window can be opened for ventilation.'
  when 'OSHA_WATER_QUANTITY' then 'Water supply delivers at least 35 gallons per person per day at a peak rate of 2.5 times the average hourly demand.'
  when 'OSHA_YARD_HYDRANT' then 'If water is not piped to shelters, no shelter is more than 100 ft from a yard hydrant; distribution lines support simultaneous fixture use at normal pressure.'
  when 'OSHA_DRINKING_FOUNTAINS' then 'Where water under pressure is available, at least one drinking fountain is provided for each 100 occupants or fraction thereof.'
  when 'OSHA_TOILET_RATIO' then 'Shared toilet facilities provide at least 1 water closet/privy seat per 15 persons of each sex, with at least 2 units for any shared facility.'
  when 'OSHA_URINALS' then 'Urinals provide at least 1 unit or 2 linear ft of trough per 25 men; the splash-area floor is moisture-impervious for at least 15 in, and pressure-water urinals have adequate flushing.'
  when 'OSHA_LIGHT_FIXTURE_OUTLET' then 'Where electric service is available, each habitable room has at least 1 ceiling-type light and 1 separate floor/wall convenience outlet.'
  when 'OSHA_COMMON_ROOM_LIGHTS' then 'Laundry rooms, toilet rooms, and congregation rooms have at least 1 ceiling- or wall-type light fixture.'
  when 'OSHA_LIGHT_LEVELS' then 'Toilet/storage rooms have at least 20 foot-candles at 30 in above the floor; kitchens, living quarters, and other rooms have at least 30 foot-candles at 30 in.'
  else r.requirement_label end,
legal_basis = case r.requirement_code
  when 'OSHA_WOOD_FLOOR' then '29 CFR 1910.142(b)(4)-(5)'
  when 'OSHA_WINDOW_AREA' then '29 CFR 1910.142(b)(7)'
  when 'OSHA_WINDOW_OPENING' then '29 CFR 1910.142(b)(7)'
  when 'OSHA_YARD_HYDRANT' then '29 CFR 1910.142(c)(3)'
  when 'OSHA_LIGHT_FIXTURE_OUTLET' then '29 CFR 1910.142(g)'
  when 'OSHA_COMMON_ROOM_LIGHTS' then '29 CFR 1910.142(g)'
  when 'OSHA_LIGHT_LEVELS' then '29 CFR 1910.142(g)'
  else r.legal_basis end,
validation_rule = case r.requirement_code
  when 'OSHA_DOUBLE_BUNK_SPACING' then '{"min_bunk_clearance_in":27,"min_double_bunk_spacing_in":48}'::jsonb
  when 'OSHA_WATER_QUANTITY' then '{"gallons_per_person_per_day":35,"peak_multiplier_average_hourly_demand":2.5}'::jsonb
  when 'OSHA_DRINKING_FOUNTAINS' then '{"max_occupants_per_fountain":100}'::jsonb
  when 'OSHA_TOILET_RATIO' then '{"max_persons_per_toilet_seat":15,"shared_minimum_units":2}'::jsonb
  when 'OSHA_URINALS' then '{"max_men_per_urinal_unit":25,"trough_inches_per_25_men":24,"impervious_floor_extension_in":15}'::jsonb
  when 'OSHA_LIGHT_LEVELS' then '{"toilet_storage_foot_candles":20,"other_rooms_foot_candles":30,"measurement_height_in":30}'::jsonb
  else r.validation_rule end
from tv
where r.template_version_id=tv.id
  and r.requirement_code in (
    'OSHA_DOUBLE_BUNK_SPACING','OSHA_WOOD_FLOOR','OSHA_WINDOW_AREA','OSHA_WINDOW_OPENING',
    'OSHA_WATER_QUANTITY','OSHA_YARD_HYDRANT','OSHA_DRINKING_FOUNTAINS',
    'OSHA_TOILET_RATIO','OSHA_URINALS','OSHA_LIGHT_FIXTURE_OUTLET',
    'OSHA_COMMON_ROOM_LIGHTS','OSHA_LIGHT_LEVELS'
  );

with j as (
  select id from public.compliance_jurisdictions where code='US-FED'
)
insert into public.compliance_template_versions(
  jurisdiction_id,module,housing_type,standard_basis,version,effective_from,
  source_authority,source_reference,status,content_hash
)
select j.id,'h2a_housing','employer_provided','eta_654',
       'farmvoice-eta-654-v2',date '2026-10-06',
       'U.S. Department of Labor, Wage and Hour Division',
       'https://www.ecfr.gov/current/title-20/chapter-V/part-654/subpart-E',
       'active',
       encode(digest('farmvoice-eta-654-v2|2026-10-06|legal-corrections','sha256'),'hex')
from j
on conflict (jurisdiction_id,module,version) do update
set status='active',
    source_authority=excluded.source_authority,
    source_reference=excluded.source_reference,
    content_hash=excluded.content_hash;

with old_tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-eta-654-v1'
), new_tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-eta-654-v2'
)
insert into public.compliance_requirements(
  template_version_id,requirement_code,category,requirement_label,legal_basis,
  requirement_kind,applicability,validation_rule,sort_order,active
)
select new_tv.id,r.requirement_code,r.category,r.requirement_label,r.legal_basis,
       r.requirement_kind,r.applicability,r.validation_rule,r.sort_order,r.active
from old_tv
join public.compliance_requirements r on r.template_version_id=old_tv.id
cross join new_tv
on conflict (template_version_id,requirement_code) do update
set category=excluded.category,
    requirement_label=excluded.requirement_label,
    legal_basis=excluded.legal_basis,
    requirement_kind=excluded.requirement_kind,
    applicability=excluded.applicability,
    validation_rule=excluded.validation_rule,
    sort_order=excluded.sort_order,
    active=excluded.active;

with tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-eta-654-v2'
)
update public.compliance_requirements r
set requirement_label = case r.requirement_code
  when 'ETA_CEILING_HEIGHT' then 'At least one-half of each living unit floor area has a ceiling height of at least 7 ft; floor area under ceilings below 5 ft is excluded from minimum floor-space calculations.'
  when 'ETA_WINDOWS' then 'Each habitable room has an outside window/skylight; total window/skylight area is at least 10% of usable floor area, with at least 45% of that required minimum area openable unless equivalent ventilation is provided.'
  when 'ETA_HEAT_68' then 'During normal occupancy, if the temperature in living quarters or service rooms falls below 68°F, installed heating equipment can maintain at least 68°F.'
  when 'ETA_TOILET_RATIO' then 'Toilets provide at least 1 water closet/privy seat per 15 occupants of each sex, with at least 1 unit for each sex in common-use facilities.'
  when 'ETA_COOKING_INDIVIDUAL' then 'Individual/family cooking areas have at least a 2-burner stove/hot plate, food-prep/storage space, refrigeration at 45°F or below, adequate seating, lighting, ventilation, and required nonabsorbent/fire-resistant wall finishes.'
  when 'ETA_COOKING_COMMON' then 'Common cooking/eating is separate from sleeping; provides at least a 2-burner stove/hot plate per 10 persons or 2 families, refrigeration at 45°F or below, hot/cold pressurized sink water, adequate storage/seating/light/ventilation, nonabsorbent cleanable floors, and required wall finishes.'
  when 'ETA_FIRE_ESCAPE_LARGE' then 'Sleeping quarters for 10 or more persons, plus every central dining facility and common assembly room regardless of occupancy, have at least 2 remotely separated doors providing alternate escape.'
  when 'ETA_SECOND_FLOOR_EXIT' then 'Second-story sleeping quarters and common assembly rooms have a stairway plus either a permanent affixed exterior ladder or a second stairway.'
  when 'ETA_FIRE_EXTINGUISHERS' then 'Fire extinguishing equipment is readily accessible within 100 ft of each housing unit and provides protection equal to a 2.5-gallon stored-pressure or 5-gallon pump-type water extinguisher.'
  when 'ETA_FIRST_AID' then 'First-aid facilities equivalent to a 16-unit American Red Cross kit are readily accessible at all times at a ratio of at least 1 kit per 50 persons.'
  else r.requirement_label end,
validation_rule = case r.requirement_code
  when 'ETA_CEILING_HEIGHT' then '{"min_fraction_floor_area_at_7ft":0.5,"exclude_floor_area_below_ft":5}'::jsonb
  when 'ETA_WINDOWS' then '{"min_window_area_fraction_usable_floor":0.10,"min_openable_fraction_required_window_area":0.45}'::jsonb
  when 'ETA_HEAT_68' then '{"minimum_indoor_temperature_f":68,"condition":"during normal occupancy when indoor temperature falls below 68F"}'::jsonb
  when 'ETA_TOILET_RATIO' then '{"max_occupants_per_toilet_seat":15,"common_use_minimum_units_per_sex":1}'::jsonb
  when 'ETA_COOKING_INDIVIDUAL' then '{"minimum_burners":2,"maximum_refrigeration_temperature_f":45}'::jsonb
  when 'ETA_COOKING_COMMON' then '{"minimum_burners":2,"max_persons_per_stove":10,"max_families_per_stove":2,"maximum_refrigeration_temperature_f":45,"sink_water":"hot_and_cold_under_pressure"}'::jsonb
  when 'ETA_FIRE_ESCAPE_LARGE' then '{"sleeping_occupancy_threshold":10,"central_dining_always_two_exits":true,"common_assembly_always_two_exits":true}'::jsonb
  when 'ETA_SECOND_FLOOR_EXIT' then '{"second_escape":"permanent_affixed_exterior_ladder_or_second_stairway"}'::jsonb
  when 'ETA_FIRE_EXTINGUISHERS' then '{"max_distance_ft":100,"equivalent_water_extinguisher_gallons_stored_pressure":2.5,"equivalent_pump_type_gallons":5}'::jsonb
  when 'ETA_FIRST_AID' then '{"max_persons_per_kit":50,"kit_equivalent":"16-unit American Red Cross"}'::jsonb
  else r.validation_rule end
from tv
where r.template_version_id=tv.id
  and r.requirement_code in (
    'ETA_CEILING_HEIGHT','ETA_WINDOWS','ETA_HEAT_68','ETA_TOILET_RATIO',
    'ETA_COOKING_INDIVIDUAL','ETA_COOKING_COMMON','ETA_FIRE_ESCAPE_LARGE',
    'ETA_SECOND_FLOOR_EXIT','ETA_FIRE_EXTINGUISHERS','ETA_FIRST_AID'
  );

comment on table public.compliance_template_versions is
  'Versioned compliance content. Superseded versions remain for historical inspection snapshots; active versions drive new inspections.';
