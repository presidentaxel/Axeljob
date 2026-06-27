import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockSupportsEditHint,
  editHintMessageForBlock,
  buildCanvasPdfFilename,
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
