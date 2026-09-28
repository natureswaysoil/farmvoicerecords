-- Private evidence storage for H-2A housing inspections.
-- Object paths begin with farm_id so Storage RLS can enforce farm membership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'h2a-housing-evidence',
  'h2a-housing-evidence',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.h2a_storage_farm_id(p_name text)
returns uuid
language sql
stable
set search_path = storage
as $$
  select case
    when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$$;

revoke all on function private.h2a_storage_farm_id(text) from public;
grant execute on function private.h2a_storage_farm_id(text) to authenticated;

drop policy if exists "h2a housing evidence read" on storage.objects;
create policy "h2a housing evidence read"
on storage.objects for select to authenticated
using (
  bucket_id = 'h2a-housing-evidence'
  and private.h2a_storage_farm_id(name) is not null
  and private.h2a_can_read(private.h2a_storage_farm_id(name))
);

drop policy if exists "h2a housing evidence insert" on storage.objects;
create policy "h2a housing evidence insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'h2a-housing-evidence'
  and private.h2a_storage_farm_id(name) is not null
  and (
    private.h2a_is_owner(private.h2a_storage_farm_id(name))
    or private.h2a_has_role(private.h2a_storage_farm_id(name), array['h2a_admin','housing_manager'])
  )
);

drop policy if exists "h2a housing evidence update" on storage.objects;
create policy "h2a housing evidence update"
on storage.objects for update to authenticated
using (
  bucket_id = 'h2a-housing-evidence'
  and private.h2a_storage_farm_id(name) is not null
  and (
    private.h2a_is_owner(private.h2a_storage_farm_id(name))
    or private.h2a_has_role(private.h2a_storage_farm_id(name), array['h2a_admin','housing_manager'])
  )
)
with check (
  bucket_id = 'h2a-housing-evidence'
  and private.h2a_storage_farm_id(name) is not null
  and (
    private.h2a_is_owner(private.h2a_storage_farm_id(name))
    or private.h2a_has_role(private.h2a_storage_farm_id(name), array['h2a_admin','housing_manager'])
  )
);

drop policy if exists "h2a housing evidence delete" on storage.objects;
create policy "h2a housing evidence delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'h2a-housing-evidence'
  and private.h2a_storage_farm_id(name) is not null
  and (
    private.h2a_is_owner(private.h2a_storage_farm_id(name))
    or private.h2a_has_role(private.h2a_storage_farm_id(name), array['h2a_admin','housing_manager'])
  )
);
