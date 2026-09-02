/**
 * Décisions d’autosave du profil Stable (panel toujours monté, display:none hors /app/profil).
 * Aligné AXE-29 : flush en quittant, ne pas replanifier un PUT au retour.
 */

export function decideProfileAutoSaveOnCvChange({ loading, skipNext, isActive }) {
  if (loading) return 'wait';
  if (skipNext) return 'skip';
  if (!isActive) return 'ignore';
  return 'schedule';
}

export function decideProfileAutoSaveOnActiveChange({ wasActive, isActive, hasPending }) {
  if (wasActive && !isActive && hasPending) return 'flush';
  return 'noop';
}

/**
 * AXE-29 : flush aussi au démontage (toggle Beta), pagehide, onglet caché.
 * Pas de PUT si rien n’est pending.
 */
export function decideProfileAutoSaveOnLifecycle({ event, hasPending, visibilityState } = {}) {
  if (!hasPending) return 'noop';
  if (event === 'unmount' || event === 'pagehide') return 'flush';
  if (event === 'visibility' && visibilityState === 'hidden') return 'flush';
  return 'noop';
}

/** Fetch keepalive ~64 KiB ; rester sous la limite navigateur. */
export const PROFILE_KEEPALIVE_MAX_CHARS = 60_000;

export function profilePutShouldKeepalive(payload) {
  try {
    return JSON.stringify(payload).length <= PROFILE_KEEPALIVE_MAX_CHARS;
  } catch {
    return false;
  }
}

/**
 * Un seul PUT à la fois (comme `createAutoSaveScheduler` : flush no-op si
 * `kind === 'saving'`). Si une sauvegarde tourne déjà, on garde pending et
 * on rejoue après — sinon un PUT plus ancien peut écraser des edits plus
 * récentes, et `finally` coupe le garde `beforeunload` trop tôt.
 */
export function decideProfileSaveStart({ saving } = {}) {
  if (saving) return 'defer';
  return 'start';
}

export function decideProfileFlushStart({ hasPending, saving } = {}) {
  if (saving) return 'defer';
  if (!hasPending) return 'noop';
  return 'start';
}

export function decideProfileSaveFinish({ hasPending } = {}) {
  if (hasPending) return 'replay';
  return 'idle';
}

/** beforeunload : debounce pending OU PUT encore en vol (comme useAutoSave hasPendingChanges). */
export function profileHasUnloadGuard({ hasPending, saving } = {}) {
  return Boolean(hasPending || saving);
}

/**
 * PUT profil Stable : ne pas envoyer `layout: null` (ça efface le canvas Beta).
 * Si le formulaire n’a pas de layout, on omet la clé pour que le serveur conserve l’existant.
 */
export function buildProfileCvPutPayload(cv, templateId, templateOptions) {
  const payload = {
    ...(cv && typeof cv === 'object' ? cv : {}),
    template_id: templateId,
    template_options: templateOptions ?? {},
  };
  if (payload.layout == null) {
    delete payload.layout;
  }
  return payload;
}
