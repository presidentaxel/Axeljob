/** Scrubbing Sentry front (AXE-368) — testable sans SDK. */

export const FILTERED = '[Filtered]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'email',
  'password',
  'secret',
  'token',
  'jwt',
  'access_token',
  'refresh_token',
  'api_key',
  'cv',
  'cv_base',
  'html',
  'annonce',
  'offer',
  'offer_text',
  'job_description',
  'photo',
  'phone',
  'address',
]);

const SENSITIVE_KEY_RE = /(password|secret|token|jwt|authorization|cookie|email|annonce|offer)/i;
export const SENSITIVE_PATH_RE = /\/api\/(adapt|import|cv)/i;

export function isSensitiveUrl(url) {
  const raw = String(url || '');
  try {
    const path = new URL(raw, 'http://local.invalid').pathname;
    return SENSITIVE_PATH_RE.test(path);
  } catch {
    return SENSITIVE_PATH_RE.test(raw);
  }
}

function isSensitiveKey(key) {
  const lowered = String(key || '')
    .toLowerCase()
    .replace(/-/g, '_');
  return SENSITIVE_KEYS.has(lowered) || SENSITIVE_KEY_RE.test(lowered);
}

export function redactValue(value, key = '') {
  if (key && isSensitiveKey(key)) return FILTERED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return value;
}

export function tracesSampleRate(environment, override) {
  if (override !== undefined && override !== null && String(override).trim() !== '') {
    const n = Number(override);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return environment === 'staging' ? 1 : 0.1;
}

export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  const next = redactValue(event);
  const request = next.request;
  if (request && typeof request === 'object') {
    const url = String(request.url || next.request?.url || '');
    if (isSensitiveUrl(url)) {
      delete request.data;
      delete request.cookies;
      if (request.headers && typeof request.headers === 'object') {
        request.headers = redactValue(request.headers);
      }
    }
  }
  if (next.user && typeof next.user === 'object') {
    next.user = next.user.id ? { id: next.user.id } : {};
  }
  return next;
}

export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  const next = { ...breadcrumb };
  const data = next.data && typeof next.data === 'object' ? { ...next.data } : {};
  const url = String(next.data?.url || next.data?.to || next.message || '');
  if (isSensitiveUrl(url) || next.category === 'http' || next.category === 'fetch' || next.category === 'xhr') {
    delete data.body;
    delete data.request_body;
    delete data.json;
    if (isSensitiveUrl(url)) {
      data.body = FILTERED;
    }
  }
  if (Object.keys(data).length) next.data = redactValue(data);
  else if (next.data) next.data = data;
  return next;
}
