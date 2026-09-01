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
