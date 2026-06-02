-- Attribution partenaire (BDE) : 1 ligne par utilisateur.
-- Le code partenaire est capturé côté backend au premier login depuis un lien taggé.

create table if not exists public.user_referrals (
  user_id text primary key,
  partner_code text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_path text,
  captured_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_referrals_partner_code on public.user_referrals (partner_code);
create index if not exists idx_user_referrals_captured_at on public.user_referrals (captured_at desc);

alter table public.user_referrals enable row level security;
drop policy if exists "Service role full access user_referrals" on public.user_referrals;
create policy "Service role full access user_referrals" on public.user_referrals for all to service_role using (true) with check (true);
