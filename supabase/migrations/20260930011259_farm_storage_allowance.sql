begin;
create table private.farm_storage_usage(
 farm_id uuid primary key references public.farms(id),used_bytes bigint not null default 0 check(used_bytes>=0),limit_bytes bigint not null default 100000000000 check(limit_bytes>=0)
);
alter table private.farm_storage_usage enable row level security;
revoke all on private.farm_storage_usage from public,anon,authenticated;
grant all on private.farm_storage_usage to service_role;
create function private.storage_farm(bucket text,path text) returns uuid language plpgsql immutable set search_path='' as $$
begin
 if bucket not in ('farm-photo-evidence','h2a-documents','h2a-housing-evidence') then return null; end if;
 return split_part(path,'/',1)::uuid;
exception when invalid_text_representation then return null;
end $$;
revoke all on function private.storage_farm(text,text) from public,anon,authenticated;
insert into private.farm_storage_usage(farm_id,used_bytes)
 select f.id,coalesce(sum(coalesce((o.metadata->>'size')::bigint,0)),0)
 from public.farms f left join storage.objects o on private.storage_farm(o.bucket_id,o.name)=f.id group by f.id;
create function private.enforce_farm_storage() returns trigger language plpgsql security definer set search_path='' as $$
declare f uuid;old_f uuid;delta bigint;usage bigint;allowance bigint;
begin
 if tg_op<>'INSERT' then old_f:=private.storage_farm(old.bucket_id,old.name); end if;
 if tg_op<>'DELETE' then f:=private.storage_farm(new.bucket_id,new.name); else f:=old_f; end if;
 if tg_op='UPDATE' and f is distinct from old_f then raise exception 'Move files between farms by downloading and uploading a new copy'; end if;
 if f is null then return coalesce(new,old); end if;
 delta:=case when tg_op='DELETE' then 0 else coalesce((new.metadata->>'size')::bigint,0) end
       -case when tg_op='INSERT' then 0 else coalesce((old.metadata->>'size')::bigint,0) end;
 insert into private.farm_storage_usage(farm_id) values(f) on conflict do nothing;
 -- Row update serializes concurrent object writes for this farm.
 update private.farm_storage_usage set used_bytes=greatest(0,used_bytes+delta) where farm_id=f returning used_bytes,limit_bytes into usage,allowance;
 if delta>0 and usage>allowance then raise exception 'Farm storage allowance reached. Download or remove unneeded files, or contact support for more capacity.' using errcode='P0001'; end if;
 return coalesce(new,old);
end $$;
revoke all on function private.enforce_farm_storage() from public,anon,authenticated;
create trigger farm_storage_allowance after insert or update or delete on storage.objects for each row execute function private.enforce_farm_storage();
create function public.farm_storage_status(p_farm_id uuid) returns table(used_bytes bigint,limit_bytes bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.core_is_member(p_farm_id) or private.core_is_owner(p_farm_id)) then raise exception 'Farm access required'; end if;
 return query select coalesce(u.used_bytes,0::bigint),coalesce(u.limit_bytes,100000000000::bigint) from (values(p_farm_id)) f(id) left join private.farm_storage_usage u on u.farm_id=f.id;
end $$;
revoke all on function public.farm_storage_status(uuid) from public,anon;
grant execute on function public.farm_storage_status(uuid) to authenticated;
commit;
