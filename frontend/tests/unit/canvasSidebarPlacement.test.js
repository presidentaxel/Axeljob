/**
 * Tests unitaires drag-from-sidebar (AXE-33).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANVAS_BLOCK_PRESET_MIME,
  dataTransferHasBlockPreset,
  parseBlockPreset,
  placementPartialAtPoint,
  serializeBlockPreset,
} from '../../src/lib/canvasSidebarPlacement.js';

test('serializeBlockPreset / parseBlockPreset round-trip', () => {
  const preset = {
    type: 'experiences',
    bind: 'experiences',
    w: 80,
    h: 40,
    style: { section_label: 'EXP' },
  };
  const raw = serializeBlockPreset(preset);
  assert.ok(raw.includes('experiences'));
  const back = parseBlockPreset(raw);
  assert.equal(back.type, 'experiences');
  assert.equal(back.w, 80);
  assert.equal(back.bind, 'experiences');
});

test('serializeBlockPreset : invalide -> chaîne vide', () => {
  assert.equal(serializeBlockPreset(null), '');
  assert.equal(serializeBlockPreset({}), '');
  assert.equal(serializeBlockPreset({ type: 1 }), '');
});

test('parseBlockPreset : invalide -> null', () => {
  assert.equal(parseBlockPreset(null), null);
  assert.equal(parseBlockPreset('{'), null);
  assert.equal(parseBlockPreset('{"foo":1}'), null);
});

test('dataTransferHasBlockPreset', () => {
  assert.equal(dataTransferHasBlockPreset(null), false);
  assert.equal(
    dataTransferHasBlockPreset({ types: [CANVAS_BLOCK_PRESET_MIME] }),
    true,
  );
  assert.equal(
    dataTransferHasBlockPreset({ types: ['text/plain'] }),
    false,
  );
});

test('placementPartialAtPoint centre le bloc et retire placementMode', () => {
  const { x, y, partial } = placementPartialAtPoint(
    { type: 'text', content: 'Hi', w: 40, h: 10, placementMode: 'draw-rect' },
    100,
    50,
  );
  assert.equal(x, 80);
  assert.equal(y, 45);
  assert.equal(partial.type, 'text');
  assert.equal(partial.placementMode, undefined);
  assert.equal(partial.w, 40);
});
