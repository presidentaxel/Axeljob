/**
 * Préférence langue d’adaptation (AXE-357).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptLanguagePrefKey,
  clearAdaptLanguagePreference,
  getAdaptLanguagePreference,
  normalizeAdaptLanguagePolicy,
  resolveAdaptLanguageAutoChoice,
  setAdaptLanguagePreference,
} from '../../src/lib/adaptLanguagePreference.js';

const store = new Map();

beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
});

test('normalizeAdaptLanguagePolicy n’accepte que cv / offer', () => {
  assert.equal(normalizeAdaptLanguagePolicy('cv'), 'cv');
  assert.equal(normalizeAdaptLanguagePolicy('offer'), 'offer');
  assert.equal(normalizeAdaptLanguagePolicy('annonce'), null);
  assert.equal(normalizeAdaptLanguagePolicy(''), null);
});

test('get / set / clear par utilisateur', () => {
  const uid = 'user-1';
  assert.equal(getAdaptLanguagePreference(uid), null);
  assert.equal(setAdaptLanguagePreference(uid, 'offer'), 'offer');
  assert.equal(getAdaptLanguagePreference(uid), 'offer');
  assert.equal(localStorage.getItem(adaptLanguagePrefKey(uid)), 'offer');
  assert.equal(getAdaptLanguagePreference('other'), null);
  clearAdaptLanguagePreference(uid);
  assert.equal(getAdaptLanguagePreference(uid), null);
});

test('resolveAdaptLanguageAutoChoice : mismatch + préférence = pas de popup', () => {
  assert.deepEqual(resolveAdaptLanguageAutoChoice(false, 'u1'), {
    outputLanguage: 'cv',
    remembered: false,
    prompt: false,
  });
  assert.deepEqual(resolveAdaptLanguageAutoChoice(true, 'u1'), {
    outputLanguage: null,
    remembered: false,
    prompt: true,
  });
  setAdaptLanguagePreference('u1', 'cv');
  assert.deepEqual(resolveAdaptLanguageAutoChoice(true, 'u1'), {
    outputLanguage: 'cv',
    remembered: true,
    prompt: false,
  });
});
