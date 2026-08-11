import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addUserCanvasImage,
  collectImageUrlsFromLayout,
  listUserCanvasImages,
  removeUserCanvasImage,
  syncUserCanvasImagesFromLayout,
  toSafeCanvasImageSrc,
} from '../../src/lib/canvasImageLibrary.js';

const memory = new Map();

test('toSafeCanvasImageSrc refuse data: et javascript:', () => {
  assert.equal(toSafeCanvasImageSrc('data:image/jpeg;base64,AAA'), '');
  assert.equal(toSafeCanvasImageSrc('javascript:alert(1)'), '');
  assert.equal(toSafeCanvasImageSrc('assets/uploads/u/x.jpg'), 'assets/uploads/u/x.jpg');
  assert.equal(toSafeCanvasImageSrc('https://cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
});

test('canvasImageLibrary - add, list, dedupe, remove', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v); },
    removeItem: (k) => { memory.delete(k); },
  };
  try {
    memory.clear();
    const url = 'assets/uploads/u/canvas_a.jpg';
    addUserCanvasImage(url, { label: 'a.jpg' });
    addUserCanvasImage(url);
    assert.equal(listUserCanvasImages().length, 1);
    const id = listUserCanvasImages()[0].id;
    removeUserCanvasImage(id);
    assert.equal(listUserCanvasImages().length, 0);
    syncUserCanvasImagesFromLayout({
      pages: [{ blocks: [{ type: 'image', image_src: url }] }],
    });
    assert.equal(listUserCanvasImages().length, 0, 'sync ne réimporte pas une image supprimée');
  } finally {
    globalThis.localStorage = original;
    memory.clear();
  }
});

test('collectImageUrlsFromLayout extrait les blocs image', () => {
  const layout = {
    pages: [{
      blocks: [
        { type: 'text', content: 'x' },
        { type: 'image', image_src: 'assets/uploads/u/bbb.jpg' },
      ],
    }],
  };
  assert.deepEqual(collectImageUrlsFromLayout(layout), ['assets/uploads/u/bbb.jpg']);
});

test('addUserCanvasImage ignore les data URL', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v); },
    removeItem: (k) => { memory.delete(k); },
  };
  try {
    memory.clear();
    assert.equal(addUserCanvasImage('data:image/jpeg;base64,AAA'), null);
    assert.equal(listUserCanvasImages().length, 0);
  } finally {
    globalThis.localStorage = original;
    memory.clear();
  }
});
