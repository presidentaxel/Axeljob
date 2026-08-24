/**
 * Notice langue post-adaptation (AXE-357).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptLanguageChoiceCopy,
  adaptLanguageNotice,
  shouldPromptLanguageChoice,
  withAdaptLanguageNotice,
} from '../../src/lib/adaptLanguageNotice.js';

test('même langue : pas de notice ni de popup', () => {
  assert.equal(
    adaptLanguageNotice({ code: 'fr', mixed: false }, { code: 'fr', confidence: 0.9 }),
    '',
  );
  assert.equal(
    shouldPromptLanguageChoice({ code: 'fr', confidence: 0.9 }, { code: 'fr', confidence: 0.9 }),
    false,
  );
});

test('CV FR + offre EN : popup + notice de non-traduction (choix CV)', () => {
  const cv = { code: 'fr', mixed: false, confidence: 0.9 };
  const offer = { code: 'en', confidence: 0.8 };
  assert.equal(shouldPromptLanguageChoice(cv, offer), true);
  const n = adaptLanguageNotice(cv, offer, 'cv');
  assert.match(n, /annonce est en anglais/i);
  assert.match(n, /reste en français/i);
  const copy = adaptLanguageChoiceCopy(cv, offer);
  assert.ok(copy);
  assert.match(copy.message, /CV est en français/);
  assert.match(copy.keepLabel, /français/);
  assert.match(copy.offerLabel, /anglais/);
});

test('choix langue de l’annonce : notice de traduction', () => {
  const n = adaptLanguageNotice(
    { code: 'fr', mixed: false, confidence: 0.9 },
    { code: 'en', confidence: 0.8 },
    'offer',
  );
  assert.match(n, /traduit et adapté/i);
  assert.match(n, /anglais/);
  assert.match(n, /sans inventer/);
});

test('CV EN + offre FR : notice inverse', () => {
  const n = adaptLanguageNotice({ code: 'en', mixed: false }, { code: 'fr', confidence: 0.8 }, 'cv');
  assert.match(n, /annonce est en français/i);
  assert.match(n, /reste en anglais/i);
});

test('CV mixte : message clair, pas de silent wrong-language', () => {
  const n = adaptLanguageNotice({ code: 'fr', mixed: true }, { code: 'en', confidence: 0.9 }, 'cv');
  assert.match(n, /mélange/i);
  assert.match(n, /français/);
  assert.match(n, /Relis/i);
});

test('withAdaptLanguageNotice concatène sans casser le résumé', () => {
  const s = withAdaptLanguageNotice(
    'CV adapté (score ATS : 80/100).',
    { code: 'fr', mixed: false },
    { code: 'en', confidence: 1 },
    'cv',
  );
  assert.match(s, /^CV adapté/);
  assert.match(s, /reste en français/);
});

test('offre sans confiance : pas de popup', () => {
  assert.equal(
    shouldPromptLanguageChoice({ code: 'fr', confidence: 0.9 }, { code: 'en', confidence: 0 }),
    false,
  );
});
