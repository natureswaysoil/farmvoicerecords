-- Browser worker onboarding and non-recursive farm membership checks.

create schema if not exists private;

create or replace function private.is_farm_owner(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.farms f
      where f.id = p_farm_id
        and f.owner_user_id = auth.uid()
    );
$$;

create or replace function private.is_farm_member(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.farm_members m
      where m.farm_id = p_farm_id
        and m.user_id = auth.uid()
    );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_farm_owner(uuid) from public;
revoke all on function private.is_farm_member(uuid) from public;
grant execute on function private.is_farm_owner(uuid) to authenticated;
grant execute on function private.is_farm_member(uuid) to authenticated;

drop policy if exists "members or owners read farms" on public.farms;
create policy "members or owners read farms"
on public.farms for select to authenticated
using (owner_user_id = (select auth.uid()) or private.is_farm_member(id));

drop policy if exists "members read memberships" on public.farm_members;
create policy "members read memberships"
on public.farm_members for select to authenticated
using (user_id = (select auth.uid()) or private.is_farm_owner(farm_id));

drop policy if exists "owners add memberships" on public.farm_members;
create policy "owners add memberships"
on public.farm_members for insert to authenticated
with check (private.is_farm_owner(farm_id));

drop policy if exists "owners update memberships" on public.farm_members;
create policy "owners update memberships"
on public.farm_members for update to authenticated
using (private.is_farm_owner(farm_id))
with check (private.is_farm_owner(farm_id));

drop policy if exists "owners remove memberships" on public.farm_members;
create policy "owners remove memberships"
on public.farm_members for delete to authenticated
using (private.is_farm_owner(farm_id));

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
