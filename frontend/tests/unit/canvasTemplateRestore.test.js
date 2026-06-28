import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCanvasLayoutForTemplate } from '../../src/lib/layoutTemplatePresets.js';
import {
  mergeTemplateBaseWithDraft,
  resolveTemplateContextLayout,
  templateStructuralBlockKey,
} from '../../src/lib/canvasTemplateRestore.js';
import { removeBlock } from '../../src/lib/cvLayoutModelV3.js';

const template = { id: 'modern', name: 'Moderne' };

test('templateStructuralBlockKey distingue deux bandeaux', () => {
  const a = { type: 'shape:rect', x: 0, y: 0, w: 50, h: 297, style: { color: '#111' } };
  const b = { type: 'shape:rect', x: 50, y: 0, w: 160, h: 40, style: { color: '#222' } };
  assert.notEqual(templateStructuralBlockKey(a), templateStructuralBlockKey(b));
});

test('mergeTemplateBaseWithDraft réinjecte un bandeau supprimé', () => {
  const base = createCanvasLayoutForTemplate(template);
  const removedId = base.pages[0].blocks.find((b) => b.type === 'shape:rect')?.id;
  assert.ok(removedId);
  const draft = removeBlock(base, removedId);
  const baseRects = base.pages[0].blocks.filter((b) => b.type === 'shape:rect').length;
  const draftRects = draft.pages[0].blocks.filter((b) => b.type === 'shape:rect').length;
  assert.ok(draftRects < baseRects);

  const merged = mergeTemplateBaseWithDraft(base, draft);
  assert.equal(
    merged.pages[0].blocks.filter((b) => b.type === 'shape:rect').length,
    baseRects,
  );
});

test('resolveTemplateContextLayout fusionne pour template:* seulement', () => {
  const base = createCanvasLayoutForTemplate(template);
  const draft = { ...base, pages: [{ ...base.pages[0], blocks: base.pages[0].blocks.slice(1) }] };
  const restored = resolveTemplateContextLayout('template:modern', base, draft);
  assert.ok(restored.pages[0].blocks.length >= draft.pages[0].blocks.length);
  const untouched = resolveTemplateContextLayout('imported', base, draft);
  assert.equal(untouched.pages[0].blocks.length, draft.pages[0].blocks.length);
});
