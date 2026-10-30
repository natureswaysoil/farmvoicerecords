-- Additive upgrade: drafts stay editable; confirmed records satisfy the product checklist.
-- This does not certify compliance with current state, WPS, or pesticide-label rules.
create or replace function private.confirmed_record_payload_guard()
returns trigger language plpgsql set search_path='' as $$
declare p jsonb := new.payload; k text; required text[]; amount double precision;
 area double precision; acres double precision; cost double precision; d text; spot boolean := false;
begin
 if new.status <> 'confirmed' or new.record_type not in ('pesticide','purchase') then return new; end if;
 if jsonb_typeof(p) <> 'object' then raise exception 'Confirmed record payload must be an object' using errcode='23514'; end if;
 if new.record_type='pesticide' then
  if jsonb_typeof(p->'isRestrictedUse') is distinct from 'boolean' then
   raise exception 'Confirmed pesticide record requires boolean isRestrictedUse' using errcode='23514';
  end if;
  foreach k in array array['isSpotTreatment','isGreenhouseOrNursery'] loop
   if p ? k and p->k <> 'null'::jsonb and jsonb_typeof(p->k) <> 'boolean' then
    raise exception 'Invalid pesticide flag: %',k using errcode='23514';
   end if;
  end loop;
  if p->>'isRestrictedUse'='false' then return new; end if;
  amount := (p->>'amountApplied')::double precision;
  if amount is null or not (amount>0 and amount<'Infinity'::double precision) then
   raise exception 'Amount applied must be finite and positive' using errcode='23514';
  end if;
  if p->>'isSpotTreatment'='true' then
   area := (p->>'areaTreated')::double precision;
   acres := case lower(trim(p->>'areaUnit'))
    when 'acre' then area when 'acres' then area when 'ac' then area
    when 'sq ft' then area/43560 when 'sqft' then area/43560 when 'square foot' then area/43560
    when 'square feet' then area/43560 when 'ft2' then area/43560 when 'ft^2' then area/43560
    when 'sq yd' then area/4840 when 'sqyd' then area/4840 when 'square yard' then area/4840
    when 'square yards' then area/4840 when 'yd2' then area/4840 when 'yd^2' then area/4840
    when 'hectare' then area*2.4710538147 when 'hectares' then area*2.4710538147 when 'ha' then area*2.4710538147
    else null end;
   spot := coalesce(acres>0 and acres<0.1 and (p->>'isGreenhouseOrNursery') is distinct from 'true',false);
   if not spot then raise exception 'Application does not qualify for the spot-treatment checklist' using errcode='23514'; end if;
  end if;
  required := array['productName','epaRegNumber','amountApplied','amountUnit','fieldLocation','applicationDate'];
  if not spot then
   required := required || array['applicatorName','certificationNumber','cropOrSite','areaTreated','areaUnit'];
   area := (p->>'areaTreated')::double precision;
   if area is null or not (area>0 and area<'Infinity'::double precision) then
    raise exception 'Area treated must be finite and positive' using errcode='23514';
   end if;
  elsif trim(p->>'fieldLocation') !~* '^spot (application|treatment)\y\s*[-:–—]?\s*\S+' then
   raise exception 'Spot location requires a location description' using errcode='23514';
  end if;
  if trim(p->>'epaRegNumber') !~ '^[0-9]+-[0-9]+(-[0-9]+)?$' then
   raise exception 'Invalid EPA registration number' using errcode='23514';
  end if;
  d := p->>'applicationDate';
 else
  required := array['vendor','item','purchaseDate','quantity','unit','totalCost'];
  amount := (p->>'quantity')::double precision; cost := (p->>'totalCost')::double precision;
  if amount is null or not (amount>0 and amount<'Infinity'::double precision)
   or cost is null or not (cost>=0 and cost<'Infinity'::double precision) then
   raise exception 'Purchase quantity and cost must be finite with quantity positive and cost nonnegative' using errcode='23514';
  end if;
  d := p->>'purchaseDate';
 end if;
 foreach k in array required loop
  if jsonb_typeof(p->k) not in ('string','number') or nullif(trim(p->>k),'') is null
   or length(p->>k)>200 then
   raise exception 'Confirmed record requires valid %',k using errcode='23514';
  end if;
  if k not in ('amountApplied','areaTreated','quantity','totalCost') and jsonb_typeof(p->k)<>'string' then
   raise exception 'Confirmed record requires text %',k using errcode='23514';
  end if;
 end loop;
 if d is null or d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(d::date,'YYYY-MM-DD')<>d then
  raise exception 'Confirmed record requires a valid calendar date' using errcode='23514';
 end if;
 return new;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
 raise exception 'Confirmed record contains an invalid number or calendar date' using errcode='23514';
end $$;
revoke all on function private.confirmed_record_payload_guard() from public,anon,authenticated;
drop trigger if exists confirmed_record_payload_guard on public.farm_records;
create trigger confirmed_record_payload_guard before insert or update on public.farm_records
for each row execute function private.confirmed_record_payload_guard();

-- Owner RLS still applies to DELETE; disconnecting must remain possible after expiry.
drop trigger if exists require_farm_write_plan on public.john_deere_connections;
create trigger require_farm_write_plan before insert or update on public.john_deere_connections
for each row execute function private.require_farm_write_plan();
drop trigger if exists require_farm_write_plan on public.john_deere_field_mappings;
create trigger require_farm_write_plan before insert or update on public.john_deere_field_mappings
for each row execute function private.require_farm_write_plan();

alter table public.john_deere_connections add column if not exists refresh_lock_token uuid,
 add column if not exists refresh_lock_expires_at timestamptz;
create or replace function public.claim_john_deere_refresh(p_farm_id uuid,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$
 with claimed as (
  update public.john_deere_connections set refresh_lock_token=p_token,
   refresh_lock_expires_at=now()+interval '60 seconds'
  where farm_id=p_farm_id and p_token is not null
   and (refresh_lock_expires_at is null or refresh_lock_expires_at<now())
  returning farm_id
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_john_deere_refresh(uuid,uuid) from public,anon;
grant execute on function public.claim_john_deere_refresh(uuid,uuid) to authenticated;

-- Match the deployed worker's service-role-only Vault authorization helper.
create or replace function public.notification_worker_authorize(p_token text)
returns boolean language sql security definer set search_path='' as $$
 select coalesce(p_token is not null and exists(
  select 1 from vault.decrypted_secrets where name='farmvoice_notification_cron_secret'
   and extensions.digest(convert_to(decrypted_secret,'UTF8'),'sha256')
     =extensions.digest(convert_to(p_token,'UTF8'),'sha256')
 ),false);
$$;
revoke all on function public.notification_worker_authorize(text) from public,anon,authenticated;
grant execute on function public.notification_worker_authorize(text) to service_role;
