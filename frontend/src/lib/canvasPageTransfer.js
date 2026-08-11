/**
 * Déplacement d'un bloc entre pages du layout v3.
 */

import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  addBlockToPage,
  findBlock,
  removeBlock,
  sanitizeBlock,
} from './cvLayoutModelV3.js';

/** Repositionne un bloc sur une page (éventuellement différente de l'origine). */
export function moveBlockToPage(layout, blockId, targetPageIndex, { x, y }) {
  const found = findBlock(layout, blockId);
  if (!found?.block) return layout;
  const ti = Math.max(0, Math.floor(Number(targetPageIndex) || 0));
  const cleaned = sanitizeBlock(
    {
      ...found.block,
      x: Number(x) || 0,
      y: Number(y) || 0,
    },
    { pageIndex: ti, allowPageOverflow: layout?.grid === 'free' },
  );
  if (!cleaned) return layout;

  if (ti === found.pageIndex) {
    const pages = layout.pages.map((page, i) => {
      if (i !== ti) return page;
      return {
        ...page,
        blocks: page.blocks.map((b) => (b.id === blockId ? cleaned : b)),
      };
    });
    return { ...layout, pages };
  }

  let next = removeBlock(layout, blockId);
  if (!next.pages[ti]) return layout;
  return addBlockToPage(next, ti, cleaned);
}

export function clampBlockPositionOnPage(block, x, y) {
  const w = Number(block?.w) || 10;
  const h = Number(block?.h) || 10;
  return {
    x: Math.max(0, Math.min(PAGE_WIDTH_MM - w, Number(x) || 0)),
    y: Math.max(0, Math.min(PAGE_HEIGHT_MM - h, Number(y) || 0)),
  };
}
