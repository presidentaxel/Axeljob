/**
 * AXE-325 — Scorer les 3 variantes d'import (score_parsing + delta_vs_best).
 *
 * Entrée : variantes produites par `buildImportLayoutVariants` (AXE-324).
 * Sortie :
 *   `{ variants: [{ id, label?, layout?, score_json, delta_vs_best, ... }] }`
 *
 * Le scoring reste API-only (`POST /api/ats/score-parsing`) via fetcher injectable.
 * Pas d'UI (AXE-326). verify-pdf optionnel hors de ce module.
 */

import { fetchAtsScoreParsing } from './atsScoreClient.js';

/**
 * Reconstitue la shape API (`score_json`) depuis la réponse normalisée client.
 * @param {{ score: number, version: string, kind: string, rules: Array }} normalized
 */
export function toScoreJson(normalized) {
  if (!normalized || typeof normalized !== 'object') {
    throw new Error('toScoreJson: normalized score required');
  }
  const rules = Array.isArray(normalized.rules) ? normalized.rules : [];
  return {
    kind: typeof normalized.kind === 'string' ? normalized.kind : 'parsing',
    total: Number.isFinite(normalized.score) ? normalized.score : 0,
    version: typeof normalized.version === 'string' ? normalized.version : '',
    rules: rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      delta: rule.delta,
      severity: rule.severity,
      block_ids: Array.isArray(rule.blockIds) ? [...rule.blockIds] : [],
      advice: rule.advice || '',
    })),
  };
}

/**
 * Attache `delta_vs_best` (score − meilleur total ; 0 pour le meilleur).
 * @param {Array<{ id: string, score_json: { total: number } }>} scored
 */
export function attachDeltaVsBest(scored = []) {
  const list = Array.isArray(scored) ? scored : [];
  if (list.length === 0) return [];
  const totals = list.map((v) => Number(v?.score_json?.total));
  const finite = totals.filter((n) => Number.isFinite(n));
  const best = finite.length ? Math.max(...finite) : 0;
  return list.map((v, i) => {
    const total = totals[i];
    const delta = Number.isFinite(total) ? total - best : 0;
    return { ...v, delta_vs_best: delta };
  });
}

/**
 * Règles présentes sur une variante mais pas sur la meilleure (ids).
 * Utile pour expliquer le delta (AXE-326).
 *
 * @param {Array<{ id: string, score_json: { total: number, rules?: Array }, delta_vs_best: number }>} scoredWithDelta
 */
export function listDifferentialRuleIds(scoredWithDelta = []) {
  const list = Array.isArray(scoredWithDelta) ? scoredWithDelta : [];
  const best = list.find((v) => v?.delta_vs_best === 0) || list[0];
  if (!best?.score_json) return {};
  const bestIds = new Set(
    (best.score_json.rules || []).map((r) => r?.id).filter(Boolean),
  );
  const out = {};
  for (const v of list) {
    if (!v?.id) continue;
    const ids = (v.score_json?.rules || [])
      .map((r) => r?.id)
      .filter((id) => id && !bestIds.has(id));
    out[v.id] = ids;
  }
  return out;
}

/**
 * Score chaque variante en parallèle puis calcule `delta_vs_best`.
 *
 * @param {Array<{ id: string, layout?: object, label?: string, recommendedTemplateId?: string }>} variants
 * @param {object} [cv]
 * @param {object} [options]
 * @param {(path: string, body: object) => Promise<object>} [options.fetcher]
 * @param {boolean} [options.includeLayout=false] conserver layout dans la sortie
 * @returns {Promise<{ variants: Array, best_total: number, differential_rule_ids: object }>}
 */
export async function scoreImportLayoutVariants(variants, cv = {}, options = {}) {
  const list = Array.isArray(variants) ? variants : [];
  if (list.length === 0) {
    return { variants: [], best_total: 0, differential_rule_ids: {} };
  }

  const { fetcher, includeLayout = false } = options;

  const scored = await Promise.all(
    list.map(async (variant) => {
      if (!variant?.id) {
        throw new Error('scoreImportLayoutVariants: variant.id required');
      }
      if (!variant.layout || typeof variant.layout !== 'object') {
        throw new Error(`scoreImportLayoutVariants: layout missing for ${variant.id}`);
      }
      const normalized = await fetchAtsScoreParsing(
        { layout: variant.layout, cv },
        fetcher ? { fetcher } : {},
      );
      const score_json = toScoreJson(normalized);
      const row = {
        id: variant.id,
        label: variant.label || variant.id,
        recommendedTemplateId: variant.recommendedTemplateId || '',
        importSource: variant.importSource || '',
        blockCount: variant.blockCount ?? 0,
        score_json,
      };
      if (includeLayout) row.layout = variant.layout;
      return row;
    }),
  );

  const withDelta = attachDeltaVsBest(scored);
  const best_total = withDelta.length
    ? Math.max(...withDelta.map((v) => Number(v.score_json?.total) || 0))
    : 0;

  return {
    variants: withDelta,
    best_total,
    differential_rule_ids: listDifferentialRuleIds(withDelta),
  };
}
