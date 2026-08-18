/**
 * Tests formats d’export canvas (AXE-330).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANVAS_EXPORT_FORMATS,
  DOCX_FIDELITY_NOTICE_DISMISSED_KEY,
  buildCanvasExportFilename,
  dismissDocxFidelityNotice,
  formatCanvasExportError,
  isCanvasExportFormat,
  isDocxFidelityNoticeDismissed,
} from '../../src/lib/canvasExportFormats.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  installLocalStorage();
});

test('exposes pdf docx html txt', () => {
  assert.deepEqual(
    CANVAS_EXPORT_FORMATS.map((f) => f.id),
    ['pdf', 'docx', 'html', 'txt'],
  );
  assert.equal(isCanvasExportFormat('pdf'), true);
  assert.equal(isCanvasExportFormat('docx'), true);
  assert.equal(isCanvasExportFormat('png'), false);
});

test('buildCanvasExportFilename switches extension', () => {
  const cv = { prenom: 'Ada', nom: 'Lovelace', titre_professionnel: 'Analyste' };
  assert.match(buildCanvasExportFilename(cv, 'pdf'), /\.pdf$/);
  assert.match(buildCanvasExportFilename(cv, 'html'), /\.html$/);
  assert.match(buildCanvasExportFilename(cv, 'txt'), /\.txt$/);
  assert.match(buildCanvasExportFilename(cv, 'docx'), /\.docx$/);
  assert.ok(buildCanvasExportFilename(cv, 'pdf').includes('Ada'));
});

test('formatCanvasExportError keeps API message', () => {
  assert.match(
    formatCanvasExportError({ message: 'Format non supporté' }, '', 'docx'),
    /Format non supporté/,
  );
});

test('docx fidelity notice dismiss persists in localStorage', () => {
  assert.equal(isDocxFidelityNoticeDismissed(), false);
  dismissDocxFidelityNotice();
  assert.equal(isDocxFidelityNoticeDismissed(), true);
  assert.equal(localStorage.getItem(DOCX_FIDELITY_NOTICE_DISMISSED_KEY), '1');
});
