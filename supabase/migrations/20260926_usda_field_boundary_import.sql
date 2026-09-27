-- Store USDA/FSA CLU polygon geometry and import provenance on FarmVoice fields.
alter table public.fields
  add column if not exists boundary_geojson jsonb,
  add column if not exists boundary_source text,
  add column if not exists boundary_source_filename text,
  add column if not exists boundary_imported_at timestamptz;

create index if not exists fields_boundary_source_idx
  on public.fields(farm_id, boundary_source)
  where boundary_source is not null;
