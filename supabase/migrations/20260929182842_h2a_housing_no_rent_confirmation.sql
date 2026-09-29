-- Missing confirmations must never default to an affirmative housing attestation.
alter table public.h2a_housing_assignments
  alter column no_rent_confirmed set default false;
