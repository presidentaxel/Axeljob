/**
 * Notice langue post-adaptation (AXE-357).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adaptLanguageNotice, withAdaptLanguageNotice } from '../../src/lib/adaptLanguageNotice.js';

test('même langue : pas de notice', () => {
  assert.equal(
    adaptLanguageNotice({ code: 'fr', mixed: false }, { code: 'fr', confidence: 0.9 }),
    '',
  );
  assert.equal(
    adaptLanguageNotice({ code: 'en', mixed: false }, { code: 'en', confidence: 0.9 }),
    '',
  );
});

test('CV FR + offre EN : notice de non-traduction', () => {
  const n = adaptLanguageNotice({ code: 'fr', mixed: false }, { code: 'en', confidence: 0.8 });
  assert.match(n, /annonce est en anglais/i);
  assert.match(n, /reste en français/i);
});

test('CV EN + offre FR : notice inverse', () => {
  const n = adaptLanguageNotice({ code: 'en', mixed: false }, { code: 'fr', confidence: 0.8 });
  assert.match(n, /annonce est en français/i);
  assert.match(n, /reste en anglais/i);
});

test('CV mixte : message clair, pas de silent wrong-language', () => {
  const n = adaptLanguageNotice({ code: 'fr', mixed: true }, { code: 'en', confidence: 0.9 });
  assert.match(n, /mélange/i);
  assert.match(n, /français/);
  assert.match(n, /Relis/i);
});

test('withAdaptLanguageNotice concatène sans casser le résumé', () => {
  const s = withAdaptLanguageNotice(
    'CV adapté (score ATS : 80/100).',
    { code: 'fr', mixed: false },
    { code: 'en', confidence: 1 },
  );
  assert.match(s, /^CV adapté/);
  assert.match(s, /reste en français/);
});
