-- Ancrage du compteur d’adaptations gratuites affiché (remise visuelle à 0/3).
-- Le quota réel = anchor + 3 + free_adaptation_bonus (voir backend).
-- Remise à zéro apparente + 3 essais en plus (exemple) :
--   UPDATE public.user_plans up
--   SET free_adaptation_count_anchor = (
--         SELECT COUNT(*)::int FROM public.applications a WHERE a.user_id = up.user_id
--       ),
--       free_adaptation_bonus = 3
--   WHERE plan = 'free';
-- Exécuter dans le Dashboard Supabase > SQL Editor.

alter table public.user_plans
  add column if not exists free_adaptation_count_anchor integer not null default 0
  check (free_adaptation_count_anchor >= 0);

comment on column public.user_plans.free_adaptation_count_anchor is
  'Nombre d’adaptations déjà réalisées ignorées pour l’affichage (jauge 0–3) et pour le début du quota courant.';
