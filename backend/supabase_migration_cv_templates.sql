-- Templates CV personnalisés : HTML/CSS dans Supabase, accès par owner_user_id + allowed_user_ids.
-- Exécuter dans Supabase Dashboard > SQL Editor après le schéma principal.

create table if not exists public.cv_templates (
  id text primary key,
  name text not null,
  description text default '',
  html_content text not null,
  css_content text,
  options jsonb default '[]',
  owner_user_id text not null,
  allowed_user_ids text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cv_templates_owner on public.cv_templates (owner_user_id);
create index if not exists idx_cv_templates_allowed on public.cv_templates using gin (allowed_user_ids);

alter table public.cv_templates enable row level security;

drop policy if exists "Service role full access cv_templates" on public.cv_templates;
create policy "Service role full access cv_templates" on public.cv_templates for all to service_role using (true) with check (true);

comment on table public.cv_templates is 'Templates CV personnalisés : HTML/CSS stockés en base. owner_user_id = créateur (ou __pending__ pour imports bot : invisibles jusqu''à affectation manuelle). allowed_user_ids = utilisateurs autorisés.';
