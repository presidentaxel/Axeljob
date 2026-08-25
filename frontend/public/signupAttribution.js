/**
 * AXE-362 — attribution signup (source_cta_id / plan_intent) + events GA4.
 * sessionStorage survit à l’OAuth ; redirectTo doit aussi garder ?plan=pro + UTM.
 * Aucun email dans les payloads. Rien avant consentement analytics.
 */

export const CONSENT_STORAGE_KEY = 'axel_job_consent_v1';
export const SOURCE_CTA_KEY = 'source_cta_id';
export const PLAN_INTENT_KEY = 'plan_intent';
export const SIGN_UP_START_SENT_KEY = 'cv_bot_signup_start_sent';
export const SIGN_UP_SENT_KEY = 'cv_bot_signup_done';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const UTM_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'partner_code',
  'bde_code',
  'bde',
  'partner',
  'ref',
];

/** CTA déjà sur /login : ne pas écraser l’attribution landing. */
const LOGIN_PAGE_ATTR_RE = /^(login-cta-|login-link-|login-input-)/;

export const PLAN_INTENT_BY_CTA = {
  'home-pricing-cta-pro': 'pro',
  'home-pricing-cta-free': 'free',
};

export function hasAnalyticsConsent(raw) {
  if (!raw) return false;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!(o && o.v === 1 && o.analytics);
  } catch {
    return false;
  }
}

export function pathFromLinkUrl(linkUrl) {
  const raw = (linkUrl || '').trim();
  if (!raw || /^mailto:/i.test(raw) || /^\s*javascript:/i.test(raw)) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).pathname || '';
    }
    const u = new URL(raw, 'https://job.axelproject.fr');
    return u.pathname || '';
  } catch {
    return raw.split('?')[0] || '';
  }
}

export function isLoginLinkUrl(linkUrl) {
  return pathFromLinkUrl(linkUrl) === '/login';
}

export function planIntentFromCta(dataAttr, linkUrl) {
  if (dataAttr && PLAN_INTENT_BY_CTA[dataAttr]) return PLAN_INTENT_BY_CTA[dataAttr];
  const raw = (linkUrl || '').trim();
  try {
    const u = new URL(raw || '/login', 'https://job.axelproject.fr');
    if (u.searchParams.get('plan') === 'pro') return 'pro';
  } catch {
    if (/[?&]plan=pro(?:&|$)/.test(raw)) return 'pro';
  }
  return 'free';
}

export function shouldPersistSourceCta(dataAttr, dataTrack, linkUrl) {
  if (dataTrack !== 'cta' || !dataAttr) return false;
  if (LOGIN_PAGE_ATTR_RE.test(dataAttr)) return false;
  return isLoginLinkUrl(linkUrl);
}

function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value == null || value === '') sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function readSourceCtaId() {
  const v = (storageGet(SOURCE_CTA_KEY) || '').trim();
  return v || '';
}

export function readPlanIntent() {
  const v = (storageGet(PLAN_INTENT_KEY) || '').trim();
  return v === 'pro' ? 'pro' : v === 'free' ? 'free' : '';
}

export function persistFromCtaClick({ dataAttr, dataTrack, linkUrl }) {
  if (!shouldPersistSourceCta(dataAttr, dataTrack, linkUrl)) return false;
  storageSet(SOURCE_CTA_KEY, dataAttr);
  storageSet(PLAN_INTENT_KEY, planIntentFromCta(dataAttr, linkUrl));
  return true;
}

/** Boutons React sans href : même persist que le tracker (landing SPA). */
export function persistLoginCta(dataAttr) {
  if (!dataAttr) return false;
  const linkUrl = planIntentFromCta(dataAttr, '') === 'pro' ? '/login?plan=pro' : '/login';
  return persistFromCtaClick({ dataAttr, dataTrack: 'cta', linkUrl });
}

/** URL ?plan=pro complète un plan_intent manquant (lien partagé / OAuth). */
export function hydratePlanIntentFromSearch(search) {
  const params = new URLSearchParams(search || '');
  if (params.get('plan') !== 'pro') return readPlanIntent();
  if (readPlanIntent() !== 'pro') storageSet(PLAN_INTENT_KEY, 'pro');
  return 'pro';
}

