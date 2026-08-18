/**
 * Formats d’export éditeur Beta (AXE-330).
 */

/** @typedef {'pdf'|'html'|'txt'|'docx'} CanvasExportFormat */

export const DOCX_FIDELITY_NOTICE_DISMISSED_KEY = 'cv_beta_docx_fidelity_notice_dismissed';

/** @type {ReadonlyArray<{ id: CanvasExportFormat, label: string, hint: string }>} */
export const CANVAS_EXPORT_FORMATS = Object.freeze([
  {
    id: 'pdf',
    label: 'PDF',
    hint: 'Mise en page fidèle — format principal',
  },
  {
    id: 'docx',
    label: 'Word',
    hint: 'Mise en page approximative (colonnes + thème) — éditable / ATS',
  },
  {
    id: 'html',
    label: 'HTML',
    hint: 'Snapshot web du canvas (même rendu que le PDF)',
  },
  {
    id: 'txt',
    label: 'TXT',
    hint: 'Contenu sémantique brut (ATS / collage) — pas le layout',
  },
]);

/**
 * @param {string} format
 * @returns {format is CanvasExportFormat}
 */
export function isCanvasExportFormat(format) {
  return CANVAS_EXPORT_FORMATS.some((item) => item.id === format);
}

/**
 * @returns {boolean}
 */
export function isDocxFidelityNoticeDismissed() {
  try {
    return localStorage.getItem(DOCX_FIDELITY_NOTICE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Mémorise le choix « ne plus afficher » pour l’avertissement Word.
 */
export function dismissDocxFidelityNotice() {
  try {
    localStorage.setItem(DOCX_FIDELITY_NOTICE_DISMISSED_KEY, '1');
  } catch {
    /* ignore quota / mode privé */
  }
}

/**
 * @param {unknown} cv
 * @param {CanvasExportFormat} format
 */
export function buildCanvasExportFilename(cv, format) {
  const identity = [cv?.prenom, cv?.nom]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  const title = String(cv?.titre_professionnel || '').trim();
  const parts = ['CV', identity, title].filter(Boolean);
  const base = parts.join(' - ') || 'CV';
  const extByFormat = {
    html: 'html',
    txt: 'txt',
    docx: 'docx',
    pdf: 'pdf',
  };
  const ext = extByFormat[format] || 'pdf';
  return `${base}.${ext}`;
}

/**
 * @param {unknown} err
 * @param {string} [hint]
 * @param {string} [format]
 */
export function formatCanvasExportError(err, hint = '', format = '') {
  const base =
    err && typeof err === 'object' && typeof err.message === 'string' && err.message
      ? err.message
      : `Impossible de télécharger${format ? ` le ${String(format).toUpperCase()}` : ''}.`;
  return `${base}${hint || ''}`;
}
