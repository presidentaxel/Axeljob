/**
 * Snap grille + guides magnetiques (P3.7+) pour le canvas libre.
 *
 * Priorite : alignement magnetique si dans le seuil, sinon grille 5 mm.
 * Cibles : bords page, centre page, marges, quarts, autres blocs (bords + centres),
 * alignement des tailles au resize.
 */

import {
  BLOCK_MIN_HEIGHT_MM,
  BLOCK_MIN_WIDTH_MM,
  listAllBlocks,
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  PAGE_WIDTH_MM,
} from './cvLayoutModelV3.js';

export const SNAP_GRID_MM_DEFAULT = 5;
export const SNAP_THRESHOLD_MM_DEFAULT = 1.2;

const PAGE_CENTER_X = PAGE_WIDTH_MM / 2;
const PAGE_CENTER_Y = PAGE_HEIGHT_MM / 2;

export function snapToGrid(value, gridMm = SNAP_GRID_MM_DEFAULT) {
  const g = gridMm > 0 ? gridMm : SNAP_GRID_MM_DEFAULT;
  return Math.round((Number(value) || 0) / g) * g;
}

/**
 * @typedef {{ type: 'v'|'h', pos: number, role?: 'center'|'edge' }} SnapGuide
 */

/**
 * @param {{ x: number, y: number }} pos
 * @param {object} layout
 * @param {string} blockId
 * @param {{ gridMm?: number, thresholdMm?: number, w?: number, h?: number }} [options]
 * @returns {{ x: number, y: number, guides: SnapGuide[] }}
 */
export function snapBlockPosition(pos, layout, blockId, options = {}) {
  const grid = options.gridMm ?? SNAP_GRID_MM_DEFAULT;
  const threshold = options.thresholdMm ?? SNAP_THRESHOLD_MM_DEFAULT;
  const block = listAllBlocks(layout).find((b) => b.id === blockId);
  const w = options.w ?? block?.w ?? 20;
  const h = options.h ?? block?.h ?? 10;

  const xSnap = snapAxis(pos.x, w, collectXTargets(layout, blockId), grid, threshold, 'v');
  const ySnap = snapAxis(pos.y, h, collectYTargets(layout, blockId), grid, threshold, 'h');

  let x = clamp(xSnap.value, 0, PAGE_WIDTH_MM - w);
  let y = clamp(ySnap.value, 0, PAGE_HEIGHT_MM - h);

  const guides = [...xSnap.guides, ...ySnap.guides];

  return { x, y, guides };
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} geom
 */
export function snapBlockGeometry(geom, layout, blockId, _handle, options = {}) {
  const grid = options.gridMm ?? SNAP_GRID_MM_DEFAULT;
  const threshold = options.thresholdMm ?? SNAP_THRESHOLD_MM_DEFAULT;
  let { x, y, w, h } = geom;

  const wTargets = collectWidthTargets(layout, blockId);
  const hTargets = collectHeightTargets(layout, blockId);
  w = snapSize(w, wTargets, grid, threshold, BLOCK_MIN_WIDTH_MM);
  h = snapSize(h, hTargets, grid, threshold, BLOCK_MIN_HEIGHT_MM);

  const posSnap = snapBlockPosition({ x, y }, layout, blockId, { ...options, w, h });
  return { x: posSnap.x, y: posSnap.y, w, h, guides: posSnap.guides };
}

function snapAxis(origin, size, targets, grid, threshold, axisType) {
  const edges = [
    { value: origin, role: 'edge' },
    { value: origin + size, role: 'edge' },
    { value: origin + size / 2, role: 'center' },
  ];
  const guides = [];
  let bestOrigin = snapToGrid(origin, grid);
  let bestDist = threshold + 1;
  let usedMagnetic = false;

  for (const edge of edges) {
    for (const target of targets) {
      const dist = Math.abs(edge.value - target.pos);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestOrigin = origin + (target.pos - edge.value);
        usedMagnetic = true;
        guides.length = 0;
        guides.push({
          type: axisType,
          pos: target.pos,
          role: target.role === 'center' ? 'center' : 'edge',
        });
      }
    }
  }

  if (!usedMagnetic) {
    bestOrigin = snapToGrid(origin, grid);
  }

  return { value: bestOrigin, guides };
}

function snapSize(value, targets, grid, threshold, minVal) {
  let best = snapToGrid(value, grid);
  let bestDist = threshold + 1;
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return Math.max(minVal, best);
}

function collectXTargets(layout, blockId) {
  const mx = PAGE_MARGIN_MM;
  const innerRight = PAGE_WIDTH_MM - mx;
  const usableCenter = mx + PAGE_USABLE_WIDTH_MM / 2;
  const targets = [
    { pos: 0, role: 'edge' },
    { pos: PAGE_WIDTH_MM, role: 'edge' },
    { pos: PAGE_CENTER_X, role: 'center' },
    { pos: mx, role: 'edge' },
    { pos: innerRight, role: 'edge' },
    { pos: usableCenter, role: 'center' },
    { pos: PAGE_WIDTH_MM / 4, role: 'edge' },
    { pos: (3 * PAGE_WIDTH_MM) / 4, role: 'edge' },
  ];
  for (const b of listAllBlocks(layout)) {
    if (b.id === blockId) continue;
    targets.push(
      { pos: b.x, role: 'edge' },
      { pos: b.x + b.w / 2, role: 'center' },
      { pos: b.x + b.w, role: 'edge' },
    );
  }
  return targets;
}

function collectYTargets(layout, blockId) {
  const my = PAGE_MARGIN_MM;
  const innerBottom = PAGE_HEIGHT_MM - my;
  const usableCenterY = my + (PAGE_HEIGHT_MM - 2 * my) / 2;
  const targets = [
    { pos: 0, role: 'edge' },
    { pos: PAGE_HEIGHT_MM, role: 'edge' },
    { pos: PAGE_CENTER_Y, role: 'center' },
    { pos: my, role: 'edge' },
    { pos: innerBottom, role: 'edge' },
    { pos: usableCenterY, role: 'center' },
    { pos: PAGE_HEIGHT_MM / 4, role: 'edge' },
    { pos: (3 * PAGE_HEIGHT_MM) / 4, role: 'edge' },
  ];
  for (const b of listAllBlocks(layout)) {
    if (b.id === blockId) continue;
    targets.push(
      { pos: b.y, role: 'edge' },
      { pos: b.y + b.h / 2, role: 'center' },
      { pos: b.y + b.h, role: 'edge' },
    );
  }
  return targets;
}

function collectWidthTargets(layout, blockId) {
  const targets = [PAGE_USABLE_WIDTH_MM, PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM];
  for (const b of listAllBlocks(layout)) {
    if (b.id === blockId) continue;
    targets.push(b.w);
  }
  return targets;
}

function collectHeightTargets(layout, blockId) {
  const targets = [];
  for (const b of listAllBlocks(layout)) {
    if (b.id === blockId) continue;
    targets.push(b.h);
  }
  return targets;
}

function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
