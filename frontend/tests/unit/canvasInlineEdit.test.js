import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCanvasInlineEditableType,
  setByPath,
} from '../../src/lib/canvasInlineEdit.js';

test('setByPath met a jour un chemin imbrique', () => {
  const cv = { prenom: 'A', experiences: [{ poste: 'Dev' }] };
  setByPath(cv, 'experiences.0.poste', 'Lead');
  assert.equal(cv.experiences[0].poste, 'Lead');
});

test('isCanvasInlineEditableType couvre texte et semantique', () => {
  assert.equal(isCanvasInlineEditableType('text'), true);
  assert.equal(isCanvasInlineEditableType('identity'), true);
  assert.equal(isCanvasInlineEditableType('photo'), false);
});
