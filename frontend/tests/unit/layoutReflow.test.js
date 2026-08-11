import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reflowColumnBlocksOnPage } from '../../src/lib/layoutReflow.js';
import { findBlock } from '../../src/lib/cvLayoutModelV3.js';

test('reflowColumnBlocksOnPage repousse les blocs suivants dans la même zone', () => {
  const layout = {
    version: 3,
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'experiences', x: 10, y: 50, w: 100, h: 80, style: { zone: 'main' } },
        { id: 'b', type: 'formations', x: 10, y: 60, w: 100, h: 20, style: { zone: 'main' } },
        { id: 'c', type: 'skills', x: 160, y: 50, w: 40, h: 30, style: { zone: 'sidebar-light' } },
      ],
    }],
  };

  const next = reflowColumnBlocksOnPage(layout, 0);
  const b = findBlock(next, 'b');
  assert.ok(b.block.y >= 50 + 80 + 2 - 0.1);
  const c = findBlock(next, 'c');
  assert.equal(c.block.y, 50);
});
