  -- Schéma Supabase pour AxeL Job
  -- Exécuter dans l’éditeur SQL du projet Supabase (Dashboard > SQL Editor).

  -- Table : CV de base (un seul enregistrement pour l’instant, id = 'default')
  create table if not exists public.cv_base (
    id text primary key default 'default',
    data jsonb not null,
    updated_at timestamptz default now()
  );

  -- Table : Candidatures (adaptations par annonce), une par utilisateur (user_id = id Supabase Auth)
  create table if not exists public.applications (
    id text primary key,
    user_id text not null default 'default',
    payload jsonb not null,
    updated_at timestamptz default now()
  );

  -- Index pour lister par date et par utilisateur
  create index if not exists idx_applications_updated_at on public.applications (updated_at desc);
  create index if not exists idx_applications_user_id on public.applications (user_id);

  -- RLS (Row Level Security) : désactiver si tu utilises la service_role key côté backend
  alter table public.cv_base enable row level security;
  alter table public.applications enable row level security;

  -- Politiques pour permettre au service_role (backend) d’accéder à tout (drop si existantes pour réexécution)
  drop policy if exists "Service role full access cv_base" on public.cv_base;
  create policy "Service role full access cv_base" on public.cv_base for all using (true) with check (true);
  drop policy if exists "Service role full access applications" on public.applications;
  create policy "Service role full access applications" on public.applications for all using (true) with check (true);

  -- Storage : bucket public « cv_photos » pour la photo CV.
  -- Créer le bucket via : supabase_migration_storage_cv_photos.sql (Dashboard > SQL Editor).
  -- Une photo par utilisateur : {user_id}/photo.jpg dans le bucket cv_photos. URL dans cv_base.data.photo_url.
