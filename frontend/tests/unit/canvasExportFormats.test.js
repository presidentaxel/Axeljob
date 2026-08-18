/**
 * Tests formats d’export canvas (AXE-330).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANVAS_EXPORT_FORMATS,
  buildCanvasExportFilename,
  formatCanvasExportError,
  isCanvasExportFormat,
} from '../../src/lib/canvasExportFormats.js';

test('exposes pdf html txt', () => {
  assert.deepEqual(
    CANVAS_EXPORT_FORMATS.map((f) => f.id),
    ['pdf', 'html', 'txt'],
  );
  assert.equal(isCanvasExportFormat('pdf'), true);
  assert.equal(isCanvasExportFormat('docx'), false);
});

test('buildCanvasExportFilename switches extension', () => {
  const cv = { prenom: 'Ada', nom: 'Lovelace', titre_professionnel: 'Analyste' };
  assert.match(buildCanvasExportFilename(cv, 'pdf'), /\.pdf$/);
  assert.match(buildCanvasExportFilename(cv, 'html'), /\.html$/);
  assert.match(buildCanvasExportFilename(cv, 'txt'), /\.txt$/);
  assert.ok(buildCanvasExportFilename(cv, 'pdf').includes('Ada'));
});

test('formatCanvasExportError keeps API message', () => {
  assert.match(
    formatCanvasExportError({ message: 'Format non supporté' }, '', 'docx'),
    /Format non supporté/,
  );
});
