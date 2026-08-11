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
  findBlock,
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
  const block = findBlock(layout, blockId)?.block;
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
  const handle = typeof _handle === 'string' ? _handle : '';
  const guides = [];

  if (handle.includes('e')) {
    const rightSnap = snapResizeEdge(x + w, collectXTargets(layout, blockId), threshold, 'end', 'v');
    if (rightSnap.used) {
      w = rightSnap.value - x;
      guides.push(rightSnap.guide);
    } else {
      w = snapSize(w, collectWidthTargets(layout, blockId), grid, threshold, BLOCK_MIN_WIDTH_MM);
    }
  } else if (handle.includes('w')) {
    const fixedRight = geom.x + geom.w;
    const leftSnap = snapResizeEdge(x, collectXTargets(layout, blockId), threshold, 'start', 'v');
    if (leftSnap.used) {
      x = leftSnap.value;
      w = fixedRight - x;
      guides.push(leftSnap.guide);
    } else {
      w = snapSize(w, collectWidthTargets(layout, blockId), grid, threshold, BLOCK_MIN_WIDTH_MM);
      x = fixedRight - w;
    }
  }

  if (handle.includes('s')) {
    const bottomSnap = snapResizeEdge(y + h, collectYTargets(layout, blockId), threshold, 'end', 'h');
    if (bottomSnap.used) {
      h = bottomSnap.value - y;
      guides.push(bottomSnap.guide);
    } else {
      h = snapSize(h, collectHeightTargets(layout, blockId), grid, threshold, BLOCK_MIN_HEIGHT_MM);
    }
  } else if (handle.includes('n')) {
    const fixedBottom = geom.y + geom.h;
    const topSnap = snapResizeEdge(y, collectYTargets(layout, blockId), threshold, 'start', 'h');
    if (topSnap.used) {
      y = topSnap.value;
      h = fixedBottom - y;
      guides.push(topSnap.guide);
    } else {
      h = snapSize(h, collectHeightTargets(layout, blockId), grid, threshold, BLOCK_MIN_HEIGHT_MM);
      y = fixedBottom - h;
    }
  }

  if (w < BLOCK_MIN_WIDTH_MM) {
    if (handle.includes('w')) {
      const fixedRight = x + w;
      x = fixedRight - BLOCK_MIN_WIDTH_MM;
    }
    w = BLOCK_MIN_WIDTH_MM;
  }
  if (h < BLOCK_MIN_HEIGHT_MM) {
    if (handle.includes('n')) {
      const fixedBottom = y + h;
      y = fixedBottom - BLOCK_MIN_HEIGHT_MM;
    }
    h = BLOCK_MIN_HEIGHT_MM;
  }

  x = clamp(x, 0, PAGE_WIDTH_MM - w);
  y = clamp(y, 0, PAGE_HEIGHT_MM - h);
  w = clamp(w, BLOCK_MIN_WIDTH_MM, PAGE_WIDTH_MM - x);
  h = clamp(h, BLOCK_MIN_HEIGHT_MM, PAGE_HEIGHT_MM - y);
  return { x, y, w, h, guides: guides.filter(Boolean) };
}

