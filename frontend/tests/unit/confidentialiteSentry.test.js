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
    assert.match(text, /Session Replay/, `${label} Replay off`);
    assert.match(text, /CV/, `${label} CV non envoyé`);
    assert.match(text, /bandeau/, `${label} hors CMP`);
  }
});
