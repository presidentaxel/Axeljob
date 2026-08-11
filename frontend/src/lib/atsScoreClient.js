/**
 * Client front pour `POST /api/ats/score-parsing`.
 *
 * Module **pur** (pas de dépendance React, pas d'accès direct au DOM)
 * pour rester testable via `node --test`. La fonction `fetchAtsScoreParsing`
 * accepte un `fetcher` injectable, qui est par défaut `apiPost` ; en test
 * on injecte un mock.
 *
 * Format de réponse attendue (cf. `backend/services/ats_score/serialization.py`) :
 * ```
 * {
 *   "kind": "parsing",
 *   "total": 95,
 *   "version": "2026.05",
 *   "rules": [
 *     { "id": "malus_sidebar_present", "label": "...", "delta": -5, "severity": "warning" }
 *   ]
 * }
 * ```
 */

export const ATS_SCORE_PARSING_ENDPOINT = '/api/ats/score-parsing';

/**
 * Default fetcher : lazy import de `apiPost` pour ne pas alourdir le module
 * au load (et surtout pour rester utilisable sous `node --test` qui ne peut
 * pas resoudre certains imports de `api.js`).
 */
let cachedApiPost = null;
async function defaultFetcher(path, body) {
  if (!cachedApiPost) {
    const mod = await import('../api.js');
    cachedApiPost = mod.apiPost;
  }
  return cachedApiPost(path, body);
}

/**
 * Normalise le payload d'entrée et écarte les clés vides pour minimiser
 * la surface qui change l'identité du body (utile pour le cache éventuel).
 */
export function buildAtsScoreParsingPayload({ templateId, layout, cv } = {}) {
  const payload = {};
  if (typeof templateId === 'string' && templateId.trim().length > 0) {
    payload.template_id = templateId.trim();
  }
  if (layout && typeof layout === 'object' && Object.keys(layout).length > 0) {
    payload.layout = layout;
  }
  if (cv && typeof cv === 'object') {
    payload.cv = cv;
  }
  return payload;
}

/**
 * Appelle l'API ATS et retourne un résultat **normalisé**.
 *
 * Toujours retourne `{ score, version, kind, rules: [...] }`. En cas d'erreur,
 * lève une exception (laisse l'appelant gérer l'UI).
 *
 * @param {{templateId?: string, layout?: object, cv?: object}} input
 * @param {{fetcher?: (path: string, body: object) => Promise<any>}} [options]
 * @returns {Promise<{score: number, version: string, kind: string, rules: Array}>}
 */
export async function fetchAtsScoreParsing(input, { fetcher = defaultFetcher } = {}) {
  const payload = buildAtsScoreParsingPayload(input);
  if (!payload.template_id && !payload.layout) {
    throw new Error('fetchAtsScoreParsing requires template_id or layout');
  }
  const raw = await fetcher(ATS_SCORE_PARSING_ENDPOINT, payload);
  return normalizeAtsScoreResponse(raw);
}

/**
 * Convertit la réponse brute API en shape stable et défensive.
 *
 * Tolère les variations mineures (score / total, rules / rules_triggered)
 * et clamp le score dans `[0, 100]`. Si la réponse est invalide, lance
 * une exception explicite.
 */
export function normalizeAtsScoreResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Reponse ATS invalide');
  }
  const rawScore = typeof raw.total === 'number' ? raw.total
    : typeof raw.score === 'number' ? raw.score
    : null;
  if (rawScore === null) {
    throw new Error('Score ATS manquant dans la reponse');
  }
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const rulesSource = Array.isArray(raw.rules) ? raw.rules
    : Array.isArray(raw.rules_triggered) ? raw.rules_triggered
    : [];
  return {
    score,
    version: typeof raw.version === 'string' ? raw.version : '',
    kind: typeof raw.kind === 'string' ? raw.kind : 'parsing',
    rules: rulesSource.map(normalizeRule).filter(Boolean),
  };
}

function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const id = typeof rule.id === 'string' ? rule.id : null;
  if (!id) return null;
  return {
    id,
    label: typeof rule.label === 'string' ? rule.label : id,
    delta: Number.isFinite(rule.delta) ? rule.delta : 0,
    severity: typeof rule.severity === 'string' ? rule.severity : 'info',
  };
}

/**
 * Bucketise un score parsing en tonalité UI ("good" / "meh" / "bad").
 *
 * Seuils alignés sur les cibles produit (cf. `docs/editor-vision.md`
 * section 9). À synchroniser si on recalibre.
 */
export function scoreToneFor(score) {
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 90) return 'good';
  if (score >= 70) return 'meh';
  return 'bad';
}
