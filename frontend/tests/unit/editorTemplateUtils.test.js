/**
 * Tests unitaires des helpers du selecteur de templates dans l editeur Beta.
 *
 * `node --test` ; pas de framework additionnel.
 *
 * Couvre notamment :
 *  - l exclusion des templates personnalises (custom_* / tag `custom`),
 *  - le tri stable ATS-safe en premier,
 *  - l immutabilite de l input.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findTemplateById,
  isAtsSafe,
  isOfficialTemplate,
  sortTemplatesForEditor,
  templateOptionLabel,
} from '../../src/lib/editorTemplateUtils.js';

const TEMPLATES_FIXTURE = [
  { id: 'creative', name: 'Creatif', tags: ['ats-safe', 'sidebar-left'] },
  { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column'] },
  { id: 'modern', name: 'Moderne', tags: ['ats-safe', 'sidebar-left'] },
  { id: 'unknown', name: 'Inconnu', tags: ['weird-layout'] },
  { id: 'classic', name: 'Classique', tags: ['ats-safe', 'sidebar'] },
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

test('isOfficialTemplate true pour un template livre standard', () => {
  assert.equal(isOfficialTemplate({ id: 'minimal', tags: ['ats-safe'] }), true);
});

test('isOfficialTemplate false pour prefixe custom_', () => {
  // Regression : la refonte a supprime les templates personnalises.
  // Ils ne doivent jamais apparaitre dans le selecteur editeur, meme
  // s ils restent en base par accident pour des utilisateurs existants.
  assert.equal(isOfficialTemplate({ id: 'custom_abc123', tags: [] }), false);
});

test('isOfficialTemplate false pour tag `custom`', () => {
  assert.equal(isOfficialTemplate({ id: 'whatever', tags: ['custom', 'other'] }), false);
});

test('isOfficialTemplate false pour input invalide', () => {
  assert.equal(isOfficialTemplate(null), false);
  assert.equal(isOfficialTemplate({}), false);
  assert.equal(isOfficialTemplate({ id: '' }), false);
});

test('templateOptionLabel retourne le name sans suffixe premium', () => {
  // Regression : la notion premium a ete retiree. Aucun suffixe ne doit
  // apparaitre meme si l API renvoyait encore un champ `premium: true`.
  assert.equal(templateOptionLabel({ id: 'x', name: 'X', premium: false }), 'X');
  assert.equal(templateOptionLabel({ id: 'x', name: 'X', premium: true }), 'X');
});

test('templateOptionLabel fallback sur id si name absent', () => {
  assert.equal(templateOptionLabel({ id: 'fallback' }), 'fallback');
});

test('templateOptionLabel renvoie chaine vide pour input invalide', () => {
  assert.equal(templateOptionLabel(null), '');
  assert.equal(templateOptionLabel('not-an-object'), '');
});

test('sortTemplatesForEditor place les ATS-safe en premier puis alpha', () => {
  const sorted = sortTemplatesForEditor(TEMPLATES_FIXTURE);
  const ids = sorted.map((t) => t.id);
  // ATS-safe (alphabetique sur le name) : Classique, Creatif, Minimal, Moderne ;
  // puis non-ATS : Inconnu.
  assert.deepEqual(ids, ['classic', 'creative', 'minimal', 'modern', 'unknown']);
});

test('sortTemplatesForEditor exclut les templates personnalises', () => {
  const sorted = sortTemplatesForEditor([
    { id: 'minimal', name: 'Minimal', tags: ['ats-safe'] },
    { id: 'custom_abc', name: 'Mon CV perso', tags: [] },
    { id: 'modern', name: 'Moderne', tags: ['ats-safe', 'sidebar-left'] },
    { id: 'shared_x', name: 'Tag custom', tags: ['custom'] },
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ['minimal', 'modern']);
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
