import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlankLayoutV3, createStarterLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  INSERT_TOOLBAR_ITEMS,
  createInsertBlockPreset,
  getLastBlockIdOnPage,
  suggestNewBlockPlacement,
} from '../../src/lib/freeCanvasBlockPresets.js';

test('INSERT_TOOLBAR_ITEMS : 5 types', () => {
  assert.equal(INSERT_TOOLBAR_ITEMS.length, 5);
  assert.ok(INSERT_TOOLBAR_ITEMS.some((i) => i.type === 'text'));
});

test('createInsertBlockPreset : texte et trait', () => {
  const t = createInsertBlockPreset('text');
  assert.equal(t.type, 'text');
  assert.equal(t.content, 'Texte libre');
  const line = createInsertBlockPreset('shape:line');
  assert.equal(line.type, 'shape:line');
  assert.equal(createInsertBlockPreset('inconnu'), null);
});

test('suggestNewBlockPlacement : page vide -> marge', () => {
  const layout = createBlankLayoutV3();
  const p = createInsertBlockPreset('text');
  const place = suggestNewBlockPlacement(layout, 0, p);
  assert.equal(place.x, 10);
  assert.equal(place.y, 10);
  assert.ok(place.z >= 1);
});

test('suggestNewBlockPlacement : empile sous le starter', () => {
  const layout = createStarterLayoutV3();
  const p = createInsertBlockPreset('title');
  const place = suggestNewBlockPlacement(layout, 0, p);
  assert.ok(place.y > 100);
});

test('getLastBlockIdOnPage', () => {
  const layout = createStarterLayoutV3();
  const id = getLastBlockIdOnPage(layout, 0);
  assert.ok(typeof id === 'string' && id.length > 0);
});
