/**
 * Nom de fichier suggéré pour l'export PDF du CV adapté (dialogue d'enregistrement).
 * Modèle par défaut : « CV - Prénom Nom - Intitulé du poste »
 */

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export const DEFAULT_PDF_EXPORT_FILENAME_PATTERN = 'CV - {prenom} {nom} - {poste}';

function sanitizeSegment(s) {
  if (s == null) return '';
  return String(s)
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string|undefined} pattern - Chaîne locale avec {prenom} {nom} {poste} {entreprise}
 * @param {{ prenom?: string, nom?: string, poste?: string, entreprise?: string }} data
 * @returns {string} - Nom de fichier se terminant par .pdf
 */
export function buildAdaptedPdfFilename(pattern, data) {
  const prenom = sanitizeSegment(data?.prenom);
  const nom = sanitizeSegment(data?.nom);
  const poste = sanitizeSegment(data?.poste);
  const entreprise = sanitizeSegment(data?.entreprise);

  const raw = (pattern && String(pattern).trim()) || DEFAULT_PDF_EXPORT_FILENAME_PATTERN;
  let out = raw
    .replace(/\{prenom\}/gi, prenom)
    .replace(/\{nom\}/gi, nom)
    .replace(/\{poste\}/gi, poste)
    .replace(/\{entreprise\}/gi, entreprise);
  out = out.replace(INVALID_FILENAME_CHARS, '').replace(/\s+/g, ' ').trim() || 'CV';
  if (!/\.pdf$/i.test(out)) {
    out = `${out}.pdf`;
  }
  return out;
}
