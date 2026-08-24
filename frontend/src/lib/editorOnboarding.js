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
 * Surfaces first-run de l’éditeur Beta (AXE-345).
 * Une seule à la fois, priorité décroissante.
 */
export const EDITOR_FIRST_RUN_SURFACES = Object.freeze({
  NONE: 'none',
  IMPORT: 'import',
  STARTUP: 'startup',
  DESIGN_BRIDGE: 'designBridge',
  ONBOARDING: 'onboarding',
});

/**
 * Quelle overlay first-run afficher. Logique pure, testable.
 *
 * Priorité : import (opt-in) > « Comment veux-tu commencer ? » >
 * pont design (opt-in) > tour onboarding (jamais sur canvas vide).
 *
 * @param {{
 *   dismissed?: boolean,
 *   loading?: boolean,
 *   startupPromptOpen?: boolean,
 *   importOpen?: boolean,
 *   designBridgeOpen?: boolean,
 *   canvasEmpty?: boolean,
 * }} state
 * @returns {typeof EDITOR_FIRST_RUN_SURFACES[keyof typeof EDITOR_FIRST_RUN_SURFACES]}
 */
export function resolveEditorFirstRunSurface(state = {}) {
  if (state.loading) return EDITOR_FIRST_RUN_SURFACES.NONE;
  if (state.importOpen) return EDITOR_FIRST_RUN_SURFACES.IMPORT;
  if (state.startupPromptOpen) return EDITOR_FIRST_RUN_SURFACES.STARTUP;
  if (state.designBridgeOpen) return EDITOR_FIRST_RUN_SURFACES.DESIGN_BRIDGE;
  // Canvas vide : les CTAs in-page suffisent ; pas de 2e modal (tour).
  if (state.canvasEmpty) return EDITOR_FIRST_RUN_SURFACES.NONE;
  if (state.dismissed) return EDITOR_FIRST_RUN_SURFACES.NONE;
  return EDITOR_FIRST_RUN_SURFACES.ONBOARDING;
}

/**
 * Décide si le tour doit s'afficher (logique pure, testable).
 * @param {{
 *   dismissed?: boolean,
 *   loading?: boolean,
 *   startupPromptOpen?: boolean,
 *   importOpen?: boolean,
 *   designBridgeOpen?: boolean,
 *   canvasEmpty?: boolean,
 * }} state
 * @returns {boolean}
 */
export function shouldShowEditorOnboarding(state = {}) {
  return resolveEditorFirstRunSurface(state) === EDITOR_FIRST_RUN_SURFACES.ONBOARDING;
}

/**
 * Verrouiller le scroll du canvas pendant une overlay interne (absolute).
 * L’import est `position: fixed` sur le viewport — pas besoin de lock.
 * @param {string} surface
 * @returns {boolean}
 */
export function shouldLockCanvasScrollForFirstRun(surface) {
  return (
    surface === EDITOR_FIRST_RUN_SURFACES.STARTUP
    || surface === EDITOR_FIRST_RUN_SURFACES.DESIGN_BRIDGE
    || surface === EDITOR_FIRST_RUN_SURFACES.ONBOARDING
  );
}
