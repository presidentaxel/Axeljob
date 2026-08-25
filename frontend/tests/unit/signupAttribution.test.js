import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_INTENT_BY_CTA,
  persistFromCtaClick,
  readSourceCtaId,
  readPlanIntent,
  shouldPersistSourceCta,
  planIntentFromCta,
  buildLoginRedirectTo,
  hydratePlanIntentFromSearch,
  wantsProCheckout,
  consumePlanIntentIfPro,
  isLikelyNewAuthUser,
  authMethodFromUser,
  signUpStartParams,
  signUpParams,
  compactParams,
  emitSignUpStartOnce,
  emitSignUpOnce,
  SOURCE_CTA_KEY,
  PLAN_INTENT_KEY,
  SIGN_UP_START_SENT_KEY,
  SIGN_UP_SENT_KEY,
  CONSENT_STORAGE_KEY,
} from '../../public/signupAttribution.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(String(k), String(v));
    },
    removeItem: (k) => {
      m.delete(String(k));
    },
    clear: () => m.clear(),
  };
}

function grantConsent() {
  globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, analytics: true }));
}

beforeEach(() => {
  globalThis.sessionStorage = memoryStorage();
  globalThis.localStorage = memoryStorage();
  globalThis.window = globalThis;
  globalThis.window.dataLayer = [];
  globalThis.window.gtag = undefined;
});

test('hero CTA → source_cta_id + plan_intent free', () => {
  const ok = persistFromCtaClick({
    dataAttr: 'home-hero-cta-signup',
    dataTrack: 'cta',
    linkUrl: '/login',
  });
  assert.equal(ok, true);
  assert.equal(readSourceCtaId(), 'home-hero-cta-signup');
  assert.equal(readPlanIntent(), 'free');
  assert.equal(PLAN_INTENT_BY_CTA['home-hero-cta-signup'], undefined);
  assert.equal(planIntentFromCta('home-hero-cta-signup', '/login'), 'free');
});

test('pricing Pro → plan_intent pro et source_cta_id', () => {
  persistFromCtaClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    linkUrl: '/login?plan=pro',
  });
  assert.equal(readSourceCtaId(), 'home-pricing-cta-pro');
  assert.equal(readPlanIntent(), 'pro');
});

test('CTA login page n’écrase pas l’attribution landing', () => {
  persistFromCtaClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    linkUrl: '/login?plan=pro',
  });
  const again = persistFromCtaClick({
    dataAttr: 'login-cta-google',
    dataTrack: 'cta',
    linkUrl: '/login',
  });
  assert.equal(again, false);
  assert.equal(shouldPersistSourceCta('login-cta-google', 'cta', '/login'), false);
  assert.equal(readSourceCtaId(), 'home-pricing-cta-pro');
  assert.equal(readPlanIntent(), 'pro');
});

test('nav / hors login : pas de persist', () => {
  assert.equal(shouldPersistSourceCta('footer-link-faq', 'nav', '/faq'), false);
  assert.equal(
    persistFromCtaClick({ dataAttr: 'error-cta-home', dataTrack: 'cta', linkUrl: '/' }),
    false,
  );
});

test('buildLoginRedirectTo garde plan=pro et UTM', () => {
  assert.equal(
    buildLoginRedirectTo('https://job.axelproject.fr', '?plan=pro&utm_source=meta', 'free'),
    'https://job.axelproject.fr/login?plan=pro&utm_source=meta',
  );
  assert.equal(
    buildLoginRedirectTo('https://job.axelproject.fr', '', 'pro'),
    'https://job.axelproject.fr/login?plan=pro',
  );
  assert.equal(
    buildLoginRedirectTo('https://job.axelproject.fr', '?utm_campaign=a', 'free'),
    'https://job.axelproject.fr/login?utm_campaign=a',
  );
  assert.equal(
    buildLoginRedirectTo('https://job.axelproject.fr', '?next=/app/profil', ''),
    'https://job.axelproject.fr/login?next=%2Fapp%2Fprofil',
  );
  assert.equal(
    buildLoginRedirectTo('https://job.axelproject.fr', '?next=https://evil.example/', ''),
    'https://job.axelproject.fr/login',
  );
});

test('hydrate URL plan=pro + wantsProCheckout sans query (OAuth perdu)', () => {
  persistFromCtaClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    linkUrl: '/login?plan=pro',
  });
  assert.equal(wantsProCheckout(''), true);
  assert.equal(hydratePlanIntentFromSearch('?plan=pro'), 'pro');
  consumePlanIntentIfPro();
  assert.equal(readPlanIntent(), '');
  assert.equal(wantsProCheckout(''), false);
  assert.equal(wantsProCheckout('?plan=pro'), true);
});

