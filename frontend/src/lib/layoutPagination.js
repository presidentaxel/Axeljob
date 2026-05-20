/**
 * Pagination automatique layout v3 (P3.10).
 *
 * Blocs dont le bas depasse la page A4 : deplacement sur la page suivante
 * (creation si besoin). Ordre vertical conserve.
 */

import {
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  appendBlankPage,
  addBlockToPage,
  removeBlock,
} from './cvLayoutModelV3.js';

const PAGE_GAP_MM = 6;

/**
 * @param {object} block
 * @param {number} [pageHeightMm]
 */
export function blockBottomMm(block, pageHeightMm = PAGE_HEIGHT_MM) {
  const y = Number(block?.y) || 0;
  const h = Number(block?.h) || 0;
  return y + h;
}

export function blockOverflowsPage(block, pageHeightMm = PAGE_HEIGHT_MM) {
  return blockBottomMm(block, pageHeightMm) > pageHeightMm + 0.01;
}

/**
 * Blocs d une page dont le bas depasse la hauteur A4.
 * @param {object} layout
 * @param {number} pageIndex
 */
export function listOverflowingBlocksOnPage(layout, pageIndex = 0) {
  const page = layout?.pages?.[pageIndex];
  if (!page || !Array.isArray(page.blocks)) return [];
  return page.blocks
    .filter((b) => b && blockOverflowsPage(b))
    .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
}

/**
 * True si au moins un bloc deborderait (utile banniere UI).
 */
export function layoutHasPageOverflow(layout) {
  if (!layout?.pages?.length) return false;
  for (let i = 0; i < layout.pages.length; i += 1) {
    if (listOverflowingBlocksOnPage(layout, i).length > 0) return true;
  }
  return false;
}

/**
 * Deplace les blocs qui debordent de ``pageIndex`` vers la page suivante.
 */
export function spillOverflowFromPage(layout, pageIndex = 0) {
  if (!layout?.pages?.[pageIndex]) return layout;
  const overflowing = listOverflowingBlocksOnPage(layout, pageIndex);
  if (overflowing.length === 0) return layout;

  let next = layout;
  let targetPageIndex = pageIndex + 1;
  if (targetPageIndex >= next.pages.length) {
    next = appendBlankPage(next);
  }

  const existingOnTarget = next.pages[targetPageIndex]?.blocks || [];
  let cursorY = existingOnTarget.reduce(
    (max, b) => Math.max(max, blockBottomMm(b) + PAGE_GAP_MM),
    PAGE_MARGIN_MM,
  );
  if (!Number.isFinite(cursorY) || cursorY < PAGE_MARGIN_MM) {
    cursorY = PAGE_MARGIN_MM;
  }

  for (const block of overflowing) {
    next = removeBlock(next, block.id);
    const placed = {
      ...block,
      y: cursorY,
    };
    next = addBlockToPage(next, targetPageIndex, placed);
    cursorY += (Number(placed.h) || 10) + PAGE_GAP_MM;
  }

  return next;
}

/**
 * Applique le spill sur chaque page (max 8 passes pour chaines multi-pages).
 */
export function applyLayoutPagination(layout) {
  if (!layout?.pages?.length) return layout;
  let result = layout;
  const maxPasses = 8;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (let i = 0; i < result.pages.length; i += 1) {
      if (listOverflowingBlocksOnPage(result, i).length === 0) continue;
      result = spillOverflowFromPage(result, i);
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}
