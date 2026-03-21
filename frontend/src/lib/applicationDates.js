/**
 * Affichage dates candidatures : heure stockée en UTC (YYYY-MM-DD HH:mm) → fuseau local ;
 * date seule (legacy) sans heure à minuit.
 */
export function formatApplicationDateLabel(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
  const trimmed = dateStr.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) return trimmed;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (m[4] != null && m[5] != null) {
    const hh = parseInt(m[4], 10);
    const minute = parseInt(m[5], 10);
    const ms = Date.UTC(y, mo - 1, d, hh, minute);
    return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  return new Date(y, mo - 1, d).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
}
