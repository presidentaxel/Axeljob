/**
 * Dual-key FR/EN pour le profil CV (AXE-332).
 * Source de vérité historique : `prenom` / `nom` ; miroirs `first_name` / `last_name`.
 */

export const IDENTITY_DUAL_KEYS = Object.freeze([
  ['prenom', 'first_name'],
  ['nom', 'last_name'],
]);

function nonempty(value) {
  return String(value ?? '').trim();
}

/**
 * Synchronise prenom↔first_name et nom↔last_name.
 * Si les deux diffèrent, FR gagne.
 * @param {object} cv
 * @returns {object}
 */
export function syncCvDualKeys(cv) {
  const out = cv && typeof cv === 'object' ? { ...cv } : {};
  for (const [frKey, enKey] of IDENTITY_DUAL_KEYS) {
    const fr = nonempty(out[frKey]);
    const en = nonempty(out[enKey]);
    if (fr && en) {
      if (fr.toLowerCase() !== en.toLowerCase()) {
        out[enKey] = fr;
      } else {
        out[frKey] = fr;
        out[enKey] = en;
      }
    } else if (fr) {
      out[enKey] = fr;
    } else if (en) {
      out[frKey] = en;
      out[enKey] = en;
    } else {
      if (out[frKey] === undefined) out[frKey] = '';
      if (out[enKey] === undefined) out[enKey] = '';
    }
  }
  return out;
}
