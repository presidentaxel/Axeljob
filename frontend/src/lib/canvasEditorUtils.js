/**
 * Helpers purs (sans React/DOM) extraits de `CvEditorBetaView` pour alléger
 * le composant et permettre des tests unitaires isolés.
 */

import { isCanvasInlineEditableType } from './canvasInlineEdit.js';
import { PAGE_MARGIN_MM, PAGE_WIDTH_MM } from './cvLayoutModelV3.js';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export const CANVAS_EDIT_HINT_DISMISSED_KEY = 'cv_beta_canvas_edit_hint_dismissed';
export const SEMANTIC_EDIT_NOTE_DISMISSED_KEY = 'cv_beta_semantic_edit_note_dismissed';

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

export function isSemanticEditNoteDismissed() {
  try {
    return localStorage.getItem(SEMANTIC_EDIT_NOTE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissSemanticEditNote() {
  try {
    localStorage.setItem(SEMANTIC_EDIT_NOTE_DISMISSED_KEY, '1');
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

/**
 * Message d’échec export PDF (AXE-29) — visible via role="alert", pas seulement console.
 * @param {unknown} err
 * @param {string} [hint]
 */
export function formatPdfExportError(err, hint = '') {
  const base =
    err && typeof err === 'object' && typeof err.message === 'string' && err.message
      ? err.message
      : 'Impossible de telecharger le PDF.';
  return `${base}${hint || ''}`;
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

/**
 * Alignement horizontal d'un bloc sur la page A4 (AXE-34).
 * @param {object|null|undefined} block
 * @param {'left'|'center'|'right'} align
 * @returns {{ x: number } | null}
 */
export function computeBlockHorizontalAlign(block, align) {
  if (!block || typeof block !== 'object') return null;
  const w = Number(block.w);
  const width = Number.isFinite(w) && w > 0 ? w : 0;
  if (align === 'left') {
    return { x: PAGE_MARGIN_MM };
  }
  if (align === 'center') {
    return { x: Math.max(0, (PAGE_WIDTH_MM - width) / 2) };
  }
  if (align === 'right') {
    return { x: Math.max(0, PAGE_WIDTH_MM - PAGE_MARGIN_MM - width) };
  }
  return null;
}

/**
 * Répartition horizontale égale entre le bloc le plus à gauche et le plus à droite.
 * Nécessite au moins 3 blocs. Retourne des patches `{ id, x }` (les extrémités inchangées).
 * @param {Array<object|null|undefined>} blocks
 * @returns {Array<{ id: string, x: number }>}
 */
export function computeHorizontalDistribute(blocks) {
  const list = (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && typeof b === 'object' && typeof b.id === 'string' && !b.locked)
    .map((b) => ({
      id: b.id,
      x: Number(b.x) || 0,
      w: Number.isFinite(Number(b.w)) && Number(b.w) > 0 ? Number(b.w) : 0,
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));

  if (list.length < 3) return [];

  const first = list[0];
  const last = list[list.length - 1];
  const spanStart = first.x;
  const spanEnd = last.x + last.w;
  const totalW = list.reduce((sum, b) => sum + b.w, 0);
  const gap = (spanEnd - spanStart - totalW) / (list.length - 1);
  if (!Number.isFinite(gap)) return [];

  const patches = [];
  let cursor = spanStart;
  list.forEach((b, index) => {
    if (index === 0) {
      cursor = b.x + b.w + gap;
      return;
    }
    if (index === list.length - 1) return;
    const nextX = cursor;
    if (Math.abs(nextX - b.x) > 0.01) {
      patches.push({ id: b.id, x: Math.max(0, nextX) });
    }
    cursor = nextX + b.w + gap;
  });
  return patches;
}

/**
 * Patch style.layer_label pour renommer un calque décoratif.
 * @param {object|null|undefined} block
 * @param {string} name
 * @returns {{ style: object } | null}
 */
export function computeLayerLabelPatch(block, name) {
  if (!block || typeof block !== 'object') return null;
  const label = String(name || '').trim().slice(0, 60);
  const style = { ...(block.style && typeof block.style === 'object' ? block.style : {}) };
  if (!label) {
    delete style.layer_label;
  } else {
    style.layer_label = label;
  }
  return { style };
}
