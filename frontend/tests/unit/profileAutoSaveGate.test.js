import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProfileCvPutPayload,
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

test('PUT profil : omettre layout null pour ne pas effacer le canvas', () => {
  const withLayout = buildProfileCvPutPayload(
    { prenom: 'Ada', layout: { version: 3, pages: [{ blocks: [{ id: 'a' }] }] } },
    'minimal',
    { show_photo: true },
  );
  assert.equal(withLayout.prenom, 'Ada');
  assert.equal(withLayout.template_id, 'minimal');
  assert.equal(withLayout.layout.version, 3);

  const withoutLayout = buildProfileCvPutPayload({ prenom: 'Ada' }, 'minimal', {});
  assert.equal('layout' in withoutLayout, false);

  const nullLayout = buildProfileCvPutPayload({ prenom: 'Ada', layout: null }, 'minimal', {});
  assert.equal('layout' in nullLayout, false);
});
