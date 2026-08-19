/**
 * Persistance de l'onboarding éditeur Beta (AXE-32).
 *
 * Pur (pas de React) pour rester testable via `node --test`.
 * Même pattern que `betaMode.js` : storage injectable.
 */

export const EDITOR_ONBOARDING_DISMISSED_KEY = 'cv_bot_editor_onboarding_dismissed_v1';

/** Étapes affichées dans le tour (ordre stable). */
export const EDITOR_ONBOARDING_STEPS = Object.freeze([
  {
    id: 'sections',
    title: 'Ajoute ton contenu',
    body: 'Dans « Sections CV », place identité, expériences, formations… Ces blocs sont liés à ton profil.',
  },
  {
    id: 'design',
    title: 'Choisis look et modèle',
    body: 'Dans « Design », pars d’un modèle ATS-safe ou ajoute des décorations (formes, texte, icônes).',
  },
  {
    id: 'place',
    title: 'Place sur le canvas',
    body: 'Clique un élément puis la page pour le poser. Échap annule. L’onglet Importer ajoute des images, pas un fichier CV.',
  },
]);

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * @param {Storage | null} [storage]
 * @returns {boolean}
 */
export function isEditorOnboardingDismissed(storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    return s.getItem(EDITOR_ONBOARDING_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Marque l'onboarding comme terminé (complété ou skip).
 * @param {Storage | null} [storage]
 * @returns {boolean} true si persisté
 */
export function dismissEditorOnboarding(storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(EDITOR_ONBOARDING_DISMISSED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Décide si le tour doit s'afficher (logique pure, testable).
 * @param {{ dismissed?: boolean, loading?: boolean, startupPromptOpen?: boolean }} state
 * @returns {boolean}
 */
export function shouldShowEditorOnboarding(state = {}) {
  if (state.dismissed) return false;
  if (state.loading) return false;
  // Le démarrage guidé AXE-28 a priorité quand le layout serveur est absent.
  if (state.startupPromptOpen) return false;
  return true;
}
