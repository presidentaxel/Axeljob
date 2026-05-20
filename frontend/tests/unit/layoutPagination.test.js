import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLayoutPagination,
  blockOverflowsPage,
  listOverflowingBlocksOnPage,
} from '../../src/lib/layoutPagination.js';
import { PAGE_HEIGHT_MM } from '../../src/lib/cvLayoutModelV3.js';

test('blockOverflowsPage detecte le depassement', () => {
  assert.equal(blockOverflowsPage({ y: 280, h: 30 }), true);
  assert.equal(blockOverflowsPage({ y: 10, h: 50 }), false);
});

test('applyLayoutPagination deplace vers page 2', () => {
  const layout = {
    version: 3,
    grid: 'free',
    pages: [
      {
        id: 'p1',
        blocks: [
          { id: 'stay', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 },
          { id: 'fall', type: 'text', x: 10, y: PAGE_HEIGHT_MM - 5, w: 40, h: 30, z: 2 },
        ],
      },
    ],
  };
  assert.equal(listOverflowingBlocksOnPage(layout, 0).length, 1);
  const next = applyLayoutPagination(layout);
  assert.equal(next.pages.length, 2);
  assert.equal(next.pages[0].blocks.length, 1);
  assert.equal(next.pages[0].blocks[0].id, 'stay');
  assert.equal(next.pages[1].blocks.length, 1);
  assert.equal(next.pages[1].blocks[0].id, 'fall');
  assert.ok(next.pages[1].blocks[0].y < 50);
});
