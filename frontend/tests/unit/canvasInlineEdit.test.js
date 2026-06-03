import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldValueLooksLikeHtml,
  isCanvasInlineEditableType,
  normalizeRichTextHtml,
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

test('normalise le HTML riche echappe par un contentEditable', () => {
  const escaped = '&lt;span style=&quot;font-weight: normal;&quot;&gt;L&lt;/span&gt;ouitos';

  assert.equal(
    normalizeRichTextHtml(escaped),
    '<span style="font-weight: normal;">L</span>ouitos',
  );
  assert.equal(fieldValueLooksLikeHtml(escaped), true);
});
