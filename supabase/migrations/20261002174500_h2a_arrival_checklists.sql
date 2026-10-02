begin;

create table public.h2a_worker_arrival_checklist (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  worker_id uuid not null,
  contract_id uuid,
  checklist_version text not null default 'federal-2026-v1',
  item_key text not null,
  status text not null default 'required_now'
    check (status in ('required_now','due_later','complete','exception')),
  due_on date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  exception_reason text,
  evidence_reference text,
  worker_acknowledged_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, worker_id, checklist_version, item_key),
  foreign key (farm_id, worker_id)
    references public.h2a_workers(farm_id, id) on delete cascade,
  foreign key (farm_id, contract_id)
    references public.h2a_contracts(farm_id, id) on delete set null,
  check (status <> 'exception' or nullif(trim(coalesce(exception_reason,'')),'') is not null),
  check (status <> 'complete' or completed_at is not null)
);

create table public.h2a_farm_readiness_checklist (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  contract_id uuid not null,
  checklist_version text not null default 'federal-2026-v1',
  item_key text not null,
  status text not null default 'required_now'
    check (status in ('required_now','due_later','complete','exception')),
  due_on date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  exception_reason text,
  evidence_reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, contract_id, checklist_version, item_key),
  foreign key (farm_id, contract_id)
    references public.h2a_contracts(farm_id, id) on delete cascade,
  check (status <> 'exception' or nullif(trim(coalesce(exception_reason,'')),'') is not null),
  check (status <> 'complete' or completed_at is not null)
);

create index h2a_worker_arrival_checklist_worker_idx
  on public.h2a_worker_arrival_checklist(farm_id,worker_id,status,due_on);
create index h2a_farm_readiness_checklist_contract_idx
  on public.h2a_farm_readiness_checklist(farm_id,contract_id,status,due_on);

alter table public.h2a_worker_arrival_checklist enable row level security;
alter table public.h2a_farm_readiness_checklist enable row level security;

revoke all on public.h2a_worker_arrival_checklist from anon,authenticated;
revoke all on public.h2a_farm_readiness_checklist from anon,authenticated;
grant select,insert,update,delete on public.h2a_worker_arrival_checklist to authenticated;
grant select,insert,update,delete on public.h2a_farm_readiness_checklist to authenticated;

create policy "h2a arrival checklist admin read"
on public.h2a_worker_arrival_checklist for select to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a arrival checklist admin manage"
on public.h2a_worker_arrival_checklist for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a readiness checklist admin read"
on public.h2a_farm_readiness_checklist for select to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create policy "h2a readiness checklist admin manage"
on public.h2a_farm_readiness_checklist for all to authenticated
using (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
)
with check (
  private.h2a_is_owner(farm_id)
  or private.h2a_has_role(farm_id,array['h2a_admin'])
);

create trigger h2a_worker_arrival_checklist_plan
before insert or update or delete on public.h2a_worker_arrival_checklist
for each row execute function private.require_farm_write_plan();

create trigger h2a_farm_readiness_checklist_plan
before insert or update or delete on public.h2a_farm_readiness_checklist
for each row execute function private.require_farm_write_plan();

create trigger h2a_worker_arrival_checklist_provenance
before insert or update on public.h2a_worker_arrival_checklist
for each row execute function private.h2a_guard_created_by();

create trigger h2a_farm_readiness_checklist_provenance
before insert or update on public.h2a_farm_readiness_checklist
for each row execute function private.h2a_guard_created_by();

create trigger h2a_worker_arrival_checklist_audit
after insert or update or delete on public.h2a_worker_arrival_checklist
for each row execute function private.h2a_audit_trigger();

create trigger h2a_farm_readiness_checklist_audit
after insert or update or delete on public.h2a_farm_readiness_checklist
for each row execute function private.h2a_audit_trigger();

commit;
