import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RELANCE_DAYS,
  parseApplicationDate,
  isApplicationToFollowUp,
  computeApplicationMetrics,
} from '../../src/lib/applicationStats.js';

test('parseApplicationDate accepte jour seul et datetime UTC', () => {
  const day = parseApplicationDate('2026-01-10');
  assert.ok(day instanceof Date);
  assert.equal(day.getFullYear(), 2026);
  assert.equal(day.getMonth(), 0);
  assert.equal(day.getDate(), 10);

  const withTime = parseApplicationDate('2026-01-10 14:30');
  assert.ok(withTime instanceof Date);
  assert.equal(withTime.toISOString().slice(0, 16), '2026-01-10T14:30');
});

test('parseApplicationDate refuse les valeurs invalides', () => {
  assert.equal(parseApplicationDate(''), null);
  assert.equal(parseApplicationDate(null), null);
  assert.equal(parseApplicationDate('hier'), null);
});

test('isApplicationToFollowUp : 14j+ en attente', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(
    isApplicationToFollowUp(
      { statut: 'candidature_envoyee', date: '2026-08-01', archived: false },
      { now },
    ),
    true,
  );
  assert.equal(
    isApplicationToFollowUp(
      { statut: 'candidature_envoyee', date: '2026-08-20', archived: false },
      { now },
    ),
    false,
  );
  assert.equal(
    isApplicationToFollowUp(
      { statut: 'interview', date: '2026-07-01', archived: false },
      { now },
    ),
    false,
  );
  assert.equal(
    isApplicationToFollowUp(
      { statut: 'candidature_envoyee', date: '2026-07-01', archived: true },
      { now },
    ),
    false,
  );
});

test('computeApplicationMetrics : total, relance, taux, délai', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  const metrics = computeApplicationMetrics(
    [
      { statut: 'candidature_envoyee', date: '2026-08-01', archived: false },
      { statut: 'a_postuler', date: '2026-07-01', archived: false },
      {
        statut: 'reponse_recue',
        date_envoi: '2026-08-01',
        date_reponse: '2026-08-11',
        archived: false,
      },
      {
        statut: 'refus',
        date_envoi: '2026-08-01',
        date_reponse: '2026-08-05',
        archived: false,
      },
      { statut: 'offre', date: '2026-08-10', archived: true },
    ],
    { now },
  );

  assert.equal(metrics.total, 4);
  assert.equal(metrics.toFollowUp, 2);
  assert.equal(metrics.sent, 3);
  assert.equal(metrics.responded, 2);
  assert.equal(metrics.responseRatePct, 67);
  assert.equal(metrics.avgResponseDays, 7);
  assert.equal(RELANCE_DAYS, 14);
});

test('computeApplicationMetrics : sans envoi → taux et délai null', () => {
  const metrics = computeApplicationMetrics([
    { statut: 'a_postuler', date: '2026-08-01', archived: false },
  ]);
  assert.equal(metrics.total, 1);
  assert.equal(metrics.responseRatePct, null);
  assert.equal(metrics.avgResponseDays, null);
});
