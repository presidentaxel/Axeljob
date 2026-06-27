import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addUserCanvasImage,
  collectImageUrlsFromLayout,
  listUserCanvasImages,
  removeUserCanvasImage,
  syncUserCanvasImagesFromLayout,
} from '../../src/lib/canvasImageLibrary.js';

const memory = new Map();

test('canvasImageLibrary — add, list, dedupe, remove', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v); },
    removeItem: (k) => { memory.delete(k); },
  };
  try {
    memory.clear();
    const url = 'data:image/jpeg;base64,AAA';
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
        { type: 'image', image_src: 'data:image/jpeg;base64,BBB' },
      ],
    }],
  };
  assert.deepEqual(collectImageUrlsFromLayout(layout), ['data:image/jpeg;base64,BBB']);
});
