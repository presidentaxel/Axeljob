import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLayoutPagination,
  blockOverflowsPage,
  listOverflowingBlocksOnPage,
} from '../../src/lib/layoutPagination.js';
import {
  PAGE_HEIGHT_MM,
  addBlockToPage,
  createBlankLayoutV3,
  setBlockPosition,
} from '../../src/lib/cvLayoutModelV3.js';

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

test('canvas libre : position sous le pli puis spill cree la page 2', () => {
  let layout = createBlankLayoutV3();
  layout = addBlockToPage(layout, 0, {
    id: 'low',
    type: 'text',
    content: 'bas',
    x: 15,
    y: 280,
    w: 50,
    h: 35,
    z: 1,
  });
  layout = setBlockPosition(layout, 'low', { x: 15, y: 300 });
  const moved = layout.pages[0].blocks.find((b) => b.id === 'low');
  assert.ok(moved.y + moved.h > PAGE_HEIGHT_MM, 'le bloc doit pouvoir depasser le pli avant spill');
  const paginated = applyLayoutPagination(layout);
  assert.equal(paginated.pages.length, 2);
  assert.equal(paginated.pages[0].blocks.length, 0);
  assert.equal(paginated.pages[1].blocks[0].id, 'low');
});
