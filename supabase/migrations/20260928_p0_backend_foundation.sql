-- FarmVoice P0 backend foundation.
-- Server-owned compliance templates, transactional housing inspection v2,
-- durable notification outbox/background jobs, and scheduled housing reminder evaluation.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.compliance_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  jurisdiction_type text not null check (jurisdiction_type in ('federal','state','county','city','other')),
  parent_id uuid references public.compliance_jurisdictions(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.compliance_template_versions (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references public.compliance_jurisdictions(id) on delete restrict,
  module text not null,
  housing_type text,
  standard_basis text not null,
  version text not null,
  effective_from date not null,
  effective_to date,
  source_authority text not null,
  source_reference text,
  status text not null check (status in ('draft','reviewed','active','superseded')),
  content_hash text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (jurisdiction_id,module,version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.compliance_template_versions(id) on delete cascade,
  requirement_code text not null,
  category text not null,
  requirement_label text not null,
  legal_basis text,
  requirement_kind text not null check (requirement_kind in ('legal','best_practice')),
  applicability jsonb not null default '{}'::jsonb,
  validation_rule jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (template_version_id,requirement_code)
);

alter table public.h2a_housing_inspections
  add column if not exists template_version_id uuid references public.compliance_template_versions(id) on delete restrict,
  add column if not exists rules_snapshot_hash text;

create table if not exists public.h2a_inspection_template_snapshots (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  inspection_id uuid not null unique,
  template_version_id uuid not null references public.compliance_template_versions(id) on delete restrict,
  content_hash text not null,
  template_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists h2a_inspection_template_snapshots_farm_id_id_uidx
  on public.h2a_inspection_template_snapshots(farm_id,id);
create index if not exists h2a_inspection_template_snapshots_farm_idx
  on public.h2a_inspection_template_snapshots(farm_id,created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='h2a_template_snapshot_inspection_same_farm_fk') then
    alter table public.h2a_inspection_template_snapshots
      add constraint h2a_template_snapshot_inspection_same_farm_fk
      foreign key (farm_id,inspection_id)
      references public.h2a_housing_inspections(farm_id,id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id,user_id)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  severity text not null default 'normal' check (severity in ('low','normal','high','urgent')),
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  not_before timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','delivered','retry','dead_letter','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (farm_id,dedupe_key)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('in_app','email','sms')),
  provider text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','suppressed')),
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (outbox_id,recipient_user_id,channel)
);

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid references public.farms(id) on delete cascade,
  job_type text not null,
  entity_type text,
  entity_id uuid,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','retry','failed','cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (attempt_count >= 0 and max_attempts > 0)
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox(status,not_before,created_at)
  where status in ('pending','retry');
create index if not exists notification_outbox_farm_idx
  on public.notification_outbox(farm_id,created_at desc);
create index if not exists notification_deliveries_farm_idx
  on public.notification_deliveries(farm_id,created_at desc);
create index if not exists background_jobs_ready_idx
  on public.background_jobs(status,run_after,created_at)
  where status in ('queued','retry');
create index if not exists background_jobs_farm_idx
  on public.background_jobs(farm_id,created_at desc);

alter table public.compliance_jurisdictions enable row level security;
alter table public.compliance_template_versions enable row level security;
alter table public.compliance_requirements enable row level security;
alter table public.h2a_inspection_template_snapshots enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.background_jobs enable row level security;

drop policy if exists "active compliance jurisdictions readable" on public.compliance_jurisdictions;
create policy "active compliance jurisdictions readable"
on public.compliance_jurisdictions for select to authenticated
using (active = true);

drop policy if exists "active compliance templates readable" on public.compliance_template_versions;
create policy "active compliance templates readable"
on public.compliance_template_versions for select to authenticated
using (status = 'active');

drop policy if exists "active compliance requirements readable" on public.compliance_requirements;
create policy "active compliance requirements readable"
on public.compliance_requirements for select to authenticated
using (
  active = true and exists (
    select 1 from public.compliance_template_versions tv
    where tv.id = template_version_id and tv.status = 'active'
  )
);

drop policy if exists "h2a template snapshots readable" on public.h2a_inspection_template_snapshots;
create policy "h2a template snapshots readable"
on public.h2a_inspection_template_snapshots for select to authenticated
using (private.h2a_can_read(farm_id));

drop policy if exists "notification preferences own read" on public.notification_preferences;
create policy "notification preferences own read"
on public.notification_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and (private.h2a_is_owner(farm_id) or private.h2a_can_read(farm_id))
);

