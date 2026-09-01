/**
 * AXE-402 : les modales applicatives n’utilisent plus le markup legacy
 * `button button-primary` — uniquement <Button> / <Input>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = path.join(FRONTEND_ROOT, 'src');

const LEGACY_BUTTON_CLASS_RE =
  /(?:className|class)\s*=\s*(?:["'`][^"'`]*|\{\s*["'`][^"'`]*)\bbutton-(?:primary|secondary|tertiary|ghost|success)\b/;

const MODAL_COMPONENT_FILES = [
  'components/CvImportMergeModal.jsx',
  'components/ApplicationDetailModal.jsx',
];

const APP_MODAL_MARKERS = [
  'cv-edit-actions',
  'setup-modal-actions',
  'app-mobile-gate-actions',
  'linkedin-sync-modal',
  'upgrade-modal',
  'export-ats-block-actions',
  'ats-disclaimer-modal',
  'quali-modal',
];

function lineHasLegacyButtonClass(line) {
  return LEGACY_BUTTON_CLASS_RE.test(line);
}

test('CvImportMergeModal et ApplicationDetailModal n’ont plus de className button-*', async () => {
  const offenders = [];
  for (const rel of MODAL_COMPONENT_FILES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    text.split('\n').forEach((line, idx) => {
      if (lineHasLegacyButtonClass(line)) {
        offenders.push(`${rel}:${idx + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('ApplicationDetailModal et App importent Input pour les champs texte des modales', async () => {
  const app = await readFile(path.join(SRC, 'App.jsx'), 'utf8');
  const detail = await readFile(path.join(SRC, 'components/ApplicationDetailModal.jsx'), 'utf8');
  assert.match(app, /import Input from '\.\/components\/ui\/Input\.jsx'/);
  assert.match(detail, /import Input from '\.\/ui\/Input\.jsx'/);
  assert.match(app, /<Input type="text"/);
  assert.match(app, /<Input type="date"/);
  assert.match(detail, /<Input\s+type="text"/);
});

test('App.jsx : plus de markup button-* dans les footers de modales', async () => {
  const text = await readFile(path.join(SRC, 'App.jsx'), 'utf8');
  const lines = text.split('\n');
  const offenders = [];
  lines.forEach((line, idx) => {
    if (!lineHasLegacyButtonClass(line)) return;
    const from = Math.max(0, idx - 25);
    const to = Math.min(lines.length, idx + 8);
    const windowText = lines.slice(from, to).join('\n');
    const inModal = APP_MODAL_MARKERS.some((marker) => windowText.includes(marker));
    if (inModal) {
      offenders.push(`App.jsx:${idx + 1}:${line.trim()}`);
    }
  });
  assert.deepEqual(offenders, []);
});
