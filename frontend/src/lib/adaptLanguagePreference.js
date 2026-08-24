/**
 * Préférence de langue d’adaptation (AXE-357) : ne pas redemander à chaque candidature.
 */

export const ADAPT_LANGUAGE_PREF_PREFIX = 'cv_bot_adapt_language_policy_';

export function adaptLanguagePrefKey(userId) {
  const uid = String(userId || '').trim();
  return `${ADAPT_LANGUAGE_PREF_PREFIX}${uid || 'anon'}`;
}

export function normalizeAdaptLanguagePolicy(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'offer') return 'offer';
  if (raw === 'cv') return 'cv';
  return null;
}

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function getAdaptLanguagePreference(userId) {
  const store = storage();
  if (!store) return null;
  try {
    return normalizeAdaptLanguagePolicy(store.getItem(adaptLanguagePrefKey(userId)));
  } catch {
    return null;
  }
}

export function setAdaptLanguagePreference(userId, policy) {
  const store = storage();
  const normalized = normalizeAdaptLanguagePolicy(policy);
  const key = adaptLanguagePrefKey(userId);
  if (!store) return normalized;
  try {
    if (!normalized) {
      store.removeItem(key);
      return null;
    }
    store.setItem(key, normalized);
    return normalized;
  } catch {
    return normalized;
  }
}

export function clearAdaptLanguagePreference(userId) {
  return setAdaptLanguagePreference(userId, null);
}

/**
 * @returns {{ outputLanguage: 'cv' | 'offer' | null, remembered: boolean, prompt: boolean }}
 */
export function resolveAdaptLanguageAutoChoice(mismatch, userId) {
  if (!mismatch) {
    return { outputLanguage: 'cv', remembered: false, prompt: false };
  }
  const stored = getAdaptLanguagePreference(userId);
  if (stored) {
    return { outputLanguage: stored, remembered: true, prompt: false };
  }
  return { outputLanguage: null, remembered: false, prompt: true };
}
