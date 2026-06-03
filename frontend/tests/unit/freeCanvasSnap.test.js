import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from '../../src/lib/cvLayoutModelV3.js';
import {
  SNAP_GRID_MM_DEFAULT,
  snapBlockGeometry,
  snapBlockPosition,
  snapToGrid,
} from '../../src/lib/freeCanvasSnap.js';

const layoutTwoBlocks = {
  version: 3,
  pages: [
    {
      id: 'p1',
      blocks: [
        { id: 'a', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 },
        { id: 'b', type: 'text', x: 60, y: 30, w: 30, h: 15, z: 2 },
      ],
    },
  ],
};

test('snapToGrid arrondit au pas 5 mm', () => {
  assert.equal(snapToGrid(12, 5), 10);
  assert.equal(snapToGrid(13, 5), 15);
});

test('snapBlockPosition aligne sur la grille si pas de cible proche', () => {
  const solo = {
    version: 3,
    pages: [{ id: 'p1', blocks: [{ id: 'solo', type: 'text', x: 10, y: 10, w: 20, h: 10, z: 1 }] }],
  };
  const r = snapBlockPosition({ x: 12.1, y: 8.2 }, solo, 'solo');
  assert.equal(r.x, 10);
  assert.equal(r.y, 10);
});

test('snapBlockPosition centre du bloc sur centre page (horizontal)', () => {
  const w = 40;
  const layout = {
    version: 3,
    pages: [{ id: 'p1', blocks: [{ id: 'solo', type: 'text', x: 0, y: 0, w, h: 20, z: 1 }] }],
  };
  const rawX = PAGE_WIDTH_MM / 2 - w / 2 + 0.8;
  const r = snapBlockPosition({ x: rawX, y: 20 }, layout, 'solo', { thresholdMm: 1.5 });
  assert.equal(r.x, PAGE_WIDTH_MM / 2 - w / 2);
  assert.ok(r.guides.some((g) => g.type === 'v' && g.role === 'center'));
});

test('snapBlockPosition centre du bloc sur centre page (vertical)', () => {
  const h = 24;
  const layout = {
    version: 3,
    pages: [{ id: 'p1', blocks: [{ id: 'solo', type: 'text', x: 20, y: 0, w: 30, h, z: 1 }] }],
  };
  const rawY = PAGE_HEIGHT_MM / 2 - h / 2 + 1;
  const r = snapBlockPosition({ x: 20, y: rawY }, layout, 'solo', { thresholdMm: 1.5 });
  assert.equal(r.y, PAGE_HEIGHT_MM / 2 - h / 2);
  assert.ok(r.guides.some((g) => g.type === 'h' && g.role === 'center'));
});

test('snap magnetique prioritaire sur la grille', () => {
  const layout = {
    version: 3,
    pages: [
      {
        id: 'p1',
        blocks: [
          { id: 'a', type: 'text', x: 10, y: 10, w: 40, h: 20, z: 1 },
          { id: 'b', type: 'text', x: 53, y: 12, w: 30, h: 15, z: 2 },
        ],
      },
    ],
  };
  const r = snapBlockPosition({ x: 51.2, y: 12 }, layout, 'b', { thresholdMm: 2 });
  assert.equal(r.x, 50);
  assert.ok(r.guides.some((g) => g.type === 'v' && g.pos === 50));
});

test('snapBlockPosition ne colle pas un bord sur un centre', () => {
  const layout = {
    version: 3,
    pages: [{ id: 'p1', blocks: [{ id: 'solo', type: 'text', x: 0, y: 0, w: 20, h: 10, z: 1 }] }],
  };
  const r = snapBlockPosition(
    { x: PAGE_WIDTH_MM / 2 + 0.8, y: 20 },
    layout,
    'solo',
    { gridMm: 1, thresholdMm: 1.5 },
  );
  assert.equal(r.x, PAGE_WIDTH_MM / 2 + 1);
  assert.equal(r.guides.some((g) => g.type === 'v' && g.role === 'center'), false);
});

test('snapBlockPosition priorise les marges de page sur les bords secondaires', () => {
  const layout = {
    version: 3,
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'text', x: 11.1, y: 20, w: 30, h: 10, z: 1 },
        { id: 'b', type: 'text', x: 20, y: 40, w: 30, h: 10, z: 2 },
      ],
    }],
  };
  const r = snapBlockPosition({ x: 10.8, y: 40 }, layout, 'b', { thresholdMm: 1.5 });
  assert.equal(r.x, 10);
  assert.ok(r.guides.some((g) => g.type === 'v' && g.pos === 10));
});

test('snapBlockPosition ignore les blocs des autres pages', () => {
  const layout = {
    version: 3,
    pages: [
      { id: 'p1', blocks: [{ id: 'a', type: 'text', x: 50, y: 20, w: 30, h: 10, z: 1 }] },
      { id: 'p2', blocks: [{ id: 'b', type: 'text', x: 80, y: 40, w: 30, h: 10, z: 2 }] },
    ],
  };
  const r = snapBlockPosition({ x: 51.1, y: 40 }, layout, 'b', { gridMm: 1, thresholdMm: 2 });
  assert.equal(r.x, 51);
  assert.equal(r.guides.some((g) => g.type === 'v' && g.pos === 50), false);
});

test('snapBlockGeometry snap w/h sur la grille', () => {
  const r = snapBlockGeometry(
    { x: 12, y: 8, w: 43, h: 17 },
    layoutTwoBlocks,
    'a',
    'se',
  );
  assert.equal(r.w, 45);
  assert.equal(r.h, 15);
  assert.equal(r.x, 12);
  assert.equal(r.y, 8);
});

test('snapBlockGeometry conserve le bord oppose pendant un resize lateral', () => {
  const east = snapBlockGeometry(
    { x: 10, y: 20, w: 58, h: 30 },
    layoutTwoBlocks,
    'a',
    'e',
  );
  assert.equal(east.x, 10);
  assert.equal(east.w, 60);

  const west = snapBlockGeometry(
    { x: 2, y: 20, w: 58, h: 30 },
    layoutTwoBlocks,
    'a',
    'w',
  );
  assert.equal(west.x + west.w, 60);
  assert.equal(west.w, 60);
});
