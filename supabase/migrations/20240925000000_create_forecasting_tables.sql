create extension if not exists "pgcrypto";

create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  query text,
  requested_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer,
  status text check (status in ('success', 'error')),
  params jsonb,
  rows jsonb,
  error text,
  requested_by uuid,
  inserted_at timestamptz default now()
);

create index if not exists forecast_runs_requested_by_idx on public.forecast_runs (requested_by, requested_at desc);

create table if not exists public.field_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  dataset_id text not null,
  source_column text not null,
  target_field text,
  score numeric,
  candidates_ranked jsonb,
  updated_at timestamptz default now(),
  unique (tenant_id, dataset_id, source_column)
);

create index if not exists field_mappings_tenant_dataset_idx on public.field_mappings (tenant_id, dataset_id);
