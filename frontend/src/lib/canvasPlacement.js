/**
 * Placement par glisser-déposer sur le canvas (style Canva).
 */
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './cvLayoutModelV3.js';

/** Convertit un point écran en coordonnées mm sur la page (gère le scale CSS). */
export function clientPointToPageMm(clientX, clientY, pageElement) {
  if (!pageElement) return { x: 0, y: 0 };
  const rect = pageElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * PAGE_WIDTH_MM,
    y: ((clientY - rect.top) / rect.height) * PAGE_HEIGHT_MM,
  };
}

/** Page canvas (.free-canvas-page) sous le pointeur. */
export function findPageElementAtPoint(clientX, clientY) {
  if (typeof document === 'undefined') return null;
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const page = el.closest?.('.free-canvas-page[data-page-index]');
    if (page) return page;
  }
  return null;
}

export function pageIndexFromElement(pageEl) {
  if (!pageEl) return 0;
  const n = parseInt(pageEl.getAttribute('data-page-index') || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
