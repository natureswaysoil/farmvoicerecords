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
    order by case o.severity when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end, o.not_before, o.created_at
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


create or replace function private.complete_notification_outbox(p_outbox_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_outbox
  set status = 'delivered', processed_at = now(), locked_at = null, last_error = null
  where id = p_outbox_id and status = 'processing';
end;
$$;
revoke all on function private.complete_notification_outbox(uuid) from public, anon, authenticated;

create or replace function private.retry_notification_outbox(p_outbox_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt integer;
begin
  select attempt_count into v_attempt
  from public.notification_outbox
  where id = p_outbox_id
  for update;

  if not found then
    return;
  end if;

  update public.notification_outbox
  set status = case when v_attempt >= 5 then 'dead_letter' else 'retry' end,
      last_error = left(coalesce(p_error, 'Unknown notification error'), 2000),
      locked_at = null,
      not_before = case
        when v_attempt >= 5 then not_before
        else now() + make_interval(mins => least(60, greatest(2, power(2, greatest(v_attempt - 1, 0))::integer)))
      end
  where id = p_outbox_id;
end;
$$;
revoke all on function private.retry_notification_outbox(uuid, text) from public, anon, authenticated;
