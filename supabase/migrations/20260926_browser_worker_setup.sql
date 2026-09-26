-- Allow an authenticated worker to join a farm using the owner's join code.
create schema if not exists private;

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

  select fm.farm_id into v_farm_id
  from public.farm_members fm
  where fm.user_id = v_uid
  order by fm.created_at
  limit 1;

  if v_farm_id is not null then
    return v_farm_id;
  end if;

  select f.id into v_farm_id
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

create or replace function public.join_farm_by_code(
  p_join_code text,
  p_employee_number text default null
)
returns uuid
language sql
security invoker
set search_path = public, private
as $$
  select private.join_farm_by_code(p_join_code, p_employee_number);
$$;

revoke all on function public.join_farm_by_code(text, text) from public;
revoke all on function public.join_farm_by_code(text, text) from anon;
grant execute on function public.join_farm_by_code(text, text) to authenticated;
