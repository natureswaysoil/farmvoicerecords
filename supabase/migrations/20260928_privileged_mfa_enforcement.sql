-- Keep privileged-account MFA requirements reproducible in source control.
-- This mirrors the production helper and AAL2 enforcement used by FarmVoice.

create or replace function public.requires_mfa_for_current_user()
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.farms f
        where f.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.h2a_user_roles r
        where r.user_id = auth.uid()
          and r.role in ('h2a_admin','housing_manager','payroll')
      )
    );
$$;

revoke all on function public.requires_mfa_for_current_user() from public, anon;
grant execute on function public.requires_mfa_for_current_user() to authenticated;

-- Owners must have an AAL2 session for privileged H-2A access.
create or replace function private.h2a_is_owner(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1
      from public.farms f
      where f.id = p_farm_id
        and f.owner_user_id = auth.uid()
    );
$$;

-- Privileged H-2A roles require AAL2. Crew leaders remain exempt so the
-- field workflow can continue without forcing privileged-account MFA policy.
create or replace function private.h2a_has_role(p_farm_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.h2a_user_roles r
      join public.farm_members m
        on m.farm_id = r.farm_id
       and m.user_id = r.user_id
      where r.farm_id = p_farm_id
        and r.user_id = auth.uid()
        and r.role = any(p_roles)
        and (
          r.role = 'crew_leader'
          or (select auth.jwt()->>'aal') = 'aal2'
        )
    );
$$;

revoke all on function private.h2a_is_owner(uuid) from public;
revoke all on function private.h2a_has_role(uuid,text[]) from public;
grant execute on function private.h2a_is_owner(uuid) to authenticated;
grant execute on function private.h2a_has_role(uuid,text[]) to authenticated;
