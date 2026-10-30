-- Expand FarmVoice H-2A housing inspection templates using current U.S. Department of Labor checklists.
-- These templates are recordkeeping/pre-inspection aids only; they do not certify legal compliance.

-- Retire the summary OSHA template so the UI selects the detailed active version.
update public.compliance_template_versions
set status='superseded',
    effective_to=date '2026-10-05'
where module='h2a_housing'
  and version='farmvoice-osha-1910-142-v1'
  and status='active';

with j as (
  select id from public.compliance_jurisdictions where code='US-FED'
)
insert into public.compliance_template_versions(
  jurisdiction_id,module,housing_type,standard_basis,version,effective_from,
  source_authority,source_reference,status,content_hash
)
select j.id,'h2a_housing','employer_provided','osha_1910_142',
       'farmvoice-osha-1910-142-v2',date '1980-04-03',
       'U.S. Department of Labor, Wage and Hour Division',
       'https://www.dol.gov/agencies/whd/osha-housing-checklist',
       'active',
       encode(digest('farmvoice-osha-1910-142-v2|2026-10-06','sha256'),'hex')
from j
on conflict (jurisdiction_id,module,version) do update
set status='active',
    source_authority=excluded.source_authority,
    source_reference=excluded.source_reference,
    content_hash=excluded.content_hash;

with tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-osha-1910-142-v2'
), src(code,category,label,basis,kind,ord) as (
 values
 ('OSHA_SITE_DRAINAGE','Site','Drainage does not endanger drinking/public water and standing-water depressions are controlled.','29 CFR 1910.142(a)(1)','legal',10),
 ('OSHA_SITE_SURFACE_WATER','Site','Housing is at least 200 ft from untreated swamps, pools, sinkholes, or similar surface water.','29 CFR 1910.142(a)(1)','legal',20),
 ('OSHA_SITE_FLOODING','Site','Site is not subject to periodic flooding.','29 CFR 1910.142(a)(1)','legal',30),
 ('OSHA_SITE_DENSITY','Site','Housing layout is not overcrowded.','29 CFR 1910.142(a)(2)','legal',40),
 ('OSHA_SITE_LIVESTOCK','Site','Housing is at least 500 ft from livestock.','29 CFR 1910.142(a)(2)','legal',50),
 ('OSHA_SITE_REFUSE','Site','Grounds are free of rubbish, garbage, waste paper, and other refuse.','29 CFR 1910.142(a)(3)','legal',60),

 ('OSHA_SHELTER_ELEMENTS','Shelter','Structure protects occupants from weather and the elements.','29 CFR 1910.142(b)(1)','legal',100),
 ('OSHA_SLEEPING_SPACE','Shelter','Sleeping rooms provide at least 50 sq ft per occupant.','29 CFR 1910.142(b)(2)','legal',110),
 ('OSHA_CEILING_HEIGHT','Shelter','Sleeping-room ceiling height is at least 7 ft.','29 CFR 1910.142(b)(2)','legal',120),
 ('OSHA_BED_EACH','Shelter','Each occupant has a bed, cot, or bunk.','29 CFR 1910.142(b)(3)','legal',130),
 ('OSHA_PERSONAL_STORAGE','Shelter','Suitable storage is available for clothing and personal belongings.','29 CFR 1910.142(b)(3)','legal',140),
 ('OSHA_BED_SPACING','Shelter','Beds are at least 3 ft apart and at least 1 ft above the floor.','29 CFR 1910.142(b)(3)','legal',150),
 ('OSHA_DOUBLE_BUNK_SPACING','Shelter','Double bunks are at least 4 ft apart with more than 27 in between bunks.','29 CFR 1910.142(b)(3)','legal',160),
 ('OSHA_NO_TRIPLE_BUNKS','Shelter','Triple-deck bunks are not used.','29 CFR 1910.142(b)(3)','legal',170),
 ('OSHA_FLOOR_MATERIAL','Shelter','Floors are wood, asphalt, or concrete and are in good repair.','29 CFR 1910.142(b)(4)','legal',180),
 ('OSHA_WOOD_FLOOR','Shelter','Wood floors are smooth/tight and elevated at least 1 ft above ground.','29 CFR 1910.142(b)(4)','legal',190),
 ('OSHA_WINDOW_AREA','Shelter','Window area in living quarters is at least 10% of floor area.','29 CFR 1910.142(b)(8)','legal',200),
 ('OSHA_WINDOW_OPENING','Shelter','Windows open at least halfway for ventilation.','29 CFR 1910.142(b)(8)','legal',210),
 ('OSHA_SCREENS','Shelter','Exterior openings use intact 16-mesh screening.','29 CFR 1910.142(b)(8)','legal',220),
 ('OSHA_SCREEN_DOORS','Shelter','Screen doors have working self-closing devices.','29 CFR 1910.142(b)(8)','legal',230),
 ('OSHA_COMBINED_SPACE','Shelter','Rooms used for cooking, living, and sleeping provide at least 100 sq ft per person.','29 CFR 1910.142(b)(9)','legal',240),
 ('OSHA_FOOD_PREP_SPACE','Shelter','Sanitary food-storage and food-preparation facilities are provided.','29 CFR 1910.142(b)(9)','legal',250),
 ('OSHA_COMMON_STOVES','Shelter','Common cooking has at least one stove per 10 people or per two families.','29 CFR 1910.142(b)(10)','legal',260),
 ('OSHA_COMMON_COOKING_SCREENED','Shelter','Common stoves are in an enclosed, screened shelter.','29 CFR 1910.142(b)(10)','legal',270),
 ('OSHA_EQUIPMENT_CODES','Shelter','Heating, cooking, and water-heating equipment meets applicable state/local installation rules.','29 CFR 1910.142(b)(11)','legal',280),
 ('OSHA_COLD_WEATHER_HEAT','Shelter','Adequate heating is available when housing is used in cold weather.','29 CFR 1910.142(b)(11)','legal',290),

 ('OSHA_WATER_APPROVED','Water','Water supply is adequate, convenient, and approved by the appropriate health authority.','29 CFR 1910.142(c)(1)','legal',300),
 ('OSHA_WATER_QUANTITY','Water','Water capacity supports at least 35 gallons per person per day at required peak demand.','29 CFR 1910.142(c)(2)','legal',310),
 ('OSHA_WATER_PRESSURE','Water','Distribution lines maintain normal operating pressure with fixtures operating together.','29 CFR 1910.142(c)(3)','legal',320),
 ('OSHA_YARD_HYDRANT','Water','If indoor water is unavailable, a yard hydrant is within 100 ft of shelters.','29 CFR 1910.142(c)(4)','legal',330),
 ('OSHA_DRINKING_FOUNTAINS','Water','Where pressurized water is available, drinking fountains are provided at the required ratio.','29 CFR 1910.142(c)(4)','legal',340),
 ('OSHA_NO_COMMON_CUPS','Water','Common drinking cups are not used.','29 CFR 1910.142(c)(4)','legal',350),

 ('OSHA_TOILET_ACCESS','Toilets','Toilet rooms are accessible without passing through a sleeping room.','29 CFR 1910.142(d)(1)','legal',400),
 ('OSHA_TOILET_VENTILATION','Toilets','Toilet rooms have the required outside opening or equivalent ventilation.','29 CFR 1910.142(d)(2)','legal',410),
 ('OSHA_TOILET_SCREENS','Toilets','Outside toilet-room openings are screened with 16-mesh material.','29 CFR 1910.142(d)(2)','legal',420),
 ('OSHA_TOILET_SEPARATION','Toilets','Toilet fixtures are located only in rooms used for toilet purposes.','29 CFR 1910.142(d)(3)','legal',430),
 ('OSHA_TOILET_DISTANCE','Toilets','A toilet room is within 200 ft of each sleeping-room door.','29 CFR 1910.142(d)(4)','legal',440),
 ('OSHA_PRIVY_DISTANCE','Toilets','Privies/outhouses are at least 100 ft from sleeping, dining, lunch, and kitchen areas.','29 CFR 1910.142(d)(4)','legal',450),
 ('OSHA_TOILET_SEX_SEPARATION','Toilets','Shared facilities have separate, clearly marked toilet rooms for each sex when required.','29 CFR 1910.142(d)(5)','legal',460),
 ('OSHA_TOILET_RATIO','Toilets','Shared toilet seats meet the required occupant ratio and minimum count.','29 CFR 1910.142(d)(5)','legal',470),
 ('OSHA_URINALS','Toilets','Urinals, when used, meet required ratios, materials, drainage, and flushing requirements.','29 CFR 1910.142(d)(6)','legal',480),
 ('OSHA_TOILET_LIGHTING','Toilets','Toilet rooms have safe lighting available day and night.','29 CFR 1910.142(d)(8)','legal',490),
 ('OSHA_TOILET_PAPER','Toilets','Adequate toilet paper is supplied.','29 CFR 1910.142(d)(9)','legal',500),
 ('OSHA_TOILET_SANITATION','Toilets','Toilet facilities are kept sanitary and cleaned at least daily.','29 CFR 1910.142(d)(10)','legal',510),

 ('OSHA_SEWAGE','Sewage','Camp sewer lines and floor drains connect to public sewer where available.','29 CFR 1910.142(e)','legal',550),

 ('OSHA_WASHBASIN_RATIO','Bathing & Laundry','Handwashing facilities meet the family/shared-facility ratio.','29 CFR 1910.142(f)(1)(i)','legal',600),
 ('OSHA_SHOWER_RATIO','Bathing & Laundry','At least one shower head is provided for every 10 persons.','29 CFR 1910.142(f)(1)(ii)','legal',610),
 ('OSHA_LAUNDRY_RATIO','Bathing & Laundry','Laundry trays/tubs meet the required ratio.','29 CFR 1910.142(f)(1)(iii)','legal',620),
 ('OSHA_SLOP_SINK','Bathing & Laundry','Each laundry/handwashing/bathing building contains a slop sink.','29 CFR 1910.142(f)(1)(iv)','legal',630),
 ('OSHA_SERVICE_FLOORS','Bathing & Laundry','Service-area floors are waterproof, smooth, and nonslip.','29 CFR 1910.142(f)(2)','legal',640),
 ('OSHA_FLOOR_DRAINS','Bathing & Laundry','Shower and laundry rooms have floor drains and coved floor/curb junctions.','29 CFR 1910.142(f)(2)','legal',650),
 ('OSHA_SHOWER_WALLS','Bathing & Laundry','Shower-room walls/partitions are smooth and waterproof to the splash line.','29 CFR 1910.142(f)(2)','legal',660),
 ('OSHA_HOT_COLD_WATER','Bathing & Laundry','Adequate hot and cold running water is available for bathing and laundry.','29 CFR 1910.142(f)(3)','legal',670),
 ('OSHA_SERVICE_HEAT','Bathing & Laundry','Service buildings can maintain at least 70°F during cold weather.','29 CFR 1910.142(f)(4)','legal',680),
 ('OSHA_DRYING','Bathing & Laundry','Facilities are available for drying clothes.','29 CFR 1910.142(f)(5)','legal',690),
 ('OSHA_SERVICE_CLEAN','Bathing & Laundry','Service buildings are kept clean.','29 CFR 1910.142(f)(6)','legal',700),

 ('OSHA_LIGHT_FIXTURE_OUTLET','Lighting','Where electricity is available, required ceiling light and convenience outlet are provided.','29 CFR 1910.142(g)(1)','legal',750),
 ('OSHA_COMMON_ROOM_LIGHTS','Lighting','Laundry, toilet, and congregation rooms have ceiling/wall light fixtures.','29 CFR 1910.142(g)(2)','legal',760),
 ('OSHA_LIGHT_LEVELS','Lighting','Toilet/storage and other rooms meet the applicable minimum light levels.','29 CFR 1910.142(g)(3)','legal',770),

 ('OSHA_REFUSE_CONTAINER','Refuse','Approved fly-tight, rodent-tight, cleanable refuse containers are provided.','29 CFR 1910.142(h)(1)','legal',800),
 ('OSHA_REFUSE_PER_SHELTER','Refuse','At least one refuse container is provided for each family shelter.','29 CFR 1910.142(h)(2)','legal',810),
 ('OSHA_REFUSE_DISTANCE','Refuse','Required refuse containers are within 100 ft of each family shelter and properly supported.','29 CFR 1910.142(h)(2)','legal',820),
 ('OSHA_REFUSE_CLEAN','Refuse','Refuse containers are kept clean.','29 CFR 1910.142(h)(3)','legal',830),
 ('OSHA_REFUSE_FREQUENCY','Refuse','Refuse is emptied when full and at least twice weekly.','29 CFR 1910.142(h)(4)','legal',840),

 ('OSHA_FOOD_PESTS','Food','Kitchen/dining areas are free of vermin, rodents, flies, and similar pests.','29 CFR 1910.142(i)','legal',900),
 ('OSHA_FOOD_COLD_STORAGE','Food','Food can be stored to prevent spoilage.','29 CFR 1910.142(i)','legal',910),
 ('OSHA_FOOD_CHEMICALS','Food','Toxic/poisonous chemicals are not stored with food or in eating/cooking areas.','29 CFR 1910.142(i)','legal',920),
 ('OSHA_FOOD_CLEAN_EQUIPMENT','Food','Kitchen/dining equipment and utensils are clean.','29 CFR 1910.142(i)','legal',930),
 ('OSHA_FOOD_CLEAN_AREA','Food','Kitchen and dining areas are maintained clean.','29 CFR 1910.142(i)','legal',940),
 ('OSHA_FOOD_RUNNING_WATER','Food','Hot and/or cold running water is available in kitchen/dining areas.','29 CFR 1910.142(i)','legal',950),
 ('OSHA_FOOD_GARBAGE','Food','Leak-proof garbage containers with tight lids are available in food areas.','29 CFR 1910.142(i)','legal',960),
 ('OSHA_FOOD_SIZE_SEPARATION','Food','Food facilities are adequately sized and properly separated from sleeping quarters.','29 CFR 1910.142(i)','legal',970),

 ('OSHA_PEST_CONTROL','Pest Control','Effective measures prevent infestation or harborage of insects, rodents, and animal vectors.','29 CFR 1910.142(j)','legal',1000),
 ('OSHA_FIRST_AID','Safety','Approved first-aid facilities are readily accessible and supported by trained personnel.','29 CFR 1910.142(k)','legal',1050),
 ('OSHA_COMMUNICABLE_DISEASE','Health','Responsible staff understand required reporting of suspected communicable disease, food poisoning, or unusual illness.','29 CFR 1910.142(l)','legal',1060),
 ('OSHA_GENERAL_STANDARDS','General','Housing complies with all other applicable federal, state, and local housing standards.','20 CFR 655.135(e)','legal',1100)
)
insert into public.compliance_requirements(
 template_version_id,requirement_code,category,requirement_label,legal_basis,requirement_kind,sort_order
)
select tv.id,src.code,src.category,src.label,src.basis,src.kind,src.ord
from tv cross join src
on conflict (template_version_id,requirement_code) do update
set category=excluded.category,
    requirement_label=excluded.requirement_label,
    legal_basis=excluded.legal_basis,
    requirement_kind=excluded.requirement_kind,
    sort_order=excluded.sort_order,
    active=true;

