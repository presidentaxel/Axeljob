/**
 * AXE-326 — Helpers purs pour le chooser de variantes d'import.
 */

import { IMPORT_VARIANT_IDS } from './importLayoutVariants.js';

/**
 * True si la variante a un score parsing numérique.
 * @param {object} variant
 */
export function variantHasAtsScore(variant) {
  return Number.isFinite(variant?.score_json?.total);
}

/**
 * True si c'est la meilleure variante ATS (score présent + delta 0).
 * Sans score (échec API), on ne marque personne « meilleur ».
 * @param {object} variant
 */
export function isBestAtsVariant(variant) {
  return variantHasAtsScore(variant) && variant.delta_vs_best === 0;
}

/**
 * Id sélectionné par défaut : `design` (comportement historique), sinon
 * meilleure variante scorée (`delta_vs_best === 0`), sinon première.
 * @param {Array<{ id: string, delta_vs_best?: number|null, score_json?: object }>} variants
 */
export function defaultImportVariantId(variants = []) {
  const list = Array.isArray(variants) ? variants : [];
  if (list.length === 0) return '';
  const design = list.find((v) => v?.id === 'design');
  if (design) return design.id;
  const best = list.find((v) => isBestAtsVariant(v));
  if (best) return best.id;
  return list[0]?.id || '';
}

/**
 * Retrouve une variante par id (fallback default / première).
 * @param {Array<object>} variants
 * @param {string} selectedId
 */
export function resolveImportVariant(variants = [], selectedId = '') {
  const list = Array.isArray(variants) ? variants : [];
  if (list.length === 0) return null;
  const found = list.find((v) => v?.id === selectedId);
  if (found) return found;
  const fallbackId = defaultImportVariantId(list);
  return list.find((v) => v?.id === fallbackId) || list[0];
}

/**
 * Fusionne les layouts construits (AXE-324) avec les scores (AXE-325).
 * Conserve toujours le `layout` de `built` (source de vérité).
 * Sans score : `delta_vs_best` reste `null` (pas 0 → évite « meilleur ATS » faux).
 *
 * @param {Array<object>} built
 * @param {Array<object>} scored
 */
export function mergeBuiltAndScoredVariants(built = [], scored = []) {
  const scoreById = new Map(
    (Array.isArray(scored) ? scored : []).map((s) => [s.id, s]),
  );
  return (Array.isArray(built) ? built : []).map((v) => {
    const s = scoreById.get(v.id);
    const score_json = s?.score_json || null;
    const hasScore = Number.isFinite(score_json?.total);
    return {
      ...v,
      score_json,
      delta_vs_best: hasScore && Number.isFinite(s?.delta_vs_best)
        ? s.delta_vs_best
        : null,
      label: v.label || s?.label || v.id,
    };
  });
}

/** Ordre d'affichage stable des 3 ids produit. */
export function sortImportVariantsForChooser(variants = []) {
  const list = Array.isArray(variants) ? [...variants] : [];
  const order = new Map(IMPORT_VARIANT_IDS.map((id, i) => [id, i]));
  return list.sort((a, b) => {
    const ia = order.has(a?.id) ? order.get(a.id) : 99;
    const ib = order.has(b?.id) ? order.get(b.id) : 99;
    return ia - ib;
  });
}

/**
 * Message toast après confirmation.
 * @param {object} variant
 */
export function importChooserToastMessage(variant) {
  if (!variant) return 'CV importé.';
  const score = variant.score_json?.total;
  const scoreBit = Number.isFinite(score) ? ` · score ATS ${score}` : '';
  const label = variant.label || variant.id || 'variante';
  const n = variant.blockCount || 0;
  if (variant.id === 'ats-safe') {
    return `${n} éléments · variante ATS-safe${scoreBit}`;
  }
  if (variant.id === 'mix') {
    return `${n} éléments · mix design + ATS${scoreBit}`;
  }
  if (variant.importSource === 'structural') {
    return `${n} éléments importés · copie fidèle du PDF${scoreBit}`;
  }
  return `${n} éléments · ${label}${scoreBit}`;
}
