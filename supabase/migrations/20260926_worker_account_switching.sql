-- Prevent farm-owner sessions from silently succeeding as worker joins.
grant usage on schema private to authenticated;

create or replace function private.join_farm_by_code(
  p_join_code text,
  p_employee_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_farm_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in is required.';
  end if;

  if exists (
    select 1
    from public.farms f
    where f.owner_user_id = v_uid
  ) or exists (
    select 1
    from public.farm_members fm
    where fm.user_id = v_uid
      and fm.role = 'owner'
  ) then
    raise exception 'You are signed in as a farm owner. Sign out and sign in with the worker account before joining.';
  end if;

  select fm.farm_id
    into v_farm_id
  from public.farm_members fm
  where fm.user_id = v_uid
    and fm.role = 'worker'
  order by fm.created_at
  limit 1;

  if v_farm_id is not null then
    if p_employee_number is not null and nullif(trim(p_employee_number), '') is not null then
      update public.farm_members
      set employee_number = nullif(trim(p_employee_number), '')
      where farm_id = v_farm_id
        and user_id = v_uid
        and role = 'worker';
    end if;

    return v_farm_id;
  end if;

  select f.id
    into v_farm_id
  from public.farms f
  where upper(f.join_code) = upper(trim(p_join_code))
  limit 1;

  if v_farm_id is null then
    raise exception 'That farm join code was not found.';
  end if;

  insert into public.farm_members (farm_id, user_id, role, employee_number)
  values (v_farm_id, v_uid, 'worker', nullif(trim(p_employee_number), ''));

  return v_farm_id;
end;
$$;

revoke all on function private.join_farm_by_code(text, text) from public;
grant execute on function private.join_farm_by_code(text, text) to authenticated;
