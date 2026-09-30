begin;
-- NULL distinguishes historical manually entered hours from calculated entries.
alter table public.h2a_daily_records
 add column shift_minutes integer check (shift_minutes between 1 and 1440),
 add column paid_break_minutes integer check (paid_break_minutes between 0 and 1440),
 add constraint h2a_breaks_within_shift check (shift_minutes is null or
 (paid_break_minutes is not null and break_minutes < shift_minutes and paid_break_minutes + break_minutes <= shift_minutes));
create function private.calculate_h2a_paid_hours() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.shift_minutes is distinct from old.shift_minutes or new.paid_break_minutes is distinct from old.paid_break_minutes or new.break_minutes is distinct from old.break_minutes) and (old.approved_at is not null or new.approved_at is distinct from old.approved_at) then
  raise exception 'Do not change breaks or shift duration on approved records or during approval';
 end if;
 if tg_op='UPDATE' and old.shift_minutes is not null and new.shift_minutes is null then
  raise exception 'Calculated time cannot be changed to legacy manual hours';
 end if;
 if new.shift_minutes is not null then
  new.hours_worked := round((new.shift_minutes - new.break_minutes)::numeric / 60, 2);
 end if;
 return new;
end $$;
revoke all on function private.calculate_h2a_paid_hours() from public,anon,authenticated;
create trigger a_calculate_h2a_paid_hours before insert or update on public.h2a_daily_records for each row execute function private.calculate_h2a_paid_hours();
commit;
