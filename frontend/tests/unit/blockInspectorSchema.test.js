import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockHasEditableContent,
  blockIsSemanticBound,
  getBlockContentFields,
  getBlockDisplayName,
  getBlockStyleFields,
  getBlockTypeLabel,
} from '../../src/lib/blockInspectorSchema.js';

test('getBlockTypeLabel', () => {
  assert.equal(getBlockTypeLabel('experiences'), 'Expériences');
  assert.equal(getBlockTypeLabel('text'), 'Texte libre');
  assert.equal(getBlockTypeLabel('shape:rect'), 'Rectangle');
});

test('getBlockDisplayName : custom layer_label prioritaire', () => {
  assert.equal(getBlockDisplayName({ type: 'text' }), 'Texte libre');
  assert.equal(
    getBlockDisplayName({ type: 'shape:rect', style: { layer_label: 'Bandeau vert' } }),
    'Bandeau vert',
  );
});

test('blockIsSemanticBound', () => {
  assert.equal(blockIsSemanticBound({ type: 'resume' }), true);
  assert.equal(blockIsSemanticBound({ type: 'text' }), false);
});

test('getBlockContentFields : texte', () => {
  const fields = getBlockContentFields({ type: 'text', content: 'hi' });
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, 'content');
});

test('getBlockStyleFields : experiences compact', () => {
  const fields = getBlockStyleFields({ type: 'experiences', style: { format: 'compact' } });
  assert.ok(fields.some((f) => f.styleKey === 'format'));
});

test('blockHasEditableContent : semantic sans textarea content', () => {
  assert.equal(blockHasEditableContent({ type: 'resume' }), false);
  assert.equal(blockHasEditableContent({ type: 'experiences' }), true);
});
