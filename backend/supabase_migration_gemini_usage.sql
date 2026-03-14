-- Usage Gemini : tokens par requête (log) et par compte (agrégat), pour suivi et limite ~10 €/compte.
-- Exécuter dans l'éditeur SQL du projet Supabase (Dashboard > SQL Editor).

-- Agrégat par compte (une ligne par user_id)
create table if not exists public.gemini_usage (
  user_id text primary key,
  total_input_tokens bigint not null default 0,
  total_output_tokens bigint not null default 0,
  updated_at timestamptz default now()
);

-- Détail par requête (pour suivi / analyse)
create table if not exists public.gemini_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz default now()
);

create index idx_gemini_usage_log_user_id on public.gemini_usage_log (user_id);
create index idx_gemini_usage_log_created_at on public.gemini_usage_log (created_at desc);

alter table public.gemini_usage enable row level security;
alter table public.gemini_usage_log enable row level security;

drop policy if exists "Service role full access gemini_usage" on public.gemini_usage;
create policy "Service role full access gemini_usage" on public.gemini_usage for all to service_role using (true) with check (true);

drop policy if exists "Service role full access gemini_usage_log" on public.gemini_usage_log;
create policy "Service role full access gemini_usage_log" on public.gemini_usage_log for all to service_role using (true) with check (true);
