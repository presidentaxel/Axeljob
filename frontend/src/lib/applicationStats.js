/**
 * Métriques actionnables du board Mes candidatures (AXE-378).
 *
 * Définitions (candidatures non archivées) :
 * - total : toutes
 * - à relancer : statut `a_postuler` | `candidature_envoyee` et date d’envoi
 *   (ou `date` liste) ≥ {@link RELANCE_DAYS} jours
 * - taux de réponse : (réponse reçue | entretien | offre | refus)
 *   / (toutes sauf `a_postuler`), en % arrondi
 * - délai moyen : moyenne des (date_reponse − date_envoi) en jours entiers,
 *   uniquement si les deux dates sont présentes (sinon null)
 */

import { STATUT_LABELS } from '../constants.js';

export const RELANCE_DAYS = 14;

const WAITING_STATUTS = new Set(['a_postuler', 'candidature_envoyee']);
const RESPONDED_STATUTS = new Set(['reponse_recue', 'interview', 'offre', 'refus']);

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

function resolveStatut(app) {
  const s = app?.statut;
  return s && s in STATUT_LABELS ? s : 'candidature_envoyee';
}

/**
 * @param {object} app
 * @param {{ now?: Date, relanceDays?: number }} [opts]
 */
export function isApplicationToFollowUp(app, { now = new Date(), relanceDays = RELANCE_DAYS } = {}) {
  if (!app || app.archived) return false;
  if (!WAITING_STATUTS.has(resolveStatut(app))) return false;
  const ref = parseApplicationDate(app.date_envoi || app.date);
  if (!ref) return false;
  const ms = now.getTime() - ref.getTime();
  return ms >= relanceDays * 24 * 60 * 60 * 1000;
}

/**
 * @param {object[]} applications
 * @param {{ now?: Date, relanceDays?: number }} [opts]
 */
export function computeApplicationMetrics(applications, { now = new Date(), relanceDays = RELANCE_DAYS } = {}) {
  const list = Array.isArray(applications) ? applications : [];
  const active = list.filter((a) => a && !a.archived);

  let toFollowUp = 0;
  let sent = 0;
  let responded = 0;
  const delays = [];

  for (const app of active) {
    const statut = resolveStatut(app);
    if (isApplicationToFollowUp(app, { now, relanceDays })) toFollowUp += 1;

    if (statut === 'a_postuler') continue;
    sent += 1;
    if (!RESPONDED_STATUTS.has(statut)) continue;
    responded += 1;

    const envoi = parseApplicationDate(app.date_envoi || app.date);
    const reponse = parseApplicationDate(app.date_reponse);
    if (envoi && reponse && reponse.getTime() >= envoi.getTime()) {
      delays.push((reponse.getTime() - envoi.getTime()) / (24 * 60 * 60 * 1000));
    }
  }

  return {
    total: active.length,
    toFollowUp,
    responseRatePct: sent > 0 ? Math.round((responded / sent) * 100) : null,
    avgResponseDays: delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    sent,
    responded,
  };
}
