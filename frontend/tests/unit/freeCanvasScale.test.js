import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MM_TO_PX,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  computePageScale,
  scaledPageHeightPx,
} from '../../src/lib/freeCanvasScale.js';

import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../../src/lib/cvLayoutModelV3.js';

test('MM_TO_PX et dimensions page', () => {
  assert.ok(MM_TO_PX > 3.7 && MM_TO_PX < 3.8);
  assert.equal(PAGE_WIDTH_PX, PAGE_WIDTH_MM * MM_TO_PX);
  assert.equal(PAGE_HEIGHT_PX, PAGE_HEIGHT_MM * MM_TO_PX);
});

test('computePageScale : conteneur etroit -> scale < 1', () => {
  const s = computePageScale(400, { paddingPx: 0 });
  assert.ok(s < 1);
  assert.ok(s > 0);
});

test('computePageScale : conteneur large -> plafonne a maxScale', () => {
  const s = computePageScale(2000, { paddingPx: 0, maxScale: 1 });
  assert.equal(s, 1);
});

test('computePageScale : largeur 0 -> 1', () => {
  assert.equal(computePageScale(0), 1);
});

test('scaledPageHeightPx', () => {
  assert.equal(scaledPageHeightPx(0.5), PAGE_HEIGHT_PX * 0.5);
});
