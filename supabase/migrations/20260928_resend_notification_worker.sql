-- Notification worker support: atomically claim outbox work and expose intended recipients to trusted backend workers.

create or replace function private.claim_notification_outbox(p_limit integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  with picked as (
    select o.id
    from public.notification_outbox o
    where o.status in ('pending','retry')
      and o.not_before <= now()
      and (o.locked_at is null or o.locked_at < now() - interval '10 minutes')
    order by o.severity desc, o.not_before, o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.notification_outbox o
  set status='processing',locked_at=now(),attempt_count=o.attempt_count+1
  from picked
  where o.id=picked.id
  returning o.*;
end;
$$;
revoke all on function private.claim_notification_outbox(integer) from public,anon,authenticated;

create or replace function private.notification_recipients(p_farm_id uuid)
returns table(user_id uuid,email text,email_enabled boolean)
language sql
security definer
set search_path = public, auth
as $$
  with intended as (
    select f.owner_user_id as user_id from public.farms f where f.id=p_farm_id
    union
    select r.user_id from public.h2a_user_roles r
      where r.farm_id=p_farm_id and r.role in ('h2a_admin','housing_manager')
  )
  select i.user_id,u.email,coalesce(p.email_enabled,true)
  from intended i
  join auth.users u on u.id=i.user_id
  left join public.notification_preferences p on p.farm_id=p_farm_id and p.user_id=i.user_id
  where u.email is not null;
$$;
revoke all on function private.notification_recipients(uuid) from public,anon,authenticated;

create or replace function private.release_stale_notification_locks()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer;
begin
  update public.notification_outbox
  set status='retry',locked_at=null,last_error=coalesce(last_error,'Worker lock expired before completion'),
      not_before=now()+interval '5 minutes'
  where status='processing' and locked_at < now()-interval '10 minutes';
  get diagnostics n=row_count;
  return n;
end;
$$;
revoke all on function private.release_stale_notification_locks() from public,anon,authenticated;
