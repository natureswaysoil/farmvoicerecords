-- FarmVoice Facebook outreach admin workspace.
-- Restricted to FarmVoice operator accounts at both the UI and RLS layers.

create table if not exists public.outreach_groups (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'facebook' check (platform in ('facebook')),
  name text not null,
  url text not null,
  audience_type text not null check (audience_type in (
    'h2a',
    'farm_management',
    'pesticide',
    'bookkeeping',
    'north_carolina',
    'general_farm'
  )),
  region text,
  member_estimate integer check (member_estimate is null or member_estimate >= 0),
  promotion_policy text not null default 'unknown' check (promotion_policy in (
    'unknown',
    'allowed',
    'approval_required',
    'specific_days',
    'no_promotion'
  )),
  allowed_days text[] not null default '{}',
  priority integer not null default 3 check (priority between 1 and 5),
  notes text,
  active boolean not null default true,
  last_posted_at timestamptz,
  next_post_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.outreach_groups(id) on delete cascade,
  topic text not null check (topic in (
    'h2a',
    'pesticide',
    'crew_time',
    'quickbooks',
    'farm_records',
    'trial'
  )),
  post_text text not null,
  destination_path text not null default '/',
  campaign text not null default 'facebook_groups',
  status text not null default 'draft' check (status in (
    'draft',
    'ready',
    'posted',
    'skipped',
    'rejected',
    'approval_required'
  )),
  scheduled_for date,
  posted_at timestamptz,
  comments_count integer not null default 0 check (comments_count >= 0),
  interested_leads integer not null default 0 check (interested_leads >= 0),
  trial_signups integer not null default 0 check (trial_signups >= 0),
  paid_customers integer not null default 0 check (paid_customers >= 0),
  monthly_revenue numeric(10,2) not null default 0 check (monthly_revenue >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_groups_active_priority_idx
  on public.outreach_groups (active, priority desc, next_post_after);

create index if not exists outreach_posts_status_schedule_idx
  on public.outreach_posts (status, scheduled_for);

alter table public.outreach_groups enable row level security;
alter table public.outreach_posts enable row level security;

revoke all on table public.outreach_groups from anon;
revoke all on table public.outreach_posts from anon;
grant select, insert, update, delete on table public.outreach_groups to authenticated;
grant select, insert, update, delete on table public.outreach_posts to authenticated;

drop policy if exists "FarmVoice outreach admins manage groups" on public.outreach_groups;
create policy "FarmVoice outreach admins manage groups"
on public.outreach_groups
for all
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  )
)
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  )
);

drop policy if exists "FarmVoice outreach admins manage posts" on public.outreach_posts;
create policy "FarmVoice outreach admins manage posts"
on public.outreach_posts
for all
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  )
)
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  )
);

create or replace function public.touch_outreach_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_outreach_updated_at() from public;

drop trigger if exists touch_outreach_groups_updated_at on public.outreach_groups;
create trigger touch_outreach_groups_updated_at
before update on public.outreach_groups
for each row execute function public.touch_outreach_updated_at();

drop trigger if exists touch_outreach_posts_updated_at on public.outreach_posts;
create trigger touch_outreach_posts_updated_at
before update on public.outreach_posts
for each row execute function public.touch_outreach_updated_at();
