/**
 * Convention de nommage des boutons (docs/DESIGN-cohere.md).
 *
 * Exécution : `npm run test:unit`
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  buttonClassName,
} from '../../src/lib/buttonClassName.js';

const SRC_ROOT = fileURLToPath(new URL('../../src', import.meta.url));

const LEGACY_CTA_CLASS_RE = /\b(?:className|class)\s*=\s*["'`][^"'`]*\bbtn-(?:primary|secondary|tertiary|success|ghost|outline)\b/;

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(full));
    } else if (/\.(jsx|js|html)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test('buttonClassName compose button + button-primary par défaut', () => {
  assert.equal(buttonClassName(), 'button button-primary');
  assert.equal(buttonClassName({ variant: 'primary' }), 'button button-primary');
});

test('buttonClassName accepte size et className extra', () => {
  assert.equal(
    buttonClassName({ variant: 'primary', size: 'sm', className: 'profile-save-btn' }),
    'button button-primary button--sm profile-save-btn',
  );
  assert.equal(
    buttonClassName({ variant: 'secondary', size: 'lg' }),
    'button button-secondary button--lg',
  );
  assert.equal(
    buttonClassName({ variant: 'outline' }),
    'button button-pill-outline',
  );
});

test('buttonClassName refuse un variant ou une taille inconnus', () => {
  assert.throws(() => buttonClassName({ variant: 'cta' }), /Unknown button variant/);
  assert.throws(() => buttonClassName({ size: 'xl' }), /Unknown button size/);
});

test('les variants canoniques matchent le design system', () => {
  assert.equal(BUTTON_VARIANTS.primary, 'button-primary');
  assert.equal(BUTTON_VARIANTS.secondary, 'button-secondary');
  assert.equal(BUTTON_VARIANTS.outline, 'button-pill-outline');
  assert.equal(BUTTON_SIZES.sm, 'button--sm');
  assert.equal(BUTTON_SIZES.lg, 'button--lg');
});

test('aucun markup CTA ne réutilise btn-primary (ni les autres btn-*)', async () => {
  const files = await walkFiles(SRC_ROOT);
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(SRC_ROOT, file);
    const text = await readFile(file, 'utf8');
    if (LEGACY_CTA_CLASS_RE.test(text)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});
