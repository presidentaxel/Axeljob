/**
 * Corrections ATS par règle (AXE-36) — pures, réversibles via undo layout.
 */

import {
  optimizeContactVerticalPosition,
  optimizeLayoutReadingOrder,
} from './atsLayoutOptimize.js';
import { getAtsCoachAdvice } from './atsCoachAdvice.js';

/**
 * Applique la correction associée à une règle, ou retourne le layout inchangé.
 * @param {object} layout
 * @param {string} ruleId
 * @returns {object}
 */
export function applyAtsCoachFix(layout, ruleId) {
  if (!layout) return layout;
  const { fixKind } = getAtsCoachAdvice({ id: ruleId });
  if (fixKind === 'contact-up') {
    return optimizeContactVerticalPosition(layout);
  }
  if (fixKind === 'reading-order') {
    return optimizeLayoutReadingOrder(layout);
  }
  return layout;
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
