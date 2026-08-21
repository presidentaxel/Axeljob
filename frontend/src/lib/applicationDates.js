/**
 * Affichage dates candidatures : heure stockée en UTC (YYYY-MM-DD HH:mm) → fuseau local ;
 * date seule (legacy) sans heure à minuit.
 */

/**
 * @param {string | null | undefined} dateStr
 * @returns {Date | null}
 */
export function parseApplicationDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  if (m[4] != null && m[5] != null) {
    return new Date(Date.UTC(y, mo, d, parseInt(m[4], 10), parseInt(m[5], 10)));
  }
  return new Date(y, mo, d);
}

/**
 * Affichage absolu (liste / tooltip) : UTC → fuseau local si heure présente.
 * @param {string | null | undefined} dateStr
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

/**
 * Date relative pour cartes kanban (« il y a 12 j »).
 * @param {string | null | undefined} dateStr
 * @param {{ now?: Date }} [opts]
 */
export function formatApplicationRelativeLabel(dateStr, { now = new Date() } = {}) {
  const d = parseApplicationDate(dateStr);
  if (!d) return formatApplicationDateLabel(dateStr) || '';
  const diffMs = now.getTime() - d.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return formatApplicationDateLabel(dateStr);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
}