-- ETA standards for housing completed/under construction before April 3, 1980
-- (including the signed-contract timing described by DOL).
with j as (
  select id from public.compliance_jurisdictions where code='US-FED'
)
insert into public.compliance_template_versions(
  jurisdiction_id,module,housing_type,standard_basis,version,effective_from,
  source_authority,source_reference,status,content_hash
)
select j.id,'h2a_housing','employer_provided','eta_654',
       'farmvoice-eta-654-v1',date '1900-01-01',
       'U.S. Department of Labor, Wage and Hour Division',
       'https://www.dol.gov/agencies/whd/eta-housing-checklist',
       'active',
       encode(digest('farmvoice-eta-654-v1|2026-10-06','sha256'),'hex')
from j
on conflict (jurisdiction_id,module,version) do update
set status='active',
    source_authority=excluded.source_authority,
    source_reference=excluded.source_reference,
    content_hash=excluded.content_hash;

with tv as (
  select id from public.compliance_template_versions
  where version='farmvoice-eta-654-v1'
), src(code,category,label,basis,kind,ord) as (
 values
 ('ETA_SITE_DRAINAGE','Site','Site has adequate drainage.','20 CFR 654.404','legal',10),
 ('ETA_SITE_HAZARDS','Site','Housing is away from offensive odors, noise, traffic, and similar hazards.','20 CFR 654.404','legal',20),
 ('ETA_SITE_GROUNDS','Site','Grounds are free of debris, poisonous plants, and uncontrolled weeds/brush.','20 CFR 654.404','legal',30),
 ('ETA_SITE_RECREATION','Site','Reasonable recreation space is available for the facility size and occupancy.','20 CFR 654.404','legal',40),

 ('ETA_WATER_APPROVED','Water','Water supply is adequate, convenient, and meets state health standards.','20 CFR 654.405','legal',100),
 ('ETA_WATER_DISTANCE','Water','Cold-water taps are within 100 ft of each unit unless water is inside the unit.','20 CFR 654.405','legal',110),
 ('ETA_WATER_DRAINAGE','Water','Overflow/spillage drainage is adequate.','20 CFR 654.405','legal',120),
 ('ETA_INDIVIDUAL_CUPS','Water','Individual drinking cups are used.','20 CFR 654.405','legal',130),

 ('ETA_WASTE_DISPOSAL','Sewage','Effective sewage and liquid-waste disposal is provided.','20 CFR 654.406','legal',200),
 ('ETA_NO_SURFACE_WASTE','Sewage','Raw or treated liquid waste does not accumulate on the ground.','20 CFR 654.406','legal',210),
 ('ETA_PUBLIC_SEWER','Sewage','Public sewer is used where available; approved alternatives are used otherwise.','20 CFR 654.406','legal',220),
 ('ETA_STATE_WASTE_RULES','Sewage','Waste facilities meet applicable state health requirements.','20 CFR 654.406','legal',230),

 ('ETA_STRUCTURAL_CONDITION','Housing','Housing is structurally sound, sanitary, in good repair, and weather-protective.','20 CFR 654.407','legal',300),
 ('ETA_FLOORS','Housing','Floors are smooth, rigid, cleanable, and resist water intrusion.','20 CFR 654.407','legal',310),
 ('ETA_SLEEP_SPACE_SINGLE','Housing','Single-bed/family sleeping areas provide at least 50 sq ft per person.','20 CFR 654.407','legal',320),
 ('ETA_SLEEP_SPACE_BUNK','Housing','Double-bunk sleeping areas provide at least 40 sq ft per person.','20 CFR 654.407','legal',330),
 ('ETA_COMBINED_SPACE','Housing','Combined cooking/eating/sleeping areas provide at least 60 sq ft per person.','20 CFR 654.407','legal',340),
 ('ETA_FAMILY_PRIVACY','Housing','Family housing provides required separate/partitioned sleeping privacy.','20 CFR 654.407','legal',350),
 ('ETA_SEPARATE_SLEEPING','Housing','Separate sleeping facilities are provided by sex and by family when required.','20 CFR 654.407','legal',360),
 ('ETA_PERSONAL_STORAGE','Housing','Separate storage/hanging space is available for personal effects.','20 CFR 654.407','legal',370),
 ('ETA_CEILING_HEIGHT','Housing','More than half of each living unit has at least 7 ft ceiling height.','20 CFR 654.407','legal',380),
 ('ETA_WINDOWS','Housing','Each habitable room has an outside window/skylight and sufficient window area/ventilation.','20 CFR 654.407','legal',390),

 ('ETA_SCREENING','Screening','Shelter openings have at least 16-mesh screening.','20 CFR 654.408','legal',400),
 ('ETA_SCREEN_DOORS','Screening','Screen doors are tight-fitting, in good repair, and self-closing.','20 CFR 654.408','legal',410),

 ('ETA_HEAT_OPERABLE','Heating','Required heating equipment is operable and correctly installed.','20 CFR 654.409','legal',500),
 ('ETA_HEAT_68','Heating','When outdoor temperature is below 68°F, living/service rooms can be maintained at 68°F.','20 CFR 654.409','legal',510),
 ('ETA_HEAT_COMBUSTION','Heating','Combustible-fuel heating is properly installed/vented and portable non-electric heaters are not used.','20 CFR 654.409','legal',520),
 ('ETA_STOVE_CLEARANCE','Heating','Solid/liquid-fuel stoves have required floor/wall/ceiling protection and clearances.','20 CFR 654.409','legal',530),
 ('ETA_STOVE_CONTROLS','Heating','Automatic fuel controls shut off fuel under unsafe conditions.','20 CFR 654.409','legal',540),

 ('ETA_ELECTRICAL_SAFE','Lighting','Electrical wiring and fixtures are safe.','20 CFR 654.410','legal',600),
 ('ETA_ROOM_LIGHTING','Lighting','Rooms have adequate ceiling/wall lighting and living rooms have at least one outlet.','20 CFR 654.410','legal',610),
 ('ETA_PATH_LIGHTING','Lighting','Yards and paths to common-use facilities are adequately lighted.','20 CFR 654.410','legal',620),

 ('ETA_TOILET_RATIO','Toilets','Toilet seats meet the required ratio by sex and minimum common-use count.','20 CFR 654.411','legal',700),
 ('ETA_TOILET_SEPARATION','Toilets','Separate, clearly marked toilet facilities are provided by sex when required.','20 CFR 654.411','legal',710),
 ('ETA_TOILET_TISSUE','Toilets','Common-use toilets have accessible toilet tissue and holders.','20 CFR 654.411','legal',720),
 ('ETA_TOILET_SANITARY','Toilets','Common-use toilets are well-lighted, ventilated, clean, and sanitary.','20 CFR 654.411','legal',730),
 ('ETA_TOILET_DISTANCE','Toilets','Toilet facilities are within 200 ft of living units.','20 CFR 654.411','legal',740),
 ('ETA_PRIVY_DISTANCE','Toilets','Privies/outhouses are at least 50 ft from living, cooking, and dining areas.','20 CFR 654.411','legal',750),

 ('ETA_BATH_WATER','Bathing & Laundry','Hot and cold pressurized water is available for bathing/handwashing.','20 CFR 654.412','legal',800),
 ('ETA_BATH_DISTANCE','Bathing & Laundry','Bathing/handwashing facilities are sanitary and within 200 ft of each living unit.','20 CFR 654.412','legal',810),
 ('ETA_SHOWER_RATIO','Bathing & Laundry','At least one shower is provided per 15 persons and showerheads are at least 3 ft apart.','20 CFR 654.412','legal',820),
 ('ETA_SHOWER_SPACE','Bathing & Laundry','Each shower provides at least 9 sq ft of floor area with dry dressing space.','20 CFR 654.412','legal',830),
 ('ETA_SHOWER_FLOORS','Bathing & Laundry','Shower floors are nonabsorbent, nonskid, and properly drained.','20 CFR 654.412','legal',840),
 ('ETA_SHOWER_SEPARATION','Bathing & Laundry','Separate, clearly marked shower facilities are provided by sex when required.','20 CFR 654.412','legal',850),
 ('ETA_LAVATORY_RATIO','Bathing & Laundry','At least one lavatory/wash basin is provided per 15 persons.','20 CFR 654.412','legal',860),
 ('ETA_LAUNDRY','Bathing & Laundry','Laundry has hot/cold water and trays/tubs or machines in the required ratios.','20 CFR 654.412','legal',870),

 ('ETA_COOKING_INDIVIDUAL','Food','Individual/family units have cooking/eating space, at least a two-burner stove/hot plate, storage, refrigeration, seating, lighting, and ventilation.','20 CFR 654.413','legal',900),
 ('ETA_COOKING_COMMON','Food','Common cooking/eating facilities are separate from sleeping areas and have required stoves, storage, refrigeration, seating, sinks, lighting, ventilation, and cleanable floors.','20 CFR 654.413','legal',910),
 ('ETA_CENTRAL_MESS','Food','Central mess facilities are appropriately sized, separated from sleeping quarters, and meet applicable state codes.','20 CFR 654.413','legal',920),

 ('ETA_REFUSE_CONTAINER','Refuse','Durable, fly-tight, clean refuse containers of at least 20 gallons are provided in the required ratio.','20 CFR 654.414','legal',1000),
 ('ETA_REFUSE_COLLECTION','Refuse','Refuse is collected at least twice weekly and disposed of under state/local law.','20 CFR 654.414','legal',1010),
 ('ETA_PEST_FREE','Pest Control','Housing and facilities are free of insects, rodents, and other vermin.','20 CFR 654.415','legal',1050),

 ('ETA_BED_EACH','Sleeping','Each person has a comfortable bed, cot, or bunk with clean, sanitary bedding.','20 CFR 654.416','legal',1100),
 ('ETA_NO_TRIPLE_BUNKS','Sleeping','Triple-deck bunks are not used.','20 CFR 654.416','legal',1110),
 ('ETA_BUNK_CLEARANCE','Sleeping','Double bunks have at least 27 in between bunks and 36 in from top bunk to ceiling.','20 CFR 654.416','legal',1120),
 ('ETA_DOUBLE_BEDS_FAMILY','Sleeping','Double beds are used only for family accommodations.','20 CFR 654.416','legal',1130),

 ('ETA_FIRE_CODE','Safety','Sleeping/eating buildings meet applicable state/local fire and safety law.','20 CFR 654.417','legal',1200),
 ('ETA_FIRE_ESCAPE_SMALL','Safety','One-story housing for fewer than 10 persons/families has two means of escape, including required openable window where applicable.','20 CFR 654.417','legal',1210),
 ('ETA_FIRE_ESCAPE_LARGE','Safety','Sleeping/common/dining rooms for 10 or more persons have two separated exit doors.','20 CFR 654.417','legal',1220),
 ('ETA_SECOND_FLOOR_EXIT','Safety','Second-floor sleeping/common rooms have a stairway plus a permanently affixed ladder or second stairway.','20 CFR 654.417','legal',1230),
 ('ETA_FIRE_EXTINGUISHERS','Safety','Working fire extinguishers are readily accessible and within 100 ft of housing units.','20 CFR 654.417','legal',1240),
 ('ETA_FIRST_AID','Safety','First-aid kits are readily accessible in the required ratio.','20 CFR 654.417','legal',1250),
 ('ETA_FLAMMABLE_STORAGE','Safety','Volatile/flammable liquids are not stored in or adjacent to living quarters except ordinary household products.','20 CFR 654.417','legal',1260),
 ('ETA_PESTICIDE_STORAGE','Safety','Pesticides and toxic chemicals are not stored in the housing area.','20 CFR 654.417','legal',1270),
 ('ETA_GENERAL_STANDARDS','General','Housing complies with all other applicable federal, state, and local housing standards.','20 CFR 655.135(e)','legal',1300)
)
insert into public.compliance_requirements(
 template_version_id,requirement_code,category,requirement_label,legal_basis,requirement_kind,sort_order
)
select tv.id,src.code,src.category,src.label,src.basis,src.kind,src.ord
from tv cross join src
on conflict (template_version_id,requirement_code) do update
set category=excluded.category,
    requirement_label=excluded.requirement_label,
    legal_basis=excluded.legal_basis,
    requirement_kind=excluded.requirement_kind,
    sort_order=excluded.sort_order,
    active=true;

comment on table public.compliance_requirements is
  'Versioned checklist requirements used for FarmVoice inspection-prep records. They are not a legal certification and state/local rules may add requirements.';
