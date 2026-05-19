/**
 * Tests unitaires des helpers du selecteur de templates dans l editeur Beta.
 *
 * `node --test` ; pas de framework additionnel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findTemplateById,
  isAtsSafe,
  sortTemplatesForEditor,
  templateOptionLabel,
} from '../../src/lib/editorTemplateUtils.js';

const TEMPLATES_FIXTURE = [
  { id: 'creative', name: 'Creatif', tags: ['ats-safe', 'sidebar-left', 'premium'], premium: true },
  { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column'], premium: false },
  { id: 'modern', name: 'Moderne', tags: ['ats-safe', 'sidebar-left'], premium: false },
  { id: 'unknown', name: 'Inconnu', tags: ['weird-layout'], premium: false },
  { id: 'classic', name: 'Classique', tags: ['ats-safe', 'sidebar'], premium: false },
];

test('isAtsSafe true pour tag ats-safe', () => {
  assert.equal(isAtsSafe({ tags: ['ats-safe'] }), true);
});

test('isAtsSafe true pour tag single-column meme sans ats-safe', () => {
  assert.equal(isAtsSafe({ tags: ['single-column'] }), true);
});

test('isAtsSafe false si pas de tag pertinent', () => {
  assert.equal(isAtsSafe({ tags: ['fancy'] }), false);
  assert.equal(isAtsSafe({}), false);
  assert.equal(isAtsSafe(null), false);
});

test('templateOptionLabel ajoute le suffixe premium', () => {
  assert.equal(templateOptionLabel({ id: 'x', name: 'X', premium: false }), 'X');
  assert.equal(templateOptionLabel({ id: 'x', name: 'X', premium: true }), 'X (premium)');
});

test('templateOptionLabel fallback sur id si name absent', () => {
  assert.equal(templateOptionLabel({ id: 'fallback' }), 'fallback');
});

test('templateOptionLabel renvoie chaine vide pour input invalide', () => {
  assert.equal(templateOptionLabel(null), '');
  assert.equal(templateOptionLabel('not-an-object'), '');
});

test('sortTemplatesForEditor place les ATS-safe non-premium en premier', () => {
  const sorted = sortTemplatesForEditor(TEMPLATES_FIXTURE);
  const ids = sorted.map((t) => t.id);
  // ATS-safe non premium : classic, minimal, modern (alpha) ; puis premium ats-safe : creative ; puis non-ATS : unknown.
  assert.deepEqual(ids, ['classic', 'minimal', 'modern', 'creative', 'unknown']);
});

test('sortTemplatesForEditor ne mute pas l input', () => {
  // Regression : l API du composant utilise la liste recue depuis App.jsx ;
  // muter cette liste casserait React (memoisation, comparaisons referentielles).
  const original = TEMPLATES_FIXTURE.map((t) => ({ ...t }));
  const originalIds = TEMPLATES_FIXTURE.map((t) => t.id);
  sortTemplatesForEditor(TEMPLATES_FIXTURE);
  assert.deepEqual(TEMPLATES_FIXTURE.map((t) => t.id), originalIds);
  assert.deepEqual(TEMPLATES_FIXTURE, original);
});

test('sortTemplatesForEditor filtre les items sans id', () => {
  const sorted = sortTemplatesForEditor([{ id: 'a' }, null, {}, { id: '' }, { id: 'b' }]);
  assert.deepEqual(sorted.map((t) => t.id), ['a', 'b']);
});

test('sortTemplatesForEditor renvoie [] pour input non-tableau', () => {
  assert.deepEqual(sortTemplatesForEditor(null), []);
  assert.deepEqual(sortTemplatesForEditor(undefined), []);
  assert.deepEqual(sortTemplatesForEditor('nope'), []);
});

test('findTemplateById trouve un template existant', () => {
  const t = findTemplateById(TEMPLATES_FIXTURE, 'modern');
  assert.equal(t?.id, 'modern');
});

test('findTemplateById retourne null pour id inconnu', () => {
  assert.equal(findTemplateById(TEMPLATES_FIXTURE, 'absent'), null);
});

test('findTemplateById tolerant aux inputs invalides', () => {
  assert.equal(findTemplateById(null, 'minimal'), null);
  assert.equal(findTemplateById(TEMPLATES_FIXTURE, null), null);
});
