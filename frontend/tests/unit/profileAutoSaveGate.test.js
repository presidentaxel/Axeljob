import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideProfileAutoSaveOnActiveChange,
  decideProfileAutoSaveOnCvChange,
} from '../../src/lib/profileAutoSaveGate.js';

test('chargement initial : skip le PUT (pas une édition)', () => {
  assert.equal(
    decideProfileAutoSaveOnCvChange({ loading: true, skipNext: true, isActive: true }),
    'wait',
  );
  assert.equal(
    decideProfileAutoSaveOnCvChange({ loading: false, skipNext: true, isActive: true }),
    'skip',
  );
});

test('édition sur le profil actif : debounce', () => {
  assert.equal(
    decideProfileAutoSaveOnCvChange({ loading: false, skipNext: false, isActive: true }),
    'schedule',
  );
});

test('cv change hors profil : ne pas PUT en arrière-plan', () => {
  assert.equal(
    decideProfileAutoSaveOnCvChange({ loading: false, skipNext: false, isActive: false }),
    'ignore',
  );
});

test('quitter le profil avec debounce pending : flush immédiat', () => {
  assert.equal(
    decideProfileAutoSaveOnActiveChange({ wasActive: true, isActive: false, hasPending: true }),
    'flush',
  );
});

test('quitter sans édition pending : pas de PUT', () => {
  assert.equal(
    decideProfileAutoSaveOnActiveChange({ wasActive: true, isActive: false, hasPending: false }),
    'noop',
  );
});

test('revenir sur le profil : pas de PUT non sollicité', () => {
  assert.equal(
    decideProfileAutoSaveOnActiveChange({ wasActive: false, isActive: true, hasPending: false }),
    'noop',
  );
  assert.equal(
    decideProfileAutoSaveOnActiveChange({ wasActive: false, isActive: true, hasPending: true }),
    'noop',
  );
});

test('rester sur le profil : le debounce n’est pas flushé', () => {
  assert.equal(
    decideProfileAutoSaveOnActiveChange({ wasActive: true, isActive: true, hasPending: true }),
    'noop',
  );
});
