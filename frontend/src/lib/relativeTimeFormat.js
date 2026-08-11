/**
 * Formatage d un timestamp en label relatif francais minimal
 * ("a l instant", "il y a 5 s", "il y a 2 min", "il y a 1 h",
 * "plus de 24 h").
 *
 * Module pur (sans dependance React) pour rester testable sous
 * `node --test`. Le composant `AutoSaveIndicator` l importe pour
 * afficher l horodatage de la derniere sauvegarde.
 */

/**
 * @param {number | null | undefined} timestampMs
 * @param {number} [nowMs=Date.now()]
 * @returns {string}
 */
export function formatRelativeTime(timestampMs, nowMs = Date.now()) {
  if (!Number.isFinite(timestampMs)) return '';
  const deltaSeconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (deltaSeconds < 5) return 'à l’instant';
  if (deltaSeconds < 60) return `il y a ${deltaSeconds} s`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return 'plus de 24 h';
}