export function consumePlanIntentIfPro() {
  if (readPlanIntent() !== 'pro') return false;
  storageSet(PLAN_INTENT_KEY, '');
  return true;
}

export function wantsProCheckout(search) {
  const params = new URLSearchParams(search || '');
  if (params.get('plan') === 'pro') return true;
  return readPlanIntent() === 'pro';
}

/**
 * redirectTo OAuth / reset : origin + /login + plan + UTM déjà présents.
 * @param {string} origin
 * @param {string} [search]
 * @param {string} [planIntent]
 */
export function buildLoginRedirectTo(origin, search, planIntent) {
  const base = (origin || '').replace(/\/$/, '');
  const fromUrl = new URLSearchParams(search || '');
  const params = new URLSearchParams();
  const plan = fromUrl.get('plan') || planIntent || '';
  if (plan === 'pro') params.set('plan', 'pro');
  for (const k of UTM_QUERY_KEYS) {
    const v = (fromUrl.get(k) || '').trim();
    if (v) params.set(k, v);
  }
  const nextPath = fromUrl.get('next');
  if (nextPath && nextPath.startsWith('/app/') && !nextPath.includes('//')) {
    params.set('next', nextPath);
  }
  const qs = params.toString();
  return `${base}/login${qs ? `?${qs}` : ''}`;
}

export function currentLoginRedirectTo() {
  if (typeof window === 'undefined') return undefined;
  hydratePlanIntentFromSearch(window.location.search);
  return buildLoginRedirectTo(
    window.location.origin,
    window.location.search,
    readPlanIntent(),
  );
}

export function compactParams(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'string') {
      const cleaned = v.replace(EMAIL_RE, '').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      out[k] = cleaned;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function signUpStartParams(method) {
  return compactParams({
    method: method || 'form',
    source_cta_id: readSourceCtaId(),
  });
}

export function signUpParams(method) {
  const plan = readPlanIntent() || 'free';
  return compactParams({
    method: method || 'email',
    plan_intent: plan === 'pro' ? 'pro' : 'free',
    source_cta_id: readSourceCtaId(),
  });
}

export function emitMarketingEvent(name, params) {
  if (typeof window === 'undefined') return false;
  let raw;
  try {
    raw = localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!hasAnalyticsConsent(raw)) return false;
  const payload = compactParams({ event: name, ...(params || {}) });
  const gtagParams = compactParams(params || {});
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, gtagParams);
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  return true;
}

export function emitSignUpStartOnce(method) {
  if (storageGet(SIGN_UP_START_SENT_KEY) === '1') return false;
  const ok = emitMarketingEvent('sign_up_start', signUpStartParams(method));
  if (ok) storageSet(SIGN_UP_START_SENT_KEY, '1');
  return ok;
}

export function emitSignUpOnce(method) {
  if (storageGet(SIGN_UP_SENT_KEY) === '1') return false;
  const ok = emitMarketingEvent('sign_up', signUpParams(method));
  if (ok) storageSet(SIGN_UP_SENT_KEY, '1');
  return ok;
}

export function wasSignUpEmitted() {
  return storageGet(SIGN_UP_SENT_KEY) === '1';
}

const NEW_USER_WINDOW_MS = 5 * 60_000;

export function isLikelyNewAuthUser(user, nowMs = Date.now()) {
  if (!user || !user.created_at) return false;
  const created = Date.parse(user.created_at);
  if (Number.isNaN(created)) return false;
  const lastRaw = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : nowMs;
  const last = Number.isNaN(lastRaw) ? nowMs : lastRaw;
  return Math.abs(last - created) < NEW_USER_WINDOW_MS;
}

export function authMethodFromUser(user) {
  const p = String(user?.app_metadata?.provider || user?.identities?.[0]?.provider || '').toLowerCase();
  if (p === 'google') return 'google';
  if (p === 'linkedin' || p === 'linkedin_oidc') return 'linkedin';
  if (p === 'email') return 'email';
  return p || 'email';
}

export function maybeEmitSignUpForSession(user) {
  if (!isLikelyNewAuthUser(user)) return false;
  return emitSignUpOnce(authMethodFromUser(user));
}
