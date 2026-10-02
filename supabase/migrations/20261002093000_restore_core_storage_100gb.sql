begin;

-- FarmVoice Core includes 100 decimal GB of farm photo/document storage.
-- Restore only the prior standard 10 GB allowance; preserve explicitly customized limits.
alter table private.farm_storage_usage
  alter column limit_bytes set default 100000000000;

update private.farm_storage_usage
set limit_bytes = 100000000000
where limit_bytes = 10000000000;

create or replace function public.farm_storage_status(p_farm_id uuid)
returns table(used_bytes bigint, limit_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    private.core_is_member(p_farm_id)
    or private.core_is_owner(p_farm_id)
  ) then
    raise exception 'Farm access required';
  end if;

  return query
    select
      coalesce(u.used_bytes, 0::bigint),
      coalesce(u.limit_bytes, 100000000000::bigint)
    from (values (p_farm_id)) f(id)
    left join private.farm_storage_usage u on u.farm_id = f.id;
end
$$;

commit;
