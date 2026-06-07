/**
 * Reflow vertical des blocs canvas par colonne (zone / lane).
 * Évite les chevauchements quand la hauteur auto grandit.
 */

import {
  isAutoHeightBlockType,
  PAGE_WIDTH_MM,
  setBlockPosition,
} from './cvLayoutModelV3.js';

const REFLOW_GAP_MM = 2;

const REFLOW_SKIP_TYPES = new Set([
  'shape:rect',
  'shape:line',
  'photo',
  'image',
  'icon',
  'qrcode',
]);

function laneKey(block) {
  if (!block || REFLOW_SKIP_TYPES.has(block.type)) return null;
  if (block.style?.zone === 'header') return null;
  if (block.style?.zone) return block.style.zone;
  const x = Number(block.x) || 0;
  if (x > PAGE_WIDTH_MM * 0.62) return 'sidebar';
  return 'main';
}

function shouldReflowBlock(block) {
  if (!block || REFLOW_SKIP_TYPES.has(block.type)) return false;
  return isAutoHeightBlockType(block.type);
}

/**
 * Réorganise les blocs d'une page par lane : chaque bloc suit le précédent (y + h + gap).
 * Le premier bloc de chaque lane conserve son y d'origine.
 */
export function reflowColumnBlocksOnPage(layout, pageIndex = 0) {
  if (!layout?.pages?.[pageIndex]?.blocks) return layout;
  // Import "copie fidèle" : les blocs sont positionnés en absolu d'après le
  // PDF (titre + dates côte à côte, espacements serrés…). Les ré-empiler par
  // colonne casserait tout le rendu → on n'y touche pas.
  if (layout.freeform === true) return layout;

  const blocks = layout.pages[pageIndex].blocks;
  const lanes = new Map();

  for (const block of blocks) {
    if (!shouldReflowBlock(block)) continue;
    const lane = laneKey(block);
    if (!lane) continue;
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane).push(block);
  }

  let next = layout;
  const patches = new Map();

  for (const laneBlocks of lanes.values()) {
    const sorted = [...laneBlocks].sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
    let bottom = null;
    for (let i = 0; i < sorted.length; i += 1) {
      const b = sorted[i];
      const h = Number(b.h) || 0;
      if (bottom === null) {
        bottom = (Number(b.y) || 0) + h + REFLOW_GAP_MM;
        continue;
      }
      const minY = bottom;
      const curY = Number(b.y) || 0;
      const y = curY < minY - 0.05 ? minY : curY;
      if (Math.abs(y - curY) > 0.08) {
        patches.set(b.id, { x: Number(b.x) || 0, y });
      }
      bottom = y + h + REFLOW_GAP_MM;
    }
  }

  for (const [blockId, pos] of patches) {
    next = setBlockPosition(next, blockId, pos);
  }

  return next;
}
