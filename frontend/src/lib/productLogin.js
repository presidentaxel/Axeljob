/**
 * AXE-397 — event produit `login` (event_log), distinct de GA4 `sign_up`.
 * 1× par session auth (pas à chaque F5). Un logout (`SIGNED_OUT`) réarme.
 * Pas de PII.
 */
import { authMethodFromUser } from '../../public/signupAttribution.js';

export const PRODUCT_LOGIN_SENT_PREFIX = 'cv_bot_product_login_sent_';

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function productLoginStorageKey(userId) {
  return `${PRODUCT_LOGIN_SENT_PREFIX}${userId}`;
}

export function clearProductLoginSent(storage, userId) {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    if (userId) {
      store.removeItem(productLoginStorageKey(userId));
      return;
    }
    const toDrop = [];
    if (typeof store.key === 'function' && typeof store.length === 'number') {
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k && k.startsWith(PRODUCT_LOGIN_SENT_PREFIX)) toDrop.push(k);
      }
    } else if (store._map) {
      for (const k of Object.keys(store._map)) {
        if (k.startsWith(PRODUCT_LOGIN_SENT_PREFIX)) toDrop.push(k);
      }
    }
    for (const k of toDrop) store.removeItem(k);
  } catch {
    /* private mode */
  }
}

export function maybeEmitProductLogin(user, emit, storage) {
  const userId = user?.id;
  if (!userId || typeof emit !== 'function') return false;
  const store = resolveStorage(storage);
  const key = productLoginStorageKey(userId);
  try {
    if (store && store.getItem(key) === '1') return false;
  } catch {
    /* private mode */
  }
  emit('login', { method: authMethodFromUser(user) });
  try {
    if (store) store.setItem(key, '1');
  } catch {
    /* private mode */
  }
  return true;
}
