-- Tracewell Supabase Schema
-- Run this in your Supabase SQL editor

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  industry text not null,
  size text not null,
  country text not null,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  filename text not null,
  file_type text not null,
  storage_url text not null,
  parse_status text default 'pending',
  uploaded_at timestamptz default now()
);

create table if not exists extracted_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  company_id uuid references companies not null,
  field_key text not null,
  value jsonb not null,
  unit text,
  extracted_quote text,
  page_reference text,
  confidence text,
  source text default 'document_parsed',
  user_confirmed boolean default false,
  flagged_discrepancy boolean default false,
  created_at timestamptz default now()
);

create table if not exists esg_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  scores jsonb not null,
  interpretation text,
  data_quality_score numeric,
  created_at timestamptz default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  items jsonb not null,
  status_map jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  agent_type text not null,
  status text default 'pending',
  steps jsonb default '[]',
  result jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Row Level Security
alter table companies enable row level security;
create policy "own companies" on companies for all using (user_id = auth.uid());

alter table documents enable row level security;
create policy "own documents" on documents for all using (
  company_id in (select id from companies where user_id = auth.uid())
);

alter table extracted_fields enable row level security;
create policy "own fields" on extracted_fields for all using (
  company_id in (select id from companies where user_id = auth.uid())
);

alter table esg_scores enable row level security;
create policy "own scores" on esg_scores for all using (
  company_id in (select id from companies where user_id = auth.uid())
);

alter table recommendations enable row level security;
create policy "own recs" on recommendations for all using (
  company_id in (select id from companies where user_id = auth.uid())
);

alter table agent_runs enable row level security;
create policy "own runs" on agent_runs for all using (
  company_id in (select id from companies where user_id = auth.uid())
);
