-- Crédits d’adaptations gratuites supplémentaires (promo / support).
-- Défaut 0 : les nouveaux utilisateurs restent à 3 adaptations de base (FREE_ADAPTATIONS_LIMIT côté app).
-- Pour remettre la jauge affichée à 0/3 tout en gardant l’historique en base, utiliser aussi
-- free_adaptation_count_anchor (voir supabase_migration_user_plans_free_adaptation_anchor.sql).
-- Exemple pour redonner 3 essais aux comptes free existants qui ont déjà une ligne user_plans :
--   UPDATE public.user_plans SET free_adaptation_bonus = 3 WHERE plan = 'free';
-- Les utilisateurs sans ligne user_plans ont bonus 0 (comportement inchangé).
-- Pour inclure ceux qui n’ont jamais eu de ligne (ex. bonus 3 pour tous les user_id vus dans applications) :
--   INSERT INTO public.user_plans (user_id, plan, free_adaptation_bonus)
--   SELECT DISTINCT user_id, 'free', 3 FROM public.applications WHERE user_id IS NOT NULL AND user_id <> ''
--   ON CONFLICT (user_id) DO UPDATE SET free_adaptation_bonus = 3;
-- Exécuter dans le Dashboard Supabase > SQL Editor.

alter table public.user_plans
  add column if not exists free_adaptation_bonus integer not null default 0
  check (free_adaptation_bonus >= 0);

comment on column public.user_plans.free_adaptation_bonus is
  'Ajouté au plafond gratuit d’adaptations (ex. 3 + bonus). Ignoré si plan pro ou paywall_disabled.';
