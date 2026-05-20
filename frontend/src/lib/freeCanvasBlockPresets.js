/**
 * Presets d insertion de blocs pour le canvas libre (P3.5).
 *
 * Chaque type non semantique (ou section CV re-inserable) a une taille
 * par defaut en mm et un contenu / bind initial. Le placement sur la page
 * est calcule a part (`suggestNewBlockPlacement`).
 */

import {
  BLOCK_MIN_HEIGHT_MM,
  BLOCK_MIN_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  PAGE_WIDTH_MM,
  listAllBlocks,
} from './cvLayoutModelV3.js';

/** Entrees de la barre d outils Insertion (ordre UI). */
export const INSERT_TOOLBAR_ITEMS = Object.freeze([
  { type: 'text', label: 'Texte', description: 'Paragraphe libre' },
  { type: 'title', label: 'Titre', description: 'Titre de section' },
  { type: 'shape:line', label: 'Trait', description: 'Ligne horizontale' },
  { type: 'shape:rect', label: 'Bandeau', description: 'Rectangle de fond' },
  { type: 'icon', label: 'Icône', description: 'Pictogramme décoratif' },
]);

const PRESETS_BY_TYPE = Object.freeze({
  text: {
    type: 'text',
    content: 'Texte libre',
    w: 120,
    h: 12,
    style: { font_size: 9, align: 'left' },
  },
  title: {
    type: 'title',
    content: 'Titre',
    w: PAGE_USABLE_WIDTH_MM,
    h: 10,
    style: { align: 'left' },
  },
  'shape:line': {
    type: 'shape:line',
    w: PAGE_USABLE_WIDTH_MM,
    h: 0.6,
    style: { color: '#1e293b' },
  },
  'shape:rect': {
    type: 'shape:rect',
    w: PAGE_USABLE_WIDTH_MM,
    h: 8,
    style: { color: '#e2e8f0' },
  },
  icon: {
    type: 'icon',
    icon_name: 'HiPhone',
    w: 12,
    h: 12,
    style: {},
  },
});

/**
 * Fabrique un bloc partiel pret pour `addBlockToPage` (sans x/y/z).
 * Retourne null si type inconnu.
 */
export function createInsertBlockPreset(type) {
  const preset = PRESETS_BY_TYPE[type];
  if (!preset) return null;
  return { ...preset };
}

/**
 * Propose x, y, w, h, z pour un nouveau bloc sur `pageIndex`.
 * Empile sous le bloc le plus bas de la page, avec un gap de 6 mm.
 */
export function suggestNewBlockPlacement(layout, pageIndex, partialBlock) {
  const w = partialBlock?.w ?? 80;
  const h = partialBlock?.h ?? BLOCK_MIN_HEIGHT_MM;
  const pages = layout?.pages || [];
  const idx = typeof pageIndex === 'number' && pageIndex >= 0 && pageIndex < pages.length
    ? pageIndex
    : 0;
  const blocks = pages[idx]?.blocks || [];

  let y = PAGE_MARGIN_MM;
  if (blocks.length > 0) {
    const maxBottom = blocks.reduce((m, b) => Math.max(m, (b.y || 0) + (b.h || 0)), 0);
    y = maxBottom + 6;
  }

  const maxY = PAGE_HEIGHT_MM - PAGE_MARGIN_MM - h;
  y = Math.min(Math.max(PAGE_MARGIN_MM, y), Math.max(PAGE_MARGIN_MM, maxY));

  const x = PAGE_MARGIN_MM;
  const maxW = PAGE_WIDTH_MM - PAGE_MARGIN_MM - x;
  const clampedW = Math.min(Math.max(w, BLOCK_MIN_WIDTH_MM), maxW);

  const all = listAllBlocks(layout);
  const maxZ = all.reduce((m, b) => Math.max(m, b.z || 0), 0);

  return {
    x,
    y,
    w: clampedW,
    h: Math.max(h, BLOCK_MIN_HEIGHT_MM),
    z: maxZ + 1,
  };
}

/**
 * Id du bloc ajoute en queue sur une page (apres addBlockToPage).
 */
export function getLastBlockIdOnPage(layout, pageIndex = 0) {
  const page = layout?.pages?.[pageIndex];
  const blocks = page?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return blocks[blocks.length - 1]?.id || null;
}
