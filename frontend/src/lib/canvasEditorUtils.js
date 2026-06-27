/**
 * Helpers purs (sans React/DOM) extraits de `CvEditorBetaView` pour alléger
 * le composant et permettre des tests unitaires isolés.
 */

import { isCanvasInlineEditableType } from './canvasInlineEdit.js';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export const CANVAS_EDIT_HINT_DISMISSED_KEY = 'cv_beta_canvas_edit_hint_dismissed';

/** Bloc pour lequel on affiche l’astuce « double-clic pour éditer ». */
export function blockSupportsEditHint(block) {
  if (!block || typeof block !== 'object') return false;
  const { type } = block;
  if (type === 'image' || type === 'photo') return true;
  return isCanvasInlineEditableType(type);
}

export function isCanvasEditHintDismissed() {
  try {
    return localStorage.getItem(CANVAS_EDIT_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissCanvasEditHint() {
  try {
    localStorage.setItem(CANVAS_EDIT_HINT_DISMISSED_KEY, '1');
  } catch {
    /* ignore quota / mode privé */
  }
}

/** Message contextuel de l’astuce première sélection. */
export function editHintMessageForBlock(block) {
  if (!block) {
    return 'Double-cliquez sur un bloc pour l’éditer.';
  }
  if (block.type === 'image' || block.type === 'photo') {
    return 'Double-cliquez pour ajuster la photo ou l’image (cadrage, zoom, forme).';
  }
  return 'Double-cliquez sur le bloc sélectionné pour modifier le texte directement sur le canvas.';
}

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
