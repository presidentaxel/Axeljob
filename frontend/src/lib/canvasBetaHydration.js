/**
 * Hydratation first-run du canvas Beta (AXE-344 / AXE-345).
 *
 * L’auto-seed « depuis le profil » ne doit tourner que s’il n’y a **jamais**
 * eu de layout côté serveur. `layout: null` est un reset explicite
 * (Page blanche) : un refresh ne doit pas régénérer le CV.
 */

import { isEmptyLayoutV3 } from './cvLayoutModelV3.js';

/**
 * @param {{
 *   hasLayoutField?: boolean,
 *   rawLayout?: object|null,
 *   seedableProfile?: boolean,
 *   localDraftLayout?: object|null,
 * }} input
 * @returns {{ mode: 'server'|'draft'|'blank'|'seed', seed: boolean, startup: boolean }}
 */
export function decideBetaCanvasHydration({
  hasLayoutField = false,
  rawLayout = null,
  seedableProfile = false,
  localDraftLayout = null,
} = {}) {
  const serverHasContent = Boolean(rawLayout) && !isEmptyLayoutV3(rawLayout);
  if (serverHasContent) {
    return { mode: 'server', seed: false, startup: false };
  }
  // Clé `layout` présente (même à null) = choix persisté, pas un first-run.
  if (hasLayoutField) {
    return { mode: 'blank', seed: false, startup: false };
  }
  const draftHasContent = Boolean(localDraftLayout) && !isEmptyLayoutV3(localDraftLayout);
  if (draftHasContent) {
    return { mode: 'draft', seed: false, startup: false };
  }
  if (seedableProfile) {
    return { mode: 'seed', seed: true, startup: false };
  }
  return { mode: 'blank', seed: false, startup: true };
}
