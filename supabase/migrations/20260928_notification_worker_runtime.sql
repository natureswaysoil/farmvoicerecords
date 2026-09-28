create extension if not exists pg_net with schema extensions;

grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;

create or replace function public.notification_worker_claim(p_limit integer default 25)
returns setof public.notification_outbox language sql security definer set search_path=public,private
as $$ select * from private.claim_notification_outbox(p_limit); $$;
revoke all on function public.notification_worker_claim(integer) from public,anon,authenticated;
grant execute on function public.notification_worker_claim(integer) to service_role;

create or replace function public.notification_worker_recipients(p_farm_id uuid)
returns table(user_id uuid,email text,email_enabled boolean) language sql security definer set search_path=public,private
as $$ select * from private.notification_recipients(p_farm_id); $$;
revoke all on function public.notification_worker_recipients(uuid) from public,anon,authenticated;
grant execute on function public.notification_worker_recipients(uuid) to service_role;

create or replace function public.notification_worker_complete(p_outbox_id uuid)
returns void language sql security definer set search_path=public,private
as $$ select private.complete_notification_outbox(p_outbox_id); $$;
revoke all on function public.notification_worker_complete(uuid) from public,anon,authenticated;
grant execute on function public.notification_worker_complete(uuid) to service_role;

create or replace function public.notification_worker_retry(p_outbox_id uuid,p_error text)
returns void language sql security definer set search_path=public,private
as $$ select private.retry_notification_outbox(p_outbox_id,p_error); $$;
revoke all on function public.notification_worker_retry(uuid,text) from public,anon,authenticated;
grant execute on function public.notification_worker_retry(uuid,text) to service_role;

create or replace function public.notification_worker_release_stale()
returns integer language sql security definer set search_path=public,private
as $$ select private.release_stale_notification_locks(); $$;
revoke all on function public.notification_worker_release_stale() from public,anon,authenticated;
grant execute on function public.notification_worker_release_stale() to service_role;