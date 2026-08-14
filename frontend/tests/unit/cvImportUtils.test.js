import assert from 'node:assert/strict';
import test from 'node:test';

import { extractImportApiResponse } from '../../src/lib/cvImportUtils.js';

test('extractImportApiResponse : import_policy exposé', () => {
  const result = extractImportApiResponse({
    cv: { prenom: 'Camille' },
    layout_hints: { template_match: 'minimal' },
    layout: null,
    vision: { source: 'gemini_vision' },
    import_policy: {
      ocr: false,
      layout_fallback: 'text_ai_vision_or_preset',
      message: 'note policy',
    },
  });
  assert.equal(result.cv.prenom, 'Camille');
  assert.equal(result.importPolicy?.ocr, false);
  assert.equal(result.importPolicy?.layout_fallback, 'text_ai_vision_or_preset');
  assert.equal(result.importPolicy?.message, 'note policy');
});

test('extractImportApiResponse : sans policy → null', () => {
  const result = extractImportApiResponse({ cv: { nom: 'Durand' } });
  assert.equal(result.importPolicy, null);
});
