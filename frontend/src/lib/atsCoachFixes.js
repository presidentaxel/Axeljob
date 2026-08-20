/**
 * Corrections ATS par règle (AXE-36 / AXE-333) — pures, réversibles via undo layout.
 */

import {
  applyAtsLayoutOptimizations,
  optimizeAddMissingProfileSections,
  optimizeBodyFontSize,
  optimizeContactVerticalPosition,
  optimizeHidePhoto,
  optimizeRemoveSidebar,
  optimizeSafeFonts,
  optimizeSingleColumnFreeCanvas,
} from './atsLayoutOptimize.js';
import { applyLayoutPagination } from './layoutPagination.js';
import { getAtsCoachAdvice } from './atsCoachAdvice.js';

/**
 * Applique la correction associée à une règle, ou retourne le layout inchangé.
 * @param {object} layout
 * @param {string} ruleId
 * @param {{ cv?: object }} [options]
 * @returns {object}
 */
export function applyAtsCoachFix(layout, ruleId, options = {}) {
  if (!layout) return layout;
  const { fixKind } = getAtsCoachAdvice({ id: ruleId });
  if (fixKind === 'contact-up') {
    return optimizeContactVerticalPosition(layout);
  }
  if (fixKind === 'reading-order') {
    return applyAtsLayoutOptimizations(layout);
  }
  if (fixKind === 'add-missing-sections') {
    return optimizeAddMissingProfileSections(layout, options.cv);
  }
  if (fixKind === 'hide-photo') {
    return optimizeHidePhoto(layout);
  }
  if (fixKind === 'fix-font') {
    return optimizeSafeFonts(layout);
  }
  if (fixKind === 'fix-body-font-size') {
    return optimizeBodyFontSize(layout);
  }
  if (fixKind === 'single-column') {
    if (layout.grid === 'free') {
      return optimizeSingleColumnFreeCanvas(layout);
    }
    return optimizeRemoveSidebar(layout);
  }
  if (fixKind === 'spill-overflow') {
    return applyLayoutPagination(layout);
  }
  return layout;
}

/**
 * True si le layout a réellement changé (JSON stable).
 * @param {object} before
 * @param {object} after
 */
export function didAtsCoachFixChangeLayout(before, after) {
  if (!before || !after || before === after) return false;
  try {
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    return before !== after;
  }
}

/**
 * Libellé court pour l’impact avant application.
 * @param {number} before
 * @param {number} after
 * @returns {string}
 */
export function formatAtsScoreImpact(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return 'Impact score : calcul…';
  }
  if (before === after) {
    return `Impact score : aucun (${before}/100)`;
  }
  const arrow = after > before ? '↑' : '↓';
  return `Impact score : ${before} → ${after} ${arrow}`;
}
