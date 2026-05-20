/**
 * Calculs de drag pour le canvas libre (P3.3).
 *
 * Les blocs sont positionnes en mm. Le viewport applique un `transform:
 * scale(s)` sur la page. Un deplacement souris de N pixels correspond a
 * N / (MM_TO_PX * scale) millimetres sur le layout.
 */

import { MM_TO_PX } from './freeCanvasScale.js';

/**
 * Convertit un delta pointer (pixels ecran) en delta mm sur la page.
 */
export function clientDeltaToMmDelta(dxPx, dyPx, scale) {
  const s = typeof scale === 'number' && scale > 0 ? scale : 1;
  const denom = MM_TO_PX * s;
  return {
    dx: (Number(dxPx) || 0) / denom,
    dy: (Number(dyPx) || 0) / denom,
  };
}

/**
 * Position apres drag depuis un point de depart (mm) + delta mm.
 */
export function positionAfterDrag(startMm, deltaMm) {
  const sx = startMm && typeof startMm.x === 'number' ? startMm.x : 0;
  const sy = startMm && typeof startMm.y === 'number' ? startMm.y : 0;
  const dx = deltaMm && typeof deltaMm.dx === 'number' ? deltaMm.dx : 0;
  const dy = deltaMm && typeof deltaMm.dy === 'number' ? deltaMm.dy : 0;
  return { x: sx + dx, y: sy + dy };
}

/** Cle de coalescing undo/redo pour un drag de bloc. */
export function dragGroupKey(blockId) {
  return `drag:${blockId}`;
}
