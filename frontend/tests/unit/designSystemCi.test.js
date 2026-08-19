import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENERATED_TOKENS_CSS,
  evaluateHexLint,
  findHexMatches,
  loadAllowlist,
} from '../../scripts/lint-css-hex.mjs';
import { checkTokenDrift } from '../../scripts/check-token-drift.mjs';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ALLOWLIST_PATH = path.join(FRONTEND_ROOT, 'scripts/css-hex-allowlist.json');

test('findHexMatches attrape #rgb, #rrggbb et le fallback var(--token, #hex)', () => {
  const css = `
    color: #fff;
    background: #17171c;
    outline: 2px solid var(--color-focus-blue, #4c6ee6);
    fill: url(#clip);
  `;
  const matches = findHexMatches(css);
  assert.deepEqual(matches, ['#fff', '#17171c', '#4c6ee6']);
  assert.equal(matches.includes('#clip'), false);
});

test('evaluateHexLint ignore le CSS généré et refuse le hex hors allowlist', () => {
  const { offenders, cleanAllowlist, generatedOnAllowlist } = evaluateHexLint({
    files: [
      { rel: GENERATED_TOKENS_CSS, text: '--ds-color-neutral-900: #17171c;' },
      { rel: 'styles/app/buttons.css', text: 'color: #ff0000;' },
      { rel: 'styles/app/chat.css', text: 'color: #fff;' },
      { rel: 'styles/clean.css', text: 'color: var(--ds-color-text-default);' },
    ],
    allowlist: ['styles/app/chat.css', 'styles/clean.css'],
  });
  assert.equal(generatedOnAllowlist, false);
  assert.deepEqual(offenders, [{ file: 'styles/app/buttons.css', matches: ['#ff0000'] }]);
  assert.deepEqual(cleanAllowlist, ['styles/clean.css']);
});

test('evaluateHexLint refuse ds-tokens.generated.css dans l’allowlist', () => {
  const { generatedOnAllowlist } = evaluateHexLint({
    files: [{ rel: GENERATED_TOKENS_CSS, text: '#fff' }],
    allowlist: [GENERATED_TOKENS_CSS],
  });
  assert.equal(generatedOnAllowlist, true);
});

test('l’allowlist réelle est du JSON avec des chemins posix', async () => {
  const files = loadAllowlist(await readFile(ALLOWLIST_PATH, 'utf8'));
  assert.ok(files.length > 0);
  assert.ok(!files.includes(GENERATED_TOKENS_CSS));
  for (const rel of files) {
    assert.equal(rel.includes('\\'), false);
    assert.equal(rel.startsWith('/'), false);
  }
});

test('checkTokenDrift est vert sur le working tree actuel', () => {
  const result = checkTokenDrift();
  assert.equal(result.ok, true, result.message);
});
