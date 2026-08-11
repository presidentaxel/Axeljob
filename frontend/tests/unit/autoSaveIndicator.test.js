/**
 * Tests unitaires du helper `formatRelativeTime` expose par
 * `components/editor/AutoSaveIndicator.jsx`.
 *
 * On teste uniquement la fonction pure (formatage). Le composant React
 * lui-meme est couvert par un test e2e visuel dans un commit ulterieur.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatRelativeTime } from '../../src/lib/relativeTimeFormat.js';

test('moins de 5 secondes -> "a l instant"', () => {
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts + 0), 'à l’instant');
  assert.equal(formatRelativeTime(ts, ts + 4000), 'à l’instant');
});

test('moins de 60 secondes -> "il y a N s"', () => {
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts + 5000), 'il y a 5 s');
  assert.equal(formatRelativeTime(ts, ts + 30_000), 'il y a 30 s');
  assert.equal(formatRelativeTime(ts, ts + 59_999), 'il y a 59 s');
});

test('moins de 60 minutes -> "il y a N min"', () => {
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts + 60_000), 'il y a 1 min');
  assert.equal(formatRelativeTime(ts, ts + 1800_000), 'il y a 30 min');
});

test('moins de 24 h -> "il y a N h"', () => {
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts + 3600_000), 'il y a 1 h');
  assert.equal(formatRelativeTime(ts, ts + 12 * 3600_000), 'il y a 12 h');
});

test('plus de 24 h -> "plus de 24 h"', () => {
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts + 25 * 3600_000), 'plus de 24 h');
});

test('input invalide -> chaine vide', () => {
  assert.equal(formatRelativeTime(null), '');
  assert.equal(formatRelativeTime(undefined), '');
  assert.equal(formatRelativeTime(NaN), '');
});

test('delta negatif (horloge a la traine) -> "a l instant"', () => {
  // Si l horloge client est en avance par rapport au serveur, on ne veut
  // pas afficher "il y a -5 s". On clampe a 0 -> "a l instant".
  const ts = 1_000_000;
  assert.equal(formatRelativeTime(ts, ts - 1000), 'à l’instant');
});