drop policy if exists "notification preferences own insert" on public.notification_preferences;
create policy "notification preferences own insert"
on public.notification_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (private.h2a_is_owner(farm_id) or private.h2a_can_read(farm_id))
);

drop policy if exists "notification preferences own update" on public.notification_preferences;
create policy "notification preferences own update"
on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "notification outbox authorized read" on public.notification_outbox;
create policy "notification outbox authorized read"
on public.notification_outbox for select to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin','housing_manager'])
);

drop policy if exists "notification deliveries authorized read" on public.notification_deliveries;
create policy "notification deliveries authorized read"
on public.notification_deliveries for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  or private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

drop policy if exists "background jobs authorized read" on public.background_jobs;
create policy "background jobs authorized read"
on public.background_jobs for select to authenticated
using (
  farm_id is not null and (
    private.h2a_is_owner(farm_id)
    or private.h2a_has_role(farm_id,array['h2a_admin'])
  )
);

grant select on public.compliance_jurisdictions,public.compliance_template_versions,public.compliance_requirements to authenticated;
grant select on public.h2a_inspection_template_snapshots to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select on public.notification_outbox,public.notification_deliveries,public.background_jobs to authenticated;

-- Seed the current OSHA 1910.142 checklist as a server-owned version.
-- This preserves the existing FarmVoice prompts; it remains a recordkeeping aid, not legal certification.
insert into public.compliance_jurisdictions(code,name,jurisdiction_type)
values ('US-FED','United States - Federal','federal')
on conflict (code) do update set name=excluded.name, active=true;

with j as (
  select id from public.compliance_jurisdictions where code='US-FED'
)
insert into public.compliance_template_versions(
  jurisdiction_id,module,housing_type,standard_basis,version,effective_from,
  source_authority,source_reference,status,content_hash
)
select j.id,'h2a_housing','employer_provided','osha_1910_142','farmvoice-osha-1910-142-v1',
       date '1980-04-03','U.S. Department of Labor / OSHA','29 CFR 1910.142','active',
       encode(digest('farmvoice-osha-1910-142-v1|2026-09-28','sha256'),'hex')
from j
on conflict (jurisdiction_id,module,version) do nothing;

with tv as (
  select id from public.compliance_template_versions where version='farmvoice-osha-1910-142-v1'
), src(code,category,label,basis,kind,ord) as (
 values
 ('SITE_DRAINAGE','Site','Site is adequately drained and free from depressions where water can stagnate.','29 CFR 1910.142(a)(1)','legal',1),
 ('SITE_REFUSE','Site','Site is free from debris, refuse, uncontrolled weeds/brush and other sanitary nuisances.','29 CFR 1910.142(a)(3)','legal',2),
 ('STRUCTURE_PROTECTION','Shelter','Shelter provides protection against the elements.','29 CFR 1910.142(b)(1)','legal',3),
 ('FLOOR_SPACE','Shelter','Sleeping and combined-use floor space has been reviewed against the applicable per-person minimum.','29 CFR 1910.142(b)(2)','legal',4),
 ('WINDOWS_VENTILATION','Shelter','Windows/ventilation and required window or door screening are maintained.','29 CFR 1910.142(b)(8)','legal',5),
 ('HEATING','Shelter','Required heating equipment is provided and maintained where applicable.','29 CFR 1910.142(b)(11)','legal',6),
 ('WATER','Water','Adequate potable water is available for drinking, cooking, bathing and laundry.','29 CFR 1910.142(c)','legal',7),
 ('TOILETS','Sanitation','Toilet facilities are adequate, accessible, lighted/ventilated as applicable, and sanitary.','29 CFR 1910.142(d)','legal',8),
 ('BATHING_LAUNDRY','Sanitation','Bathing and laundry facilities, hot/cold water and drainage are maintained.','29 CFR 1910.142(f)','legal',9),
 ('COOKING_FOOD','Food','Cooking, refrigeration and food-storage facilities are adequate and maintained.','29 CFR 1910.142(i)','legal',10),
 ('REFUSE','Waste','Covered refuse containers and regular collection/disposal are maintained.','29 CFR 1910.142(h)','legal',11),
 ('PEST_CONTROL','Pests','Effective measures are maintained to control insects and rodents.','29 CFR 1910.142(j)','legal',12),
 ('FIRST_AID','Safety','Adequate first-aid facilities are available and accessible.','29 CFR 1910.142(k)','legal',13),
 ('FIRE_SAFETY','Safety','Smoke/CO alarms, extinguishers and clear exits were checked.','Best practice; verify state/local fire code','best_practice',14)
)
insert into public.compliance_requirements(
 template_version_id,requirement_code,category,requirement_label,legal_basis,requirement_kind,sort_order
)
select tv.id,src.code,src.category,src.label,src.basis,src.kind,src.ord from tv cross join src
on conflict (template_version_id,requirement_code) do update
set category=excluded.category,requirement_label=excluded.requirement_label,
    legal_basis=excluded.legal_basis,requirement_kind=excluded.requirement_kind,
    sort_order=excluded.sort_order,active=true;

