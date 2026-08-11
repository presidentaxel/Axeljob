/**
 * Nettoyage de l ancienne classe plein ecran Beta sur `<body>`.
 *
 * Le plein ecran est desormais scope en CSS via
 * `.view-profil.app-page:has(.cv-editor-beta)` (cf. CvEditorBeta.css).
 * Cette fonction retire la classe legacy si elle est encore presente
 * (session precedente, ancienne build).
 */

/** @deprecated Utiliser `:has(.cv-editor-beta)` dans CvEditorBeta.css */
export const BETA_EDITOR_FULLSCREEN_BODY_CLASS = 'cv-editor-beta-fullscreen';

/** @param {Document | null | undefined} [doc] */
export function purgeLegacyBetaFullscreenBodyClass(doc) {
  const d = doc ?? (typeof document !== 'undefined' ? document : null);
  const body = d?.body;
  if (!body) return;
  body.classList.remove(BETA_EDITOR_FULLSCREEN_BODY_CLASS);
}
