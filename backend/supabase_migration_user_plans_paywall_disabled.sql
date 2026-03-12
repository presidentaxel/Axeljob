-- Désactiver le paywall pour certains utilisateurs (option dans la table user_plans).
-- Exécuter dans Supabase Dashboard > SQL Editor.

alter table public.user_plans
  add column if not exists paywall_disabled boolean not null default false;

comment on column public.user_plans.paywall_disabled is 'Si true, les limites (adaptations gratuites, etc.) ne s''appliquent pas pour cet utilisateur.';
