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
