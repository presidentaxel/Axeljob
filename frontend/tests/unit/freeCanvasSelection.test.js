import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  nextOverlappingBlockId,
  selectableBlocksAtPoint,
} from '../../src/lib/freeCanvasSelection.js';

const blocks = [
  { id: 'back', x: 10, y: 10, w: 50, h: 30, z: 1 },
  { id: 'middle', x: 20, y: 15, w: 50, h: 30, z: 2 },
  { id: 'front', x: 30, y: 20, w: 50, h: 30, z: 3 },
];

test('selectableBlocksAtPoint retourne les blocs superposes du premier plan vers le fond', () => {
  const hits = selectableBlocksAtPoint(blocks, { x: 35, y: 25 });
  assert.deepEqual(hits.map((block) => block.id), ['front', 'middle', 'back']);
});

test('nextOverlappingBlockId passe au calque suivant sous le curseur', () => {
  assert.equal(nextOverlappingBlockId(blocks, { x: 35, y: 25 }, 'front'), 'middle');
  assert.equal(nextOverlappingBlockId(blocks, { x: 35, y: 25 }, 'middle'), 'back');
  assert.equal(nextOverlappingBlockId(blocks, { x: 35, y: 25 }, 'back'), 'front');
});

test('nextOverlappingBlockId ignore les blocs verrouilles', () => {
  const withLocked = [
    ...blocks,
    { id: 'locked-top', x: 30, y: 20, w: 50, h: 30, z: 10, locked: true },
  ];
  assert.equal(nextOverlappingBlockId(withLocked, { x: 35, y: 25 }, 'front'), 'middle');
});

test('nextOverlappingBlockId ne change rien sans superposition', () => {
  assert.equal(nextOverlappingBlockId(blocks, { x: 12, y: 12 }, 'back'), null);
});
