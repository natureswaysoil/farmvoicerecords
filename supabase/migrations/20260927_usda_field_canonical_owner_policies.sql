-- Allow the canonical farms.owner_user_id to manage field rows even if a
-- separate farm_members owner row is missing. Existing member policies remain.
create policy "canonical owners read fields"
on public.fields for select to authenticated
using (
  exists (
    select 1 from public.farms f
    where f.id = fields.farm_id
      and f.owner_user_id = (select auth.uid())
  )
);

create policy "canonical owners create fields"
on public.fields for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.farms f
    where f.id = fields.farm_id
      and f.owner_user_id = (select auth.uid())
  )
);

create policy "canonical owners update fields"
on public.fields for update to authenticated
using (
  exists (
    select 1 from public.farms f
    where f.id = fields.farm_id
      and f.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.farms f
    where f.id = fields.farm_id
      and f.owner_user_id = (select auth.uid())
  )
);
