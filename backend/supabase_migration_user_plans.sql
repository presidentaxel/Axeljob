-- Plan utilisateur (free / pro) pour limites et Stripe
-- Exécuter dans l’éditeur SQL du projet Supabase.

create table if not exists public.user_plans (
  user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  paywall_disabled boolean not null default false,
  free_adaptation_bonus integer not null default 0 check (free_adaptation_bonus >= 0),
  free_adaptation_count_anchor integer not null default 0 check (free_adaptation_count_anchor >= 0),
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz default now()
);

alter table public.user_plans enable row level security;
drop policy if exists "Service role full access user_plans" on public.user_plans;
create policy "Service role full access user_plans" on public.user_plans for all to service_role using (true) with check (true);
