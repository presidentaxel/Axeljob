import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('confidentialite HTML + JSX déclarent Sentry hors CMP (AXE-366)', async () => {
  const html = await readFile(path.join(ROOT, 'public/confidentialite.html'), 'utf8');
  const jsx = await readFile(path.join(ROOT, 'src/components/LegalPages.jsx'), 'utf8');

  for (const [label, text] of [
    ['html', html],
    ['jsx', jsx],
  ]) {
    assert.match(text, /Sentry/, `${label} mentionne Sentry`);
    assert.match(text, /intérêt légitime/i, `${label} base légale`);
    assert.match(
      text,
      /Session Replay[^.]*n['’]est pas activ[ée]/i,
      `${label} Replay off`,
    );
    assert.match(
      text,
      /Aucun contenu de CV ni d['’]annonce n['’]est envoyé/i,
      `${label} CV et annonce non envoyés`,
    );
    assert.match(
      text,
      /Sentry[\s\S]{0,400}(?:Hors bandeau cookies|n['’]est pas soumis)/i,
      `${label} Sentry hors CMP`,
    );
    assert.match(
      text,
      /identifiant technique de compte sans e-mail/i,
      `${label} UUID opaque, pas d’email`,
    );
    assert.match(
      text,
      /type d['’]abonnement gratuit\/pro/i,
      `${label} tag plan`,
    );
  }
});
