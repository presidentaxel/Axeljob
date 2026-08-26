/**
 * AXE-397 — event produit `login` (event_log), distinct de GA4 `sign_up`.
 * 1× par onglet et par user (sessionStorage). Pas de PII.
 */
import { authMethodFromUser } from '../../public/signupAttribution.js';

export const PRODUCT_LOGIN_SENT_PREFIX = 'cv_bot_product_login_sent_';

export function productLoginStorageKey(userId) {
  return `${PRODUCT_LOGIN_SENT_PREFIX}${userId}`;
}

export function maybeEmitProductLogin(user, emit, storage) {
  const userId = user?.id;
  if (!userId || typeof emit !== 'function') return false;
  let store = storage;
  if (store === undefined) {
    try {
      store = sessionStorage;
    } catch {
      store = null;
    }
  }
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
