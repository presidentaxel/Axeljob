-- Migration : ajouter user_id à la table applications (bases existantes).
-- Exécuter dans Supabase Dashboard > SQL Editor si ta table applications n'a pas encore la colonne user_id.
-- Après migration, chaque utilisateur ne voit que ses propres candidatures.

alter table public.applications add column if not exists user_id text default 'default';
update public.applications set user_id = 'default' where user_id is null;
alter table public.applications alter column user_id set not null;
create index if not exists idx_applications_user_id on public.applications (user_id);
