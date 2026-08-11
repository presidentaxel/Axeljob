import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLANK_CANVAS_CONTEXT_KEY,
  IMPORTED_CANVAS_CONTEXT_KEY,
  canvasContextLabel,
  getActiveCanvasContext,
  getCanvasDraftPrefs,
  listCanvasDrafts,
  loadCanvasDraft,
  saveCanvasDraft,
  setActiveCanvasContext,
  setCanvasDraftPrefs,
  templateCanvasContextKey,
} from '../../src/lib/canvasLayoutDrafts.js';

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

test('templateCanvasContextKey construit une cle stable', () => {
  assert.equal(templateCanvasContextKey('modern'), 'template:modern');
  assert.equal(templateCanvasContextKey(''), BLANK_CANVAS_CONTEXT_KEY);
});

test('saveCanvasDraft et loadCanvasDraft sauvegardent par contexte', () => {
  const layout = { version: 3, grid: 'free', pages: [{ id: 'p1', blocks: [] }] };
  saveCanvasDraft('template:modern', layout, { label: 'Modern' });
  const draft = loadCanvasDraft('template:modern');
  assert.equal(draft.contextKey, 'template:modern');
  assert.equal(draft.label, 'Modern');
  assert.equal(draft.layout.version, 3);
});

test('listCanvasDrafts trie par mise a jour recente', () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 100;
    saveCanvasDraft('blank', { pages: [{ blocks: [] }] }, { label: 'Blank' });
    Date.now = () => 200;
    saveCanvasDraft('template:a', { pages: [{ blocks: [] }] }, { label: 'A' });
    const drafts = listCanvasDrafts();
    assert.deepEqual(drafts.map((draft) => draft.contextKey), ['template:a', 'blank']);
  } finally {
    Date.now = originalNow;
  }
});

test('preferences et contexte actif ont des valeurs par defaut', () => {
  assert.equal(getActiveCanvasContext(), BLANK_CANVAS_CONTEXT_KEY);
  setActiveCanvasContext('template:classic');
  assert.equal(getActiveCanvasContext(), 'template:classic');
  assert.equal(getCanvasDraftPrefs().showTransferPrompt, true);
  setCanvasDraftPrefs({ showTransferPrompt: false });
  assert.equal(getCanvasDraftPrefs().showTransferPrompt, false);
});

test('canvasContextLabel utilise les noms de templates', () => {
  assert.equal(canvasContextLabel('blank'), 'Page blanche');
  assert.equal(canvasContextLabel('imported'), 'CV importé');
  assert.equal(
    canvasContextLabel('template:modern', [{ id: 'modern', name: 'Moderne' }]),
    'Moderne',
  );
});