create or replace function public.h2a_create_housing_inspection_v2(
  p_farm_id uuid,
  p_housing_id uuid,
  p_inspection_type text,
  p_inspection_date date,
  p_template_version_id uuid,
  p_authority_or_inspector text default null,
  p_occupancy_observed integer default null,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_gps_accuracy_m double precision default null,
  p_gps_captured_at timestamptz default null,
  p_summary text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, auth
as $$
declare
  v_inspection_id uuid;
  v_standard_basis text;
  v_housing_type text;
  v_template_hash text;
  v_template_housing_type text;
  v_item_count integer;
  v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not (
    private.h2a_is_owner(p_farm_id)
    or private.h2a_has_role(p_farm_id,array['h2a_admin','housing_manager'])
  ) then raise exception 'Not authorized'; end if;

  select h.standard_basis,h.housing_type
    into v_standard_basis,v_housing_type
  from public.h2a_housing h
  where h.id=p_housing_id and h.farm_id=p_farm_id and h.active=true
  for share;

  if not found then raise exception 'Active housing not found for this farm'; end if;

  select tv.content_hash,tv.housing_type
    into v_template_hash,v_template_housing_type
  from public.compliance_template_versions tv
  where tv.id=p_template_version_id
    and tv.module='h2a_housing'
    and tv.status='active'
    and tv.standard_basis in (v_standard_basis,'mixed')
    and p_inspection_date >= tv.effective_from
    and (tv.effective_to is null or p_inspection_date <= tv.effective_to);

  if not found then raise exception 'Template does not apply to housing/date'; end if;
  if v_template_housing_type is not null and v_template_housing_type <> v_housing_type then
    raise exception 'Template does not apply to this housing type';
  end if;

  select jsonb_build_object(
    'template_version_id',p_template_version_id,
    'content_hash',v_template_hash,
    'requirements',jsonb_agg(jsonb_build_object(
      'code',r.requirement_code,'category',r.category,'label',r.requirement_label,
      'basis',r.legal_basis,'kind',r.requirement_kind,'sort_order',r.sort_order
    ) order by r.sort_order)
  ) into v_snapshot
  from public.compliance_requirements r
  where r.template_version_id=p_template_version_id and r.active=true;

  if v_snapshot->'requirements' is null then raise exception 'Template has no active requirements'; end if;

  insert into public.h2a_housing_inspections(
    farm_id,housing_id,inspection_type,inspection_date,status,standard_basis,
    authority_or_inspector,occupancy_observed,gps_lat,gps_lng,gps_accuracy_m,
    gps_captured_at,summary,template_version_id,rules_snapshot_hash,created_by
  ) values (
    p_farm_id,p_housing_id,p_inspection_type,p_inspection_date,'in_progress',v_standard_basis,
    nullif(p_authority_or_inspector,''),p_occupancy_observed,p_gps_lat,p_gps_lng,p_gps_accuracy_m,
    p_gps_captured_at,nullif(p_summary,''),p_template_version_id,v_template_hash,auth.uid()
  ) returning id into v_inspection_id;

  insert into public.h2a_housing_inspection_items(
    farm_id,inspection_id,requirement_code,category,requirement_label,legal_basis,
    requirement_kind,result,sort_order,created_by
  )
  select p_farm_id,v_inspection_id,r.requirement_code,r.category,r.requirement_label,
         r.legal_basis,r.requirement_kind,'not_checked',r.sort_order,auth.uid()
  from public.compliance_requirements r
  where r.template_version_id=p_template_version_id and r.active=true
  order by r.sort_order;

  get diagnostics v_item_count = row_count;
  if v_item_count=0 then raise exception 'Template has no active requirements'; end if;

  insert into public.h2a_inspection_template_snapshots(
    farm_id,inspection_id,template_version_id,content_hash,template_snapshot
  ) values (p_farm_id,v_inspection_id,p_template_version_id,v_template_hash,v_snapshot);

  return v_inspection_id;
end;
$$;

revoke all on function public.h2a_create_housing_inspection_v2(
 uuid,uuid,text,date,uuid,text,integer,double precision,double precision,double precision,timestamptz,text
) from public,anon;
grant execute on function public.h2a_create_housing_inspection_v2(
 uuid,uuid,text,date,uuid,text,integer,double precision,double precision,double precision,timestamptz,text
) to authenticated;

create or replace function private.h2a_evaluate_housing_reminders()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare v_count integer := 0;
begin
  insert into public.notification_outbox(
    farm_id,event_type,entity_type,entity_id,severity,dedupe_key,payload,not_before
  )
  select h.farm_id,'housing.certificate.expiring','h2a_housing',h.id,
         case when h.certificate_expires_on < current_date then 'urgent'
              when h.certificate_expires_on <= current_date+7 then 'high' else 'normal' end,
         'housing-cert:'||h.id::text||':'||h.certificate_expires_on::text,
         jsonb_build_object('housing_id',h.id,'housing_name',h.name,'expires_on',h.certificate_expires_on),
         now()
  from public.h2a_housing h
  where h.active=true
    and h.certificate_expires_on is not null
    and h.certificate_expires_on <= current_date+30
  on conflict (farm_id,dedupe_key) do nothing;
  get diagnostics v_count = row_count;

  insert into public.notification_outbox(
    farm_id,event_type,entity_type,entity_id,severity,dedupe_key,payload,not_before
  )
  select i.farm_id,'housing.corrective_action.overdue','h2a_housing_inspection_item',i.id,
         case when i.corrective_due_on < current_date then 'urgent' else 'high' end,
         'housing-finding:'||i.id::text||':due:'||coalesce(i.corrective_due_on::text,'none'),
         jsonb_build_object(
           'inspection_item_id',i.id,'inspection_id',i.inspection_id,
           'requirement_code',i.requirement_code,'requirement_label',i.requirement_label,
           'due_on',i.corrective_due_on
         ),now()
  from public.h2a_housing_inspection_items i
  where i.result='fail' and i.resolved_at is null
    and (i.corrective_due_on is null or i.corrective_due_on <= current_date)
  on conflict (farm_id,dedupe_key) do nothing;
  get diagnostics v_count = v_count + row_count;

  return v_count;
end;
$$;

revoke all on function private.h2a_evaluate_housing_reminders() from public,anon,authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname='farmvoice-h2a-housing-reminders') then
    perform cron.unschedule('farmvoice-h2a-housing-reminders');
  end if;
  perform cron.schedule(
    'farmvoice-h2a-housing-reminders',
    '15 8 * * *',
    'select private.h2a_evaluate_housing_reminders();'
  );
end $$;

comment on table public.compliance_template_versions is
  'Versioned compliance content. Publication is controlled server-side; active does not mean FarmVoice provides legal certification.';
comment on table public.notification_outbox is
  'Durable domain events awaiting in-app/email/SMS delivery. Delivery workers are separate from compliance evaluation.';
