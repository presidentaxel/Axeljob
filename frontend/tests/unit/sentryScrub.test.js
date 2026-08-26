import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FILTERED,
  isSensitiveUrl,
  scrubBreadcrumb,
  scrubEvent,
  tracesSampleRate,
} from '../../src/lib/sentryScrub.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('tracesSampleRate : staging 1, production 0.1, override numérique', () => {
  assert.equal(tracesSampleRate('staging'), 1);
  assert.equal(tracesSampleRate('production'), 0.1);
  assert.equal(tracesSampleRate('production', '0.25'), 0.25);
});

test('isSensitiveUrl filtre adapt/import/cv', () => {
  assert.equal(isSensitiveUrl('/api/adapt'), true);
  assert.equal(isSensitiveUrl('https://axeljob.fr/api/import-cv'), true);
  assert.equal(isSensitiveUrl('/api/health'), false);
});

test('scrubEvent retire CV, annonce, JWT, email', () => {
  const out = scrubEvent({
    message: 'boom',
    extra: { cv: 'Jean Dupont CV', annonce: 'Offre secrète' },
    request: {
      url: 'https://axeljob.fr/api/adapt',
      data: { cv: 'Jean Dupont CV' },
      headers: { Authorization: 'Bearer super-secret-jwt' },
    },
    user: { id: 'uuid-1', email: 'jean@example.com' },
  });
  const blob = JSON.stringify(out);
  assert.equal(blob.includes('Jean Dupont'), false);
  assert.equal(blob.includes('Offre secrète'), false);
  assert.equal(blob.includes('jean@example.com'), false);
  assert.equal(blob.includes('super-secret-jwt'), false);
  assert.equal(out.user.id, 'uuid-1');
  assert.equal(out.request.headers.Authorization, FILTERED);
});

test('scrubBreadcrumb retire le body fetch sur /api/adapt', () => {
  const out = scrubBreadcrumb({
    category: 'fetch',
    data: { url: '/api/adapt', body: '{"cv":"secret"}' },
  });
  assert.equal(out.data.body, FILTERED);
  assert.equal(JSON.stringify(out).includes('secret'), false);
});

test('vite plugin + pas de MODE + maps supprimées Dockerfile / nginx', async () => {
  const vite = await readFile(path.join(ROOT, 'vite.config.js'), 'utf8');
  const docker = await readFile(path.join(ROOT, 'Dockerfile'), 'utf8');
  const nginx = await readFile(path.join(ROOT, 'nginx.conf'), 'utf8');
  const sentry = await readFile(path.join(ROOT, 'src/lib/sentry.js'), 'utf8');
  assert.match(vite, /sentryVitePlugin/);
  assert.match(vite, /axel-job-frontend/);
  assert.equal(sentry.includes('import.meta.env.MODE'), false);
  assert.match(sentry, /VITE_SENTRY_ENVIRONMENT/);
  assert.match(sentry, /replaysSessionSampleRate: 0/);
  assert.match(docker, /SENTRY_AUTH_TOKEN/);
  assert.match(docker, /find \/app\/dist -name '\*\.map' -delete/);
  assert.equal(/ENV SENTRY_AUTH_TOKEN/.test(docker.split('FROM nginx')[1] || ''), false);
  assert.match(nginx, /\\.map\$/);
});
