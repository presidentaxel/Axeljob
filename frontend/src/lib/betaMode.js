/**
 * Gestion du mode Beta de l'application (Stable vs Beta).
 *
 * Le mode Beta est l'opt-in qui expose la nouvelle expérience d'édition
 * (L1 → L3, score ATS, etc.) telle que décrite dans `docs/editor-vision.md`.
 * Tant qu'il n'est pas activé, l'utilisateur reste sur la version Stable
 * (formulaire de profil actuel, ProfileView.jsx, etc.).
 *
 * Ce module est volontairement **pur** (pas de dépendance React, pas
 * d'import direct du DOM) pour rester testable via `node --test`.
 * Toutes les fonctions acceptent un `storage` optionnel à des fins de
 * test ; sinon elles utilisent `globalThis.localStorage` quand il existe.
 *
 * Les changements d'état émettent un CustomEvent `BETA_MODE_EVENT` sur
 * `globalThis` pour que les composants React puissent réagir sans avoir
 * à se re-render via prop drilling.
 */

export const BETA_MODE_STORAGE_KEY = 'cv_bot_beta_mode_v1';
export const BETA_MODE_EVENT = 'cv-bot:beta-mode-changed';

/** Retourne le storage à utiliser (injecté ou globalThis.localStorage). */
function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * Lit le mode Beta depuis le storage.
 *
 * @param {Storage | null} [storage] Storage injecté (tests). Défaut : globalThis.localStorage.
 * @returns {boolean} true si le mode Beta est explicitement activé.
 */
export function isBetaModeEnabled(storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    return s.getItem(BETA_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persiste l'état du mode Beta et notifie les listeners.
 *
 * Retourne false si le storage n'est pas disponible (SSR, mode privé
 * bloqué). Dans ce cas, l'appelant doit afficher un message d'erreur
 * cohérent : on ne veut pas mentir sur la persistance.
 *
 * @param {boolean} enabled Nouvelle valeur.
 * @param {Storage | null} [storage] Storage injecté (tests).
 * @returns {boolean} true si la persistance a réussi.
 */
export function setBetaModeEnabled(enabled, storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(BETA_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    return false;
  }
  dispatchBetaModeChange(Boolean(enabled));
  return true;
}

/**
 * Notifie les listeners d'un changement de mode Beta.
 *
 * Séparé pour permettre aux tests d'injecter une autre source d'événements.
 * En production, dispatche un CustomEvent sur `globalThis`.
 */
export function dispatchBetaModeChange(enabled) {
  if (
    typeof globalThis === 'undefined' ||
    typeof globalThis.dispatchEvent !== 'function' ||
    typeof globalThis.CustomEvent !== 'function'
  ) {
    return false;
  }
  try {
    globalThis.dispatchEvent(
      new globalThis.CustomEvent(BETA_MODE_EVENT, { detail: { enabled: !!enabled } }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Abonne un handler aux changements de mode Beta.
 *
 * Retourne une fonction de désinscription (idempotente). Si l'environnement
 * n'a pas d'event target (Node sans DOM), retourne un no-op pour rester
 * silencieusement compatible côté test/server.
 *
 * @param {(enabled: boolean) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeBetaMode(handler) {
  if (
    typeof globalThis === 'undefined' ||
    typeof globalThis.addEventListener !== 'function'
  ) {
    return () => {};
  }
  const wrapped = (event) => {
    try {
      handler(Boolean(event && event.detail && event.detail.enabled));
    } catch {
      // Un handler qui throw ne doit pas casser les autres listeners.
    }
  };
  globalThis.addEventListener(BETA_MODE_EVENT, wrapped);
  return () => {
    try {
      globalThis.removeEventListener(BETA_MODE_EVENT, wrapped);
    } catch {
      // ignore
    }
  };
}
