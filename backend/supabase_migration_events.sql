-- Migration : table events pour logs structurés (mémoire / analyse).
-- Exécuter dans l'éditeur SQL du projet Supabase (Dashboard > SQL Editor).
-- Si tu as déjà une table events avec un mauvais schéma, elle est supprimée puis recréée (données perdues).

drop table if exists public.events;

create table public.events (
  id bigint generated always as identity primary key,
  event_type text not null,
  user_id text,
  session_id text,
  context jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_events_created_at on public.events (created_at desc);
create index idx_events_event_type on public.events (event_type);
create index idx_events_user_id on public.events (user_id);

alter table public.events enable row level security;

-- Politique : accès service_role uniquement (backend)
create policy "Service role full access events" on public.events for all using (true) with check (true);
