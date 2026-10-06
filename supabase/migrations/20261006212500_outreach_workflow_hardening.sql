-- Harden outreach workflow rules and make tracking updates atomic.

create index if not exists outreach_posts_group_id_idx
  on public.outreach_posts (group_id);

create or replace function public.queue_outreach_post(
  p_group_id uuid,
  p_topic text,
  p_post_text text,
  p_destination_path text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group public.outreach_groups%rowtype;
  v_status text := 'ready';
  v_id uuid;
  v_day text := lower(to_char(current_date, 'Dy'));
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) not in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_group
  from public.outreach_groups
  where id = p_group_id
  for update;

  if not found or not v_group.active then
    raise exception 'Group is inactive or missing';
  end if;

  if v_group.promotion_policy = 'no_promotion' then
    raise exception 'This group is marked no promotion';
  end if;

  if v_group.next_post_after is not null and v_group.next_post_after > now() then
    raise exception 'This group is still in its posting cooldown';
  end if;

  if exists (
    select 1 from public.outreach_posts
    where group_id = p_group_id
      and status in ('ready','approval_required')
  ) then
    raise exception 'This group already has a pending post';
  end if;

  if v_group.promotion_policy = 'specific_days' then
    if coalesce(array_length(v_group.allowed_days, 1), 0) = 0
       or not (v_day = any(v_group.allowed_days)) then
      raise exception 'Today is not an allowed promotion day for this group';
    end if;
  elsif v_group.promotion_policy in ('approval_required','unknown') then
    v_status := 'approval_required';
  end if;

  insert into public.outreach_posts (
    group_id, topic, post_text, destination_path, status, scheduled_for
  ) values (
    p_group_id, p_topic, p_post_text, p_destination_path, v_status, current_date
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.mark_outreach_posted(p_post_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) not in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  ) then
    raise exception 'Not authorized';
  end if;

  update public.outreach_posts
  set status = 'posted', posted_at = now()
  where id = p_post_id
    and status in ('ready','approval_required')
  returning group_id into v_group_id;

  if v_group_id is null then
    raise exception 'Post is not ready to mark posted';
  end if;

  update public.outreach_groups
  set last_posted_at = now(),
      next_post_after = now() + interval '7 days'
  where id = v_group_id;
end;
$$;

create or replace function public.increment_outreach_metric(
  p_post_id uuid,
  p_metric text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) not in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  ) then
    raise exception 'Not authorized';
  end if;

  if p_metric = 'comments_count' then
    update public.outreach_posts set comments_count = comments_count + 1 where id = p_post_id;
  elsif p_metric = 'interested_leads' then
    update public.outreach_posts set interested_leads = interested_leads + 1 where id = p_post_id;
  elsif p_metric = 'trial_signups' then
    update public.outreach_posts set trial_signups = trial_signups + 1 where id = p_post_id;
  elsif p_metric = 'paid_customers' then
    update public.outreach_posts set paid_customers = paid_customers + 1 where id = p_post_id;
  else
    raise exception 'Unsupported metric';
  end if;
end;
$$;

create or replace function public.set_outreach_mrr(
  p_post_id uuid,
  p_monthly_revenue numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) not in (
    'natureswaysoil@gmail.com',
    'james@farmvoicerecords.com'
  ) then
    raise exception 'Not authorized';
  end if;

  if p_monthly_revenue < 0 then
    raise exception 'Monthly revenue cannot be negative';
  end if;

  update public.outreach_posts
  set monthly_revenue = round(p_monthly_revenue, 2)
  where id = p_post_id;
end;
$$;

revoke all on function public.queue_outreach_post(uuid,text,text,text) from public, anon;
revoke all on function public.mark_outreach_posted(uuid) from public, anon;
revoke all on function public.increment_outreach_metric(uuid,text) from public, anon;
revoke all on function public.set_outreach_mrr(uuid,numeric) from public, anon;

grant execute on function public.queue_outreach_post(uuid,text,text,text) to authenticated;
grant execute on function public.mark_outreach_posted(uuid) to authenticated;
grant execute on function public.increment_outreach_metric(uuid,text) to authenticated;
grant execute on function public.set_outreach_mrr(uuid,numeric) to authenticated;
