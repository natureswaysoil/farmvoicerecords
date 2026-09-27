-- Keep the repository schema aligned with USDA/FSA fields already used by the importer.
alter table public.fields
  add column if not exists fsa_state_code text,
  add column if not exists fsa_county_code text,
  add column if not exists clu_id text;
