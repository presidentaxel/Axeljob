import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseApplicationDate,
  formatApplicationDateLabel,
  formatApplicationRelativeLabel,
} from '../../src/lib/applicationDates.js';

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

test('formatApplicationRelativeLabel : jours / heures', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  assert.equal(formatApplicationRelativeLabel('2026-08-09 12:00', { now }), 'il y a 12 j');
  assert.equal(
    formatApplicationRelativeLabel('2026-08-21 10:00', { now }),
    'il y a 2 h',
  );
  assert.equal(formatApplicationRelativeLabel('', { now }), '');
});

test('formatApplicationDateLabel reste utilisable en tooltip', () => {
  const label = formatApplicationDateLabel('2026-08-09');
  assert.ok(typeof label === 'string' && label.length > 0);
});
