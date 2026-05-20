/**
 * Calcul d echelle pour l apercu A4 du canvas libre (P3.2).
 *
 * La page est dimensionnee en mm (210 x 297). Pour l afficher dans un
 * viewport plus etroit (editeur Beta), on calcule un facteur `scale` tel
 * que la largeur de la page tienne dans le conteneur, avec une marge
 * optionnelle.
 *
 * Reference CSS : 1mm = 96/25.4 px a 96 DPI (meme convention que les
 * navigateurs pour les unites absolues CSS).
 */

import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './cvLayoutModelV3.js';

/** Pixels par millimetre (reference 96 DPI). */
export const MM_TO_PX = 96 / 25.4;

/** Largeur / hauteur A4 en pixels a l echelle 1:1. */
export const PAGE_WIDTH_PX = PAGE_WIDTH_MM * MM_TO_PX;
export const PAGE_HEIGHT_PX = PAGE_HEIGHT_MM * MM_TO_PX;

/**
 * Calcule le facteur d echelle pour faire tenir la page dans `containerWidthPx`.
 * Retourne un nombre dans ]0, 1] (ou >1 si le conteneur est tres large).
 *
 * @param {number} containerWidthPx
 * @param {{ maxScale?: number, paddingPx?: number }} [options]
 * @returns {number}
 */
export function computePageScale(containerWidthPx, options = {}) {
  const padding = typeof options.paddingPx === 'number' ? options.paddingPx : 32;
  const maxScale = typeof options.maxScale === 'number' ? options.maxScale : 1;
  const available = Math.max(0, (Number(containerWidthPx) || 0) - padding);
  if (available <= 0 || PAGE_WIDTH_PX <= 0) return 1;
  const raw = available / PAGE_WIDTH_PX;
  const clamped = Math.min(raw, maxScale);
  return clamped > 0 ? clamped : 1;
}

/**
 * Hauteur occupee par la page apres scale (pour reserver l espace scroll).
 */
export function scaledPageHeightPx(scale) {
  const s = Number(scale) || 1;
  return PAGE_HEIGHT_PX * s;
}
