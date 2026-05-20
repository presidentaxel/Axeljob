/**
 * Redimensionnement des blocs canvas (P3.4) — calcul pur en mm.
 *
 * Poignées coins + bords (nw, ne, sw, se, n, s, e, w).
 */

import {
  BLOCK_MIN_HEIGHT_MM,
  BLOCK_MIN_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from './cvLayoutModelV3.js';

export const RESIZE_HANDLES = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

export function resizeGroupKey(blockId) {
  return `resize:${blockId}`;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} start
 * @param {string} handle
 * @param {{ dx: number, dy: number }} deltaMm
 */
export function computeResizedBlock(start, handle, deltaMm) {
  if (!start || typeof start !== 'object') {
    return { x: 0, y: 0, w: BLOCK_MIN_WIDTH_MM, h: BLOCK_MIN_HEIGHT_MM };
  }
  const dx = deltaMm && typeof deltaMm.dx === 'number' ? deltaMm.dx : 0;
  const dy = deltaMm && typeof deltaMm.dy === 'number' ? deltaMm.dy : 0;

  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  switch (handle) {
    case 'e':
      w = start.w + dx;
      break;
    case 'w':
      w = start.w - dx;
      x = start.x + dx;
      break;
    case 's':
      h = start.h + dy;
      break;
    case 'n':
      h = start.h - dy;
      y = start.y + dy;
      break;
    case 'se':
      w = start.w + dx;
      h = start.h + dy;
      break;
    case 'sw':
      w = start.w - dx;
      x = start.x + dx;
      h = start.h + dy;
      break;
    case 'ne':
      w = start.w + dx;
      h = start.h - dy;
      y = start.y + dy;
      break;
    case 'nw':
      w = start.w - dx;
      x = start.x + dx;
      h = start.h - dy;
      y = start.y + dy;
      break;
    default:
      break;
  }

  if (w < BLOCK_MIN_WIDTH_MM) {
    if (handle === 'sw' || handle === 'nw' || handle === 'w') {
      x = start.x + start.w - BLOCK_MIN_WIDTH_MM;
    }
    w = BLOCK_MIN_WIDTH_MM;
  }
  if (h < BLOCK_MIN_HEIGHT_MM) {
    if (handle === 'nw' || handle === 'ne' || handle === 'n') {
      y = start.y + start.h - BLOCK_MIN_HEIGHT_MM;
    }
    h = BLOCK_MIN_HEIGHT_MM;
  }

  x = clamp(x, 0, PAGE_WIDTH_MM - BLOCK_MIN_WIDTH_MM);
  y = clamp(y, 0, PAGE_HEIGHT_MM - BLOCK_MIN_HEIGHT_MM);
  w = clamp(w, BLOCK_MIN_WIDTH_MM, PAGE_WIDTH_MM - x);
  h = clamp(h, BLOCK_MIN_HEIGHT_MM, PAGE_HEIGHT_MM - y);

  return { x, y, w, h };
}
