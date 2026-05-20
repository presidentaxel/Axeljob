import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutFingerprintForScoring } from '../../src/lib/atsScoreLayoutFingerprint.js';

test('layoutFingerprintForScoring stable si reference change sans delta', () => {
  const layoutA = {
    version: 3,
    grid: 'free',
    pages: [{ id: 'p1', blocks: [{ id: 'b1', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 }] }],
  };
  const layoutB = {
    version: 3,
    grid: 'free',
    pages: [{ id: 'p1', blocks: [{ id: 'b1', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 }] }],
  };
  assert.equal(layoutFingerprintForScoring(layoutA), layoutFingerprintForScoring(layoutB));
});

test('layoutFingerprintForScoring change si position change', () => {
  const a = {
    version: 3,
    grid: 'free',
    pages: [{ id: 'p1', blocks: [{ id: 'b1', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 }] }],
  };
  const b = {
    version: 3,
    grid: 'free',
    pages: [{ id: 'p1', blocks: [{ id: 'b1', type: 'text', x: 50, y: 10, w: 40, h: 20, z: 1 }] }],
  };
  assert.notEqual(layoutFingerprintForScoring(a), layoutFingerprintForScoring(b));
});
