import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RELANCE_DAYS,
  parseApplicationDate,
  isApplicationToFollowUp,
  computeApplicationMetrics,
  getApplicationCardAccent,
} from '../../src/lib/applicationStats.js';

test('parseApplicationDate est réexporté depuis applicationStats', () => {
  assert.ok(parseApplicationDate('2026-01-10') instanceof Date);
});

test('getApplicationCardAccent : offre / refus / relancer', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(getApplicationCardAccent({ statut: 'offre', date: '2026-08-20' }, { now }), 'offre');
  assert.equal(getApplicationCardAccent({ statut: 'refus', date: '2026-08-20' }, { now }), 'refus');
  assert.equal(
    getApplicationCardAccent({ statut: 'candidature_envoyee', date: '2026-08-01' }, { now }),
    'relancer',
  );
  assert.equal(
    getApplicationCardAccent({ statut: 'candidature_envoyee', date: '2026-08-20' }, { now }),
    null,
  );
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
