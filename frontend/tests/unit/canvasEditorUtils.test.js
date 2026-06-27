import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockSupportsEditHint,
  editHintMessageForBlock,
  buildCanvasPdfFilename,
} from '../../src/lib/canvasEditorUtils.js';

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

test('buildCanvasPdfFilename : identité et titre', () => {
  assert.equal(
    buildCanvasPdfFilename({ prenom: 'Marie', nom: 'Dupont', titre_professionnel: 'Dev' }),
    'CV - Marie Dupont - Dev.pdf',
  );
});
