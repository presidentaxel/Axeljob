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
