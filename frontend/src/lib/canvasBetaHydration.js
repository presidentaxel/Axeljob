/**
 * Hydratation first-run du canvas Beta (AXE-344 / AXE-345).
 *
 * Canvas vide → panel « Comment veux-tu commencer ? ».
 * Jamais de seed silencieux depuis le profil (page blanche / refresh).
 * Un layout déjà rempli (serveur ou brouillon local) est conservé.
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
  rawLayout = null,
  localDraftLayout = null,
} = {}) {
  const serverHasContent = Boolean(rawLayout) && !isEmptyLayoutV3(rawLayout);
  if (serverHasContent) {
    return { mode: 'server', seed: false, startup: false };
  }
  const draftHasContent = Boolean(localDraftLayout) && !isEmptyLayoutV3(localDraftLayout);
  if (draftHasContent) {
    return { mode: 'draft', seed: false, startup: false };
  }
  return { mode: 'blank', seed: false, startup: true };
}
