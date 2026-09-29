do $$ declare t record; feature text; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='farm_id'
 and (table_name in ('farm_records','fields','field_history_events','shifts','farm_photo_evidence') or table_name like 'h2a_%')
 loop
 feature := case when t.table_name like 'h2a_%' then 'h2a' else 'core' end;
 execute format('create policy subscription_delete on public.%I as restrictive for delete to authenticated using (public.farm_plan_access(farm_id,%L))',t.table_name,feature);
 end loop;
end $$;
create or replace function private.require_farm_write_plan() returns trigger language plpgsql set search_path='' as $$
declare target_farm uuid;
begin
 target_farm := case when tg_op='DELETE' then old.farm_id else new.farm_id end;
 if auth.uid() is not null and not public.farm_plan_access(target_farm,case when tg_table_name like 'h2a_%' then 'h2a' else 'core' end) then
  raise exception 'Trial or subscription required for this write' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.require_farm_write_plan() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='farm_id'
 and (table_name in ('farm_records','fields','field_history_events','shifts','farm_photo_evidence') or table_name like 'h2a_%') loop
 execute format('drop trigger if exists require_farm_write_plan on public.%I',t.table_name);
 execute format('create trigger require_farm_write_plan before insert or update or delete on public.%I for each row execute function private.require_farm_write_plan()',t.table_name);
 end loop;
end $$;
