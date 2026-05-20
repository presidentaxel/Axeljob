import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MM_TO_PX } from '../../src/lib/freeCanvasScale.js';
import {
  clientDeltaToMmDelta,
  dragGroupKey,
  positionAfterDrag,
} from '../../src/lib/freeCanvasDrag.js';

test('clientDeltaToMmDelta : scale 1', () => {
  const d = clientDeltaToMmDelta(MM_TO_PX * 10, MM_TO_PX * 5, 1);
  assert.ok(Math.abs(d.dx - 10) < 0.01);
  assert.ok(Math.abs(d.dy - 5) < 0.01);
});

test('clientDeltaToMmDelta : scale 0.5 double le delta mm', () => {
  const d = clientDeltaToMmDelta(MM_TO_PX * 10, 0, 0.5);
  assert.ok(Math.abs(d.dx - 20) < 0.01);
});

test('positionAfterDrag', () => {
  assert.deepEqual(
    positionAfterDrag({ x: 10, y: 20 }, { dx: 3, dy: -2 }),
    { x: 13, y: 18 },
  );
});

test('dragGroupKey', () => {
  assert.equal(dragGroupKey('blk_abc'), 'drag:blk_abc');
});
