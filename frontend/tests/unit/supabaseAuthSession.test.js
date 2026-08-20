import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_SESSION_TIMEOUT_MS,
  fetchAuthSessionWithTimeout,
} from '../../src/lib/supabaseAuthSession.js';

test('fetchAuthSessionWithTimeout retourne null sans client', async () => {
  assert.equal(await fetchAuthSessionWithTimeout(null), null);
  assert.equal(await fetchAuthSessionWithTimeout({}), null);
});

test('fetchAuthSessionWithTimeout propage la session', async () => {
  const session = { access_token: 'tok' };
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
    },
  };
  assert.equal(await fetchAuthSessionWithTimeout(client), session);
});

test('fetchAuthSessionWithTimeout catch → null', async () => {
  const client = {
    auth: {
      getSession: async () => {
        throw new Error('network');
      },
    },
  };
  assert.equal(await fetchAuthSessionWithTimeout(client), null);
});

test('fetchAuthSessionWithTimeout abandonne si getSession pend', async () => {
  const client = {
    auth: {
      getSession: () => new Promise(() => {}),
    },
  };
  const t0 = Date.now();
  const session = await fetchAuthSessionWithTimeout(client, 40);
  assert.equal(session, null);
  assert.ok(Date.now() - t0 < 500);
  assert.ok(AUTH_SESSION_TIMEOUT_MS >= 1000);
});
