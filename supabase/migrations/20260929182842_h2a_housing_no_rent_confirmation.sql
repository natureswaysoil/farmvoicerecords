-- Missing confirmations must never default to an affirmative housing attestation.
alter table public.h2a_housing_assignments
  alter column no_rent_confirmed set default false;


-- Enforce confirmation for new writes without rewriting historical attestations.
-- Historical false rows must be reviewed before validating the constraint.
alter table public.h2a_housing_assignments
  add constraint h2a_housing_explicit_no_rent_confirmation
  check (no_rent_confirmed is true) not valid;
