import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCK_MIN_WIDTH_MM } from '../../src/lib/cvLayoutModelV3.js';
import {
  RESIZE_HANDLES,
  computeResizedBlock,
  resizeGroupKey,
} from '../../src/lib/freeCanvasResize.js';

const START = { x: 10, y: 20, w: 50, h: 30 };

test('RESIZE_HANDLES et resizeGroupKey', () => {
  assert.equal(RESIZE_HANDLES.length, 4);
  assert.equal(resizeGroupKey('b1'), 'resize:b1');
});

test('computeResizedBlock : coin SE agrandit w et h', () => {
  const r = computeResizedBlock(START, 'se', { dx: 10, dy: 5 });
  assert.equal(r.x, 10);
  assert.equal(r.y, 20);
  assert.equal(r.w, 60);
  assert.equal(r.h, 35);
});

test('computeResizedBlock : coin SW deplace x', () => {
  const r = computeResizedBlock(START, 'sw', { dx: 5, dy: 0 });
  assert.equal(r.x, 15);
  assert.equal(r.w, 45);
});

test('computeResizedBlock : coin NW reduit et deplace x/y', () => {
  const r = computeResizedBlock(START, 'nw', { dx: 10, dy: 10 });
  assert.equal(r.x, 20);
  assert.equal(r.y, 30);
  assert.equal(r.w, 40);
  assert.equal(r.h, 20);
});

test('computeResizedBlock : respecte largeur minimale', () => {
  const r = computeResizedBlock(START, 'se', { dx: -1000, dy: 0 });
  assert.equal(r.w, BLOCK_MIN_WIDTH_MM);
});
