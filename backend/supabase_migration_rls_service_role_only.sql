-- Migration : restreindre les politiques RLS « Service role full access » au rôle service_role uniquement.
-- Corrige l’avertissement du linter Supabase (rls_policy_always_true) : les politiques
-- permissives ne s’appliquent plus à tous les rôles, uniquement au backend (service_role).
-- Exécuter dans l’éditeur SQL du projet Supabase (Dashboard > SQL Editor).

-- cv_base
drop policy if exists "Service role full access cv_base" on public.cv_base;
create policy "Service role full access cv_base"
  on public.cv_base for all to service_role
  using (true) with check (true);

-- applications
drop policy if exists "Service role full access applications" on public.applications;
create policy "Service role full access applications"
  on public.applications for all to service_role
  using (true) with check (true);

-- events
drop policy if exists "Service role full access events" on public.events;
create policy "Service role full access events"
  on public.events for all to service_role
  using (true) with check (true);

-- user_plans
drop policy if exists "Service role full access user_plans" on public.user_plans;
create policy "Service role full access user_plans"
  on public.user_plans for all to service_role
  using (true) with check (true);
