-- Prevent concurrent owner initialization from creating duplicate farms.
create unique index if not exists farms_owner_user_id_unique_idx
  on public.farms(owner_user_id);
