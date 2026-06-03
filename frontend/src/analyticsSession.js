/**
 * Session analytics navigateur + first-touch attribution (UTM / referrer).
 * Aligné avec le header X-Analytics-Session-Id envoyé par api.js.
 */

const SESSION_KEY = 'cv_bot_analytics_session_v1';
const ATTRIB_KEY = 'cv_bot_first_touch_v1';
export const ANALYTICS_SESSION_HEADER = 'X-Analytics-Session-Id';

function randomSessionSuffix() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function newSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* crypto unavailable */
  }
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return `sess_${Date.now().toString(36)}_${randomSessionSuffix()}`;
    }
  } catch {
    /* getRandomValues unavailable */
  }
  return `sess_${Date.now().toString(36)}_fallback`;
}

/** UUID navigateur : stable jusqu’à clear du site. */
export function getOrCreateAnalyticsSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (id && id.length >= 8 && id.length <= 128) return id;
    id = newSessionId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newSessionId();
  }
}

function parseUtmFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const out = {};
  for (const k of keys) {
    const v = (params.get(k) || '').trim();
    if (v) out[k.replace('utm_', '')] = v.slice(0, 200);
  }
  const gclid = (params.get('gclid') || '').trim();
  if (gclid) out.gclid = gclid.slice(0, 120);
  const fbclid = (params.get('fbclid') || '').trim();
  if (fbclid) out.fbclid = fbclid.slice(0, 120);
  // Code partenaire (BDE) supporte plusieurs aliases de lien.
  const partnerRaw = (
    params.get('partner_code')
    || params.get('bde_code')
    || params.get('bde')
    || params.get('partner')
    || params.get('ref')
    || ''
  ).trim();
  if (partnerRaw) out.partner_code = partnerRaw.slice(0, 32);
  return out;
}

function referrerHost() {
  try {
    if (typeof document === 'undefined' || !document.referrer) return null;
    const u = new URL(document.referrer);
    return (u.hostname || '').slice(0, 200) || null;
  } catch {
    return null;
  }
}

/**
 * À appeler une fois au chargement (toutes pages) : fige UTM + referrer de la première visite.
 */
export function ensureAnalyticsFirstTouch() {
  try {
    if (localStorage.getItem(ATTRIB_KEY)) return;
    if (typeof window === 'undefined') return;
    const utm = parseUtmFromSearch(window.location.search);
    const refHost = referrerHost();
    const landing_path = (window.location.pathname || '').slice(0, 300);
    if (Object.keys(utm).length === 0 && !refHost) return;
    const payload = {
      ...utm,
      ref_host: refHost,
      landing_path: landing_path || null,
      captured_at: new Date().toISOString(),
    };
    localStorage.setItem(ATTRIB_KEY, JSON.stringify(payload));
  } catch {
    /* storage full or disabled */
  }
}

/** Objet compact pour un seul envoi (ex. premier page_view de la session auth). */
export function getStoredAttribution() {
  try {
    const raw = localStorage.getItem(ATTRIB_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return typeof o === 'object' && o !== null ? o : null;
  } catch {
    return null;
  }
}
