-- Codes promo / concours / partenaires (saisie utilisateur ou ops).
-- Exécuter dans le Dashboard Supabase > SQL Editor.

begin;

create table if not exists public.promo_codes (
  id text primary key,
  code text not null,
  code_normalized text not null unique,
  kind text not null default 'bonus_adaptations'
    check (kind in ('bonus_adaptations', 'contest_entry', 'bde_partner')),
  label text not null default '',
  bonus_adaptations integer not null default 0 check (bonus_adaptations >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_user integer not null default 1 check (max_per_user > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  partner_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promo_codes_active on public.promo_codes (active, valid_until);

create table if not exists public.promo_redemptions (
  id bigint generated always as identity primary key,
  promo_code_id text not null references public.promo_codes (id) on delete restrict,
  user_id text not null,
  redeemed_at timestamptz not null default now()
);

create index if not exists idx_promo_redemptions_user on public.promo_redemptions (user_id, redeemed_at desc);
create index if not exists idx_promo_redemptions_code on public.promo_redemptions (promo_code_id);

create unique index if not exists idx_promo_redemptions_user_code
  on public.promo_redemptions (promo_code_id, user_id);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "Service role full access promo_codes" on public.promo_codes;
create policy "Service role full access promo_codes" on public.promo_codes
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access promo_redemptions" on public.promo_redemptions;
create policy "Service role full access promo_redemptions" on public.promo_redemptions
  for all to service_role using (true) with check (true);

-- Exemples (adapter / désactiver en prod)
insert into public.promo_codes (
  id, code, code_normalized, kind, label, bonus_adaptations, max_redemptions, max_per_user, partner_code
) values
  (
    'promo_welcome3',
    'WELCOME3',
    'WELCOME3',
    'bonus_adaptations',
    '3 adaptations offertes',
    3,
    5000,
    1,
    null
  ),
  (
    'contest_demo2026',
    'CONCOURS2026',
    'CONCOURS2026',
    'contest_entry',
    'Concours printemps 2026',
    0,
    null,
    1,
    null
  ),
  (
    'bde_exemple',
    'BDE_EXEMPLE',
    'BDE_EXEMPLE',
    'bde_partner',
    'Partenaire BDE (exemple)',
    0,
    null,
    1,
    'BDE_EXEMPLE'
  )
on conflict (id) do nothing;

commit;