test('isLikelyNewAuthUser : fenêtre created_at / last_sign_in', () => {
  const now = Date.parse('2026-08-25T12:00:00.000Z');
  assert.equal(
    isLikelyNewAuthUser(
      { created_at: '2026-08-25T12:00:00.000Z', last_sign_in_at: '2026-08-25T12:00:02.000Z' },
      now,
    ),
    true,
  );
  assert.equal(
    isLikelyNewAuthUser(
      { created_at: '2026-08-25T11:58:00.000Z', last_sign_in_at: '2026-08-25T12:00:00.000Z' },
      now,
    ),
    true,
  );
  assert.equal(
    isLikelyNewAuthUser(
      { created_at: '2026-01-01T00:00:00.000Z', last_sign_in_at: '2026-08-25T12:00:00.000Z' },
      now,
    ),
    false,
  );
  assert.equal(isLikelyNewAuthUser(null, now), false);
});

test('authMethodFromUser google / linkedin / email', () => {
  assert.equal(authMethodFromUser({ app_metadata: { provider: 'google' } }), 'google');
  assert.equal(authMethodFromUser({ identities: [{ provider: 'linkedin_oidc' }] }), 'linkedin');
  assert.equal(authMethodFromUser({ app_metadata: { provider: 'email' } }), 'email');
});

test('payloads sign_up* : method + attribution, jamais d’email', () => {
  persistFromCtaClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    linkUrl: '/login?plan=pro',
  });
  sessionStorage.setItem(SOURCE_CTA_KEY, 'home-pricing-cta-pro');
  assert.deepEqual(signUpStartParams('form'), {
    method: 'form',
    source_cta_id: 'home-pricing-cta-pro',
  });
  assert.deepEqual(signUpParams('email'), {
    method: 'email',
    plan_intent: 'pro',
    source_cta_id: 'home-pricing-cta-pro',
  });
  const dirty = compactParams({ method: 'email', note: 'hello user@example.com' });
  assert.equal(JSON.stringify(dirty).includes('@'), false);
  assert.equal(dirty.note, 'hello');
});

test('emit sign_up derrière consentement, une seule fois', () => {
  persistFromCtaClick({
    dataAttr: 'home-hero-cta-signup',
    dataTrack: 'cta',
    linkUrl: '/login',
  });
  assert.equal(emitSignUpOnce('email'), false);
  assert.equal(sessionStorage.getItem(SIGN_UP_SENT_KEY), null);
  grantConsent();
  assert.equal(emitSignUpOnce('email'), true);
  const events = window.dataLayer.filter((e) => e && e.event === 'sign_up');
  assert.equal(events.length, 1);
  assert.equal(events[0].method, 'email');
  assert.equal(events[0].plan_intent, 'free');
  assert.equal(events[0].source_cta_id, 'home-hero-cta-signup');
  assert.equal(JSON.stringify(events[0]).includes('@'), false);
  assert.equal(emitSignUpOnce('email'), false);
});

test('emit sign_up_start une fois après consentement', () => {
  grantConsent();
  persistFromCtaClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    linkUrl: '/login?plan=pro',
  });
  assert.equal(emitSignUpStartOnce('form'), true);
  assert.equal(emitSignUpStartOnce('form'), false);
  const start = window.dataLayer.find((e) => e && e.event === 'sign_up_start');
  assert.equal(start.method, 'form');
  assert.equal(start.source_cta_id, 'home-pricing-cta-pro');
  assert.equal('plan_intent' in start, false);
  assert.equal(sessionStorage.getItem(SIGN_UP_START_SENT_KEY), '1');
  assert.equal(sessionStorage.getItem(PLAN_INTENT_KEY), 'pro');
});

test('AuthForm : OAuth redirectTo + sign_up seulement après vrai signup', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const src = await readFile(path.join(root, 'src/components/AuthForm.jsx'), 'utf8');
  assert.ok(src.includes('currentLoginRedirectTo'));
  assert.ok(src.includes("emitSignUpOnce('email')"));
  assert.ok(src.includes('emitSignUpStartOnce'));
  const alreadyIdx = src.indexOf('alreadyRegistered');
  const emitIdx = src.indexOf("emitSignUpOnce('email')");
  const returnIdx = src.indexOf('setShowAlreadyHadAccountPopup');
  assert.ok(alreadyIdx > 0 && emitIdx > alreadyIdx);
  assert.ok(returnIdx > 0 && returnIdx < emitIdx);
});
