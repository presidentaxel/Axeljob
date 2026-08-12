import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockSupportsEditHint,
  editHintMessageForBlock,
  buildCanvasPdfFilename,
  computeBlockHorizontalAlign,
  computeHorizontalDistribute,
  computeLayerLabelPatch,
  SEMANTIC_EDIT_NOTE_DISMISSED_KEY,
  dismissSemanticEditNote,
  isSemanticEditNoteDismissed,
} from '../../src/lib/canvasEditorUtils.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  installLocalStorage();
});

test('blockSupportsEditHint : texte et photo oui, forme non', () => {
  assert.equal(blockSupportsEditHint({ type: 'text' }), true);
  assert.equal(blockSupportsEditHint({ type: 'photo' }), true);
  assert.equal(blockSupportsEditHint({ type: 'shape:rect' }), false);
  assert.equal(blockSupportsEditHint(null), false);
});

test('editHintMessageForBlock : message adapté au type', () => {
  assert.match(editHintMessageForBlock({ type: 'text' }), /Double-cliquez/);
  assert.match(editHintMessageForBlock({ type: 'photo' }), /photo ou l’image/);
});

test('isSemanticEditNoteDismissed : localStorage', () => {
  localStorage.removeItem(SEMANTIC_EDIT_NOTE_DISMISSED_KEY);
  assert.equal(isSemanticEditNoteDismissed(), false);
  dismissSemanticEditNote();
  assert.equal(isSemanticEditNoteDismissed(), true);
  localStorage.removeItem(SEMANTIC_EDIT_NOTE_DISMISSED_KEY);
});

test('buildCanvasPdfFilename : identité et titre', () => {
  assert.equal(
    buildCanvasPdfFilename({ prenom: 'Marie', nom: 'Dupont', titre_professionnel: 'Dev' }),
    'CV - Marie Dupont - Dev.pdf',
  );
});

test('computeBlockHorizontalAlign : left center right', () => {
  const block = { w: 50 };
  assert.deepEqual(computeBlockHorizontalAlign(block, 'left'), { x: 10 });
  assert.deepEqual(computeBlockHorizontalAlign(block, 'center'), { x: 80 });
  assert.deepEqual(computeBlockHorizontalAlign(block, 'right'), { x: 150 });
  assert.equal(computeBlockHorizontalAlign(null, 'left'), null);
});

test('computeHorizontalDistribute : ≥3 blocs, extrémités fixes', () => {
  const patches = computeHorizontalDistribute([
    { id: 'a', x: 10, w: 20 },
    { id: 'b', x: 40, w: 20 },
    { id: 'c', x: 100, w: 20 },
  ]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, 'b');
  assert.equal(patches[0].x, 55);
  assert.deepEqual(computeHorizontalDistribute([{ id: 'a', x: 0, w: 10 }]), []);
});

test('computeLayerLabelPatch : set et clear', () => {
  const set = computeLayerLabelPatch({ style: { color: '#000' } }, 'Bandeau');
  assert.equal(set.style.layer_label, 'Bandeau');
  assert.equal(set.style.color, '#000');
  const clear = computeLayerLabelPatch({ style: { layer_label: 'x' } }, '  ');
  assert.equal(clear.style.layer_label, undefined);
});
