-- Supabase normally provisions default public grants; make core access explicit.
grant select,insert,update,delete on public.farms,public.farm_members,public.fields,
 public.farm_records,public.field_history_events,public.shifts,public.time_entries to authenticated;
