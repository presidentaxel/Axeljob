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

/**
 * Page cible pour une sélection rectangle (marquee).
 * Si le clic est dans la zone grise autour de la page, on projette sur la page
 * la plus proche verticalement (même colonne / même Y).
 */
export function findPageForMarquee(clientX, clientY) {
  const direct = findPageElementAtPoint(clientX, clientY);
  if (direct) {
    return { pageEl: direct, point: clientPointToPageMm(clientX, clientY, direct) };
  }
  if (typeof document === 'undefined') return null;

  const pages = document.querySelectorAll('.free-canvas-page[data-page-index]');
  if (!pages.length) return null;

  const clampToPage = (pageEl, x, y) => {
    const rect = pageEl.getBoundingClientRect();
    const cx = Math.min(Math.max(x, rect.left), rect.right);
    const cy = Math.min(Math.max(y, rect.top), rect.bottom);
    return { pageEl, point: clientPointToPageMm(cx, cy, pageEl) };
  };

  for (const pageEl of pages) {
    const rect = pageEl.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return clampToPage(pageEl, clientX, clientY);
    }
  }

  let best = null;
  let bestDist = Infinity;
  for (const pageEl of pages) {
    const rect = pageEl.getBoundingClientRect();
    const midY = (rect.top + rect.bottom) / 2;
    const dist = Math.abs(clientY - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = pageEl;
    }
  }
  return best ? clampToPage(best, clientX, clientY) : null;
}

export function pageIndexFromElement(pageEl) {
  if (!pageEl) return 0;
  const n = parseInt(pageEl.getAttribute('data-page-index') || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
