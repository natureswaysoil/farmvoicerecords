begin;

create table public.farm_map_pois (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'other'
    check (category in ('gate','water','building','storage','hazard','equipment','field_access','other')),
  notes text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.farm_map_track_sessions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('walking','driving','equipment','other')),
  label text,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_lat double precision check (start_lat is null or start_lat between -90 and 90),
  start_lng double precision check (start_lng is null or start_lng between -180 and 180),
  end_lat double precision check (end_lat is null or end_lat between -90 and 90),
  end_lng double precision check (end_lng is null or end_lng between -180 and 180),
  distance_m double precision not null default 0 check (distance_m >= 0),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table public.farm_map_track_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.farm_map_track_sessions(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 0),
  recorded_at timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  speed_mps double precision,
  heading_deg double precision check (heading_deg is null or heading_deg between 0 and 360),
  created_at timestamptz not null default now(),
  unique(session_id, sequence_no)
);

create table public.farm_map_route_plans (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  travel_mode text not null default 'driving'
    check (travel_mode in ('driving','walking')),
  waypoints jsonb not null
    check (
      jsonb_typeof(waypoints)='array'
      and jsonb_array_length(waypoints) between 2 and 10
    ),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index farm_map_pois_farm_idx
  on public.farm_map_pois(farm_id, category);
create index farm_map_track_sessions_farm_started_idx
  on public.farm_map_track_sessions(farm_id, started_at desc);
create index farm_map_track_points_session_seq_idx
  on public.farm_map_track_points(session_id, sequence_no);
create index farm_map_track_points_farm_time_idx
  on public.farm_map_track_points(farm_id, recorded_at desc);
create index farm_map_route_plans_farm_idx
  on public.farm_map_route_plans(farm_id, updated_at desc);

alter table public.farm_map_pois enable row level security;
alter table public.farm_map_track_sessions enable row level security;
alter table public.farm_map_track_points enable row level security;
alter table public.farm_map_route_plans enable row level security;

revoke all on public.farm_map_pois from anon,authenticated;
revoke all on public.farm_map_track_sessions from anon,authenticated;
revoke all on public.farm_map_track_points from anon,authenticated;
revoke all on public.farm_map_route_plans from anon,authenticated;

grant select,insert,update,delete on public.farm_map_pois to authenticated;
grant select,insert,update,delete on public.farm_map_track_sessions to authenticated;
grant select,insert,delete on public.farm_map_track_points to authenticated;
grant select,insert,update,delete on public.farm_map_route_plans to authenticated;

create policy "farm map POIs visible to farm members"
on public.farm_map_pois for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members create POIs"
on public.farm_map_pois for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and created_by=auth.uid()
);

create policy "POI creators or owners update POIs"
on public.farm_map_pois for update to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid())
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and (private.core_is_owner(farm_id) or created_by=auth.uid())
);

create policy "POI creators or owners delete POIs"
on public.farm_map_pois for delete to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid());

create policy "track sessions visible to farm members"
on public.farm_map_track_sessions for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members create own track sessions"
on public.farm_map_track_sessions for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and user_id=auth.uid()
);

create policy "track owners or farm owners update track sessions"
on public.farm_map_track_sessions for update to authenticated
using (private.core_is_owner(farm_id) or user_id=auth.uid())
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and (private.core_is_owner(farm_id) or user_id=auth.uid())
);

create policy "track owners or farm owners delete track sessions"
on public.farm_map_track_sessions for delete to authenticated
using (private.core_is_owner(farm_id) or user_id=auth.uid());

create policy "track points visible to farm members"
on public.farm_map_track_points for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "users add points only to their own farm track"
on public.farm_map_track_points for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and user_id=auth.uid()
  and exists (
    select 1
    from public.farm_map_track_sessions s
    where s.id=session_id
      and s.farm_id=farm_id
      and s.user_id=auth.uid()
  )
);

create policy "track owners or farm owners delete track points"
on public.farm_map_track_points for delete to authenticated
using (private.core_is_owner(farm_id) or user_id=auth.uid());

create policy "route plans visible to farm members"
on public.farm_map_route_plans for select to authenticated
using (private.core_is_owner(farm_id) or private.core_is_member(farm_id));

create policy "farm members create route plans"
on public.farm_map_route_plans for insert to authenticated
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and created_by=auth.uid()
);

create policy "route creators or owners update route plans"
on public.farm_map_route_plans for update to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid())
with check (
  (private.core_is_owner(farm_id) or private.core_is_member(farm_id))
  and (private.core_is_owner(farm_id) or created_by=auth.uid())
);

create policy "route creators or owners delete route plans"
on public.farm_map_route_plans for delete to authenticated
using (private.core_is_owner(farm_id) or created_by=auth.uid());

create trigger require_farm_write_plan
before insert or update on public.farm_map_pois
for each row execute function private.require_farm_write_plan();

create trigger require_farm_write_plan
before insert or update on public.farm_map_track_sessions
for each row execute function private.require_farm_write_plan();

create trigger require_farm_write_plan
before insert or update on public.farm_map_track_points
for each row execute function private.require_farm_write_plan();

create trigger require_farm_write_plan
before insert or update on public.farm_map_route_plans
for each row execute function private.require_farm_write_plan();

commit;
