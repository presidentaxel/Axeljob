import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  maybeEmitProductLogin,
  productLoginStorageKey,
  clearProductLoginSent,
} from '../../src/lib/productLogin.js';

function memoryStorage(initial = {}) {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
    key: (i) => Object.keys(map)[i] ?? null,
    get length() {
      return Object.keys(map).length;
    },
    _map: map,
  };
}

test('maybeEmitProductLogin ignore sans user.id', () => {
  const calls = [];
  assert.equal(maybeEmitProductLogin(null, (...a) => calls.push(a), memoryStorage()), false);
  assert.equal(maybeEmitProductLogin({}, (...a) => calls.push(a), memoryStorage()), false);
  assert.equal(calls.length, 0);
});

test('maybeEmitProductLogin émet login + method, 1× par user', () => {
  const calls = [];
  const emit = (...a) => calls.push(a);
  const store = memoryStorage();
  const user = { id: 'u1', app_metadata: { provider: 'google' } };

  assert.equal(maybeEmitProductLogin(user, emit, store), true);
  assert.deepEqual(calls, [['login', { method: 'google' }]]);
  assert.equal(store.getItem(productLoginStorageKey('u1')), '1');

  assert.equal(maybeEmitProductLogin(user, emit, store), false);
  assert.equal(calls.length, 1);
});

test('maybeEmitProductLogin linkedin_oidc → method linkedin', () => {
  const calls = [];
  maybeEmitProductLogin(
    { id: 'u2', identities: [{ provider: 'linkedin_oidc' }] },
    (...a) => calls.push(a),
    memoryStorage(),
  );
  assert.deepEqual(calls, [['login', { method: 'linkedin' }]]);
});

test('clearProductLoginSent réarme après logout', () => {
  const calls = [];
  const emit = (...a) => calls.push(a);
  const store = memoryStorage();
  const user = { id: 'u1', app_metadata: { provider: 'email' } };

  assert.equal(maybeEmitProductLogin(user, emit, store), true);
  assert.equal(maybeEmitProductLogin(user, emit, store), false);
  clearProductLoginSent(store);
  assert.equal(store.getItem(productLoginStorageKey('u1')), null);
  assert.equal(maybeEmitProductLogin(user, emit, store), true);
  assert.equal(calls.length, 2);
});