function snapAxis(origin, size, targets, grid, threshold, axisType) {
  const edges = [
    { value: origin, role: 'edge', key: 'start' },
    { value: origin + size, role: 'edge', key: 'end' },
    { value: origin + size / 2, role: 'center', key: 'center' },
  ];
  const guides = [];
  let bestOrigin = snapToGrid(origin, grid);
  let bestDist = threshold + 1;
  let bestPriority = Number.POSITIVE_INFINITY;
  let usedMagnetic = false;

  for (const edge of edges) {
    for (const target of targets) {
      if (target.match && !target.match.includes(edge.key)) continue;
      const dist = Math.abs(edge.value - target.pos);
      const priority = target.priority ?? 10;
      if (
        dist <= threshold
        && (priority < bestPriority || (priority === bestPriority && dist < bestDist))
      ) {
        bestDist = dist;
        bestPriority = priority;
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

function snapResizeEdge(edgeValue, targets, threshold, edgeKey, axisType) {
  let best = null;
  let bestDist = threshold + 1;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target.match && !target.match.includes(edgeKey)) continue;
    const dist = Math.abs(edgeValue - target.pos);
    const priority = target.priority ?? 10;
    if (
      dist <= threshold
      && (priority < bestPriority || (priority === bestPriority && dist < bestDist))
    ) {
      best = target;
      bestDist = dist;
      bestPriority = priority;
    }
  }
  if (!best) return { used: false, value: edgeValue, guide: null };
  return {
    used: true,
    value: best.pos,
    guide: {
      type: axisType,
      pos: best.pos,
      role: best.role === 'center' ? 'center' : 'edge',
    },
  };
}

function collectXTargets(layout, blockId) {
  const mx = PAGE_MARGIN_MM;
  const innerRight = PAGE_WIDTH_MM - mx;
  const usableCenter = mx + PAGE_USABLE_WIDTH_MM / 2;
  const targets = [
    { pos: 0, role: 'edge', match: ['start'], priority: 0 },
    { pos: PAGE_WIDTH_MM, role: 'edge', match: ['end'], priority: 0 },
    { pos: mx, role: 'edge', match: ['start'], priority: 0 },
    { pos: innerRight, role: 'edge', match: ['end'], priority: 0 },
    { pos: PAGE_CENTER_X, role: 'center', match: ['center'], priority: 1 },
    { pos: usableCenter, role: 'center', match: ['center'], priority: 1 },
    { pos: PAGE_WIDTH_MM / 4, role: 'center', match: ['center'], priority: 5 },
    { pos: (3 * PAGE_WIDTH_MM) / 4, role: 'center', match: ['center'], priority: 5 },
  ];
  for (const b of peerBlocksOnSamePage(layout, blockId)) {
    targets.push(
      { pos: b.x, role: 'edge', match: ['start', 'end'], priority: 2 },
      { pos: b.x + b.w, role: 'edge', match: ['start', 'end'], priority: 2 },
      { pos: b.x + b.w / 2, role: 'center', match: ['center'], priority: 3 },
    );
  }
  return targets;
}

function collectYTargets(layout, blockId) {
  const my = PAGE_MARGIN_MM;
  const innerBottom = PAGE_HEIGHT_MM - my;
  const usableCenterY = my + (PAGE_HEIGHT_MM - 2 * my) / 2;
  const targets = [
    { pos: 0, role: 'edge', match: ['start'], priority: 0 },
    { pos: PAGE_HEIGHT_MM, role: 'edge', match: ['end'], priority: 0 },
    { pos: my, role: 'edge', match: ['start'], priority: 0 },
    { pos: innerBottom, role: 'edge', match: ['end'], priority: 0 },
    { pos: PAGE_CENTER_Y, role: 'center', match: ['center'], priority: 1 },
    { pos: usableCenterY, role: 'center', match: ['center'], priority: 1 },
    { pos: PAGE_HEIGHT_MM / 4, role: 'center', match: ['center'], priority: 5 },
    { pos: (3 * PAGE_HEIGHT_MM) / 4, role: 'center', match: ['center'], priority: 5 },
  ];
  for (const b of peerBlocksOnSamePage(layout, blockId)) {
    targets.push(
      { pos: b.y, role: 'edge', match: ['start', 'end'], priority: 2 },
      { pos: b.y + b.h, role: 'edge', match: ['start', 'end'], priority: 2 },
      { pos: b.y + b.h / 2, role: 'center', match: ['center'], priority: 3 },
    );
  }
  return targets;
}

function collectWidthTargets(layout, blockId) {
  const targets = [PAGE_USABLE_WIDTH_MM, PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM];
  for (const b of peerBlocksOnSamePage(layout, blockId)) {
    targets.push(b.w);
  }
  return targets;
}

function collectHeightTargets(layout, blockId) {
  const targets = [];
  for (const b of peerBlocksOnSamePage(layout, blockId)) {
    targets.push(b.h);
  }
  return targets;
}

function peerBlocksOnSamePage(layout, blockId) {
  const found = findBlock(layout, blockId);
  if (!found || !Array.isArray(layout?.pages)) return [];
  const page = layout.pages[found.pageIndex];
  return (page?.blocks || []).filter((b) => b && b.id !== blockId);
}

function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
