/**
 * Tokens DTCG + convention Button (docs/design-system.md).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUTTON_SIZES,
  BUTTON_TONES,
  BUTTON_VARIANTS,
  buttonClassName,
} from '../../src/lib/buttonClassName.js';
import { inputClassName } from '../../src/lib/inputClassName.js';
import {
  buildTokensCss,
  flattenResolved,
  loadTokenTree,
  resolveValue,
} from '../../scripts/build-tokens.mjs';

const SRC_ROOT = fileURLToPath(new URL('../../src', import.meta.url));
const TOKENS_PATH = path.join(SRC_ROOT, 'design/tokens.json');
const GENERATED_CSS = path.join(SRC_ROOT, 'styles/ds-tokens.generated.css');

const LEGACY_CTA_CLASS_RE = /\b(?:className|class)\s*=\s*["'`][^"'`]*\bbtn-(?:primary|secondary|tertiary|success|ghost|outline)\b/;

const PRIMITIVE_COLOR_ROOTS = new Set(['neutral', 'green', 'navy', 'blue', 'coral', 'purple', 'red', 'amber']);

test('buttonClassName compose ds-button + primary + md par défaut', () => {
  const cls = buttonClassName();
  assert.match(cls, /\bds-button\b/);
  assert.match(cls, /\bds-button--primary\b/);
  assert.match(cls, /\bds-button--md\b/);
  assert.match(cls, /\bbutton-primary\b/);
});

test('buttonClassName accepte size, tone et className extra', () => {
  const cls = buttonClassName({
    variant: 'primary',
    size: 'sm',
    tone: 'inverse',
    className: 'profile-save-btn',
  });
  assert.match(cls, /\bds-button--sm\b/);
  assert.match(cls, /\bds-button--inverse\b/);
  assert.match(cls, /\bprofile-save-btn\b/);
});

test('API publique Button : 7 variants, pas outline', () => {
  assert.deepEqual(Object.keys(BUTTON_VARIANTS), [
    'primary',
    'secondary',
    'tertiary',
    'ghost',
    'link',
    'danger',
    'success',
  ]);
  assert.equal(BUTTON_VARIANTS.outline, undefined);
  assert.throws(() => buttonClassName({ variant: 'outline' }), /Unknown button variant/);
});

test('buttonClassName refuse un variant, size ou tone inconnu', () => {
  assert.throws(() => buttonClassName({ variant: 'cta' }), /Unknown button variant/);
  assert.throws(() => buttonClassName({ size: 'xl' }), /Unknown button size/);
  assert.throws(() => buttonClassName({ tone: 'dark' }), /Unknown button tone/);
});

test('les variants canoniques matchent le contrat', () => {
  assert.equal(BUTTON_VARIANTS.primary, 'ds-button--primary');
  assert.equal(BUTTON_SIZES.md, 'ds-button--md');
  assert.equal(BUTTON_TONES.inverse, 'ds-button--inverse');
});

test('inputClassName pose ds-input et l’état invalid', () => {
  assert.equal(inputClassName(), 'ds-input');
  assert.equal(inputClassName({ invalid: true }), 'ds-input ds-input--invalid');
});

test('les tokens sémantiques se résolvent sans hex dans la référence', async () => {
  const jsonText = await readFile(TOKENS_PATH, 'utf8');
  const tree = loadTokenTree(jsonText);
  const primary = resolveValue(tree, '{color.action.primary.bg}');
  assert.equal(primary, '#17171c');
  const hover = resolveValue(tree, '{color.action.primary.bg-hover}');
  assert.equal(hover, '#212121');
  const entries = flattenResolved(tree);
  const semanticAction = entries.find((e) => e.cssName === '--ds-color-action-primary-bg');
  assert.equal(semanticAction.value, '#17171c');
  const primitiveLeak = entries.filter(
    (e) => e.path[0] === 'color' && PRIMITIVE_COLOR_ROOTS.has(e.path[1]),
  );
  assert.ok(primitiveLeak.length > 0, 'primitives exist in the file');
  assert.ok(
    !semanticAction.path.includes('neutral'),
    'semantic action token is not a primitive path',
  );
});

test('size.touch.min est consommé par ds-button--sm (mobile)', async () => {
  const css = await readFile(path.join(SRC_ROOT, 'styles/app/buttons.css'), 'utf8');
  assert.match(css, /--ds-size-touch-min/);
  assert.match(css, /\.ds-button--sm/);
});

test('le CSS généré est à jour par rapport à tokens.json', async () => {
  const jsonText = await readFile(TOKENS_PATH, 'utf8');
  const { css } = buildTokensCss(jsonText);
  const onDisk = await readFile(GENERATED_CSS, 'utf8');
  assert.equal(onDisk, css);
});

test('aucun markup CTA ne réutilise btn-primary (ni les autres btn-*)', async () => {
  const { readdir } = await import('node:fs/promises');
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
