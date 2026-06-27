/**
 * Helpers purs (sans React/DOM) extraits de `CvEditorBetaView` pour alléger
 * le composant et permettre des tests unitaires isolés.
 */

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

/** Nettoie un fragment de nom de fichier (retire les caractères interdits). */
export function cleanFilenamePart(value) {
  return String(value || '')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Construit le nom du PDF exporté à partir de l'identité du CV. */
export function buildCanvasPdfFilename(cv) {
  const identity = [cv?.prenom, cv?.nom].map(cleanFilenamePart).filter(Boolean).join(' ');
  const title = cleanFilenamePart(cv?.titre_professionnel);
  const parts = ['CV', identity, title].filter(Boolean);
  return `${parts.join(' - ') || 'CV'}.pdf`;
}

/** Égalité structurelle tolérante de deux layouts (référence ou JSON). */
export function sameLayout(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
