-- Schéma Supabase pour CV Bot
-- Exécuter dans l’éditeur SQL du projet Supabase (Dashboard > SQL Editor).

-- Table : CV de base (un seul enregistrement pour l’instant, id = 'default')
create table if not exists public.cv_base (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Table : Candidatures (adaptations par annonce)
create table if not exists public.applications (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

-- Index pour lister par date
create index if not exists idx_applications_updated_at on public.applications (updated_at desc);

-- RLS (Row Level Security) : désactiver si tu utilises la service_role key côté backend
alter table public.cv_base enable row level security;
alter table public.applications enable row level security;

-- Politique pour permettre au service_role (backend) d’accéder à tout
create policy "Service role full access cv_base" on public.cv_base for all using (true) with check (true);
create policy "Service role full access applications" on public.applications for all using (true) with check (true);

-- Storage : bucket public pour les photos CV (uniquement Supabase, pas de fichiers locaux)
-- Dans le Dashboard Supabase : Storage > New bucket > nom « cv_photos », cocher Public.
-- Les photos sont stockées sous {user_id}/photo.jpg ; l'URL publique est enregistrée dans cv_base.data.photo_url.
