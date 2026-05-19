/**
 * Tests unitaires des operations purs sur les sections du CV.
 * Couvre add / remove / move + helpers (generateItemId, reorder index).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITABLE_SECTIONS,
  addItemToSection,
  computeReorderTargetIndex,
  findSectionSchema,
  generateItemId,
  getSectionItems,
  moveItemInSection,
  removeItemFromSection,
} from '../../src/lib/cvSectionOps.js';

const SAMPLE_CV = {
  experiences: [
    { id: 'exp_1', poste: 'Dev', entreprise: 'Acme', bullet_points: ['x'] },
    { id: 'exp_2', poste: 'PM', entreprise: 'Globex', bullet_points: ['y'] },
  ],
  formations: [{ id: 'form_1', diplome: 'Master', etablissement: 'IAE', date: '2020' }],
  certifications: [],
};

test('generateItemId : format <prefix>_<ts><rand>', () => {
  const id = generateItemId('exp', { nowFn: () => 0, randFn: () => 0 });
  assert.match(id, /^exp_[0-9a-z]+$/);
});

test('generateItemId : prefix par defaut si vide', () => {
  const id = generateItemId('', { nowFn: () => 0, randFn: () => 0 });
  assert.match(id, /^item_/);
});

test('generateItemId : ids differents sur deux appels avec rand variable', () => {
  let r = 0;
  const ids = new Set();
  for (let i = 0; i < 5; i += 1) {
    r += 0.13;
    ids.add(generateItemId('exp', { nowFn: () => i * 1000, randFn: () => r % 1 }));
  }
  assert.equal(ids.size, 5);
});

test('findSectionSchema : retourne le schema attendu', () => {
  const exp = findSectionSchema('experiences');
  assert.ok(exp);
  assert.equal(exp.label, 'Expériences');
  assert.equal(findSectionSchema('inconnu'), null);
  assert.equal(findSectionSchema(null), null);
});

test('EDITABLE_SECTIONS : 4 sections supportees', () => {
  assert.equal(EDITABLE_SECTIONS.length, 4);
  assert.deepEqual(
    EDITABLE_SECTIONS.map((s) => s.key),
    ['experiences', 'formations', 'certifications', 'projets'],
  );
});

test('schema.displayLabel : libelle parlant', () => {
  const exp = findSectionSchema('experiences');
  assert.equal(exp.displayLabel({ poste: 'Dev', entreprise: 'Acme' }), 'Dev — Acme');
  assert.equal(exp.displayLabel({ poste: 'Dev' }), 'Dev');
  assert.equal(exp.displayLabel({ entreprise: 'Acme' }), 'Acme');
  assert.equal(exp.displayLabel({}), '(nouvelle expérience)');
  assert.equal(exp.displayLabel(null), '(vide)');
});

test('schema.createItem : item vide avec toutes les cles', () => {
  const exp = findSectionSchema('experiences');
  const item = exp.createItem('exp_new');
  assert.equal(item.id, 'exp_new');
  assert.deepEqual(item.bullet_points, ['', '']);
  assert.equal(item.poste, '');

  const form = findSectionSchema('formations').createItem('form_new');
  assert.deepEqual(Object.keys(form).sort(), ['date', 'diplome', 'etablissement', 'id', 'mention']);
});

test('getSectionItems : array sur, non-mutant', () => {
  const items = getSectionItems(SAMPLE_CV, 'experiences');
  assert.equal(items.length, 2);
  items.push({ id: 'extra' });
  assert.equal(SAMPLE_CV.experiences.length, 2, "le CV d origine n'est pas mute");
  assert.deepEqual(getSectionItems(SAMPLE_CV, 'inconnu'), []);
  assert.deepEqual(getSectionItems(null, 'experiences'), []);
});

test('addItemToSection : ajoute en fin avec id genere', () => {
  const cv = addItemToSection(SAMPLE_CV, 'experiences', {
    idGen: () => 'exp_99',
  });
  assert.equal(cv.experiences.length, 3);
  assert.equal(cv.experiences[2].id, 'exp_99');
  assert.equal(cv.experiences[2].poste, '');
  assert.equal(SAMPLE_CV.experiences.length, 2, "le CV d origine n'est pas mute");
});

test('addItemToSection : section inconnue -> CV inchange', () => {
  const cv = addItemToSection(SAMPLE_CV, 'inconnue');
  assert.strictEqual(cv, SAMPLE_CV);
});

test('addItemToSection : section vide -> cree le tableau', () => {
  const cv = addItemToSection(SAMPLE_CV, 'certifications', { idGen: () => 'cert_1' });
  assert.equal(cv.certifications.length, 1);
  assert.equal(cv.certifications[0].id, 'cert_1');
});

test('removeItemFromSection : retire le bon index, non-mutant', () => {
  const cv = removeItemFromSection(SAMPLE_CV, 'experiences', 0);
  assert.equal(cv.experiences.length, 1);
  assert.equal(cv.experiences[0].id, 'exp_2');
  assert.equal(SAMPLE_CV.experiences.length, 2);
});

test('removeItemFromSection : index hors bornes -> CV inchange', () => {
  assert.strictEqual(removeItemFromSection(SAMPLE_CV, 'experiences', -1), SAMPLE_CV);
  assert.strictEqual(removeItemFromSection(SAMPLE_CV, 'experiences', 99), SAMPLE_CV);
  assert.strictEqual(removeItemFromSection(SAMPLE_CV, 'experiences', 1.5), SAMPLE_CV);
});

test('removeItemFromSection : section inconnue -> CV inchange', () => {
  assert.strictEqual(removeItemFromSection(SAMPLE_CV, 'inconnue', 0), SAMPLE_CV);
});

test('moveItemInSection : deplace de 0 a 1', () => {
  const cv = moveItemInSection(SAMPLE_CV, 'experiences', 0, 1);
  assert.deepEqual(cv.experiences.map((e) => e.id), ['exp_2', 'exp_1']);
});

test('moveItemInSection : indices identiques -> CV inchange', () => {
  assert.strictEqual(moveItemInSection(SAMPLE_CV, 'experiences', 0, 0), SAMPLE_CV);
});

test('moveItemInSection : indices hors bornes -> CV inchange', () => {
  assert.strictEqual(moveItemInSection(SAMPLE_CV, 'experiences', -1, 0), SAMPLE_CV);
  assert.strictEqual(moveItemInSection(SAMPLE_CV, 'experiences', 0, 99), SAMPLE_CV);
});

test('moveItemInSection : 3 items, deplace milieu vers debut', () => {
  const cv3 = {
    experiences: [
      { id: 'a' }, { id: 'b' }, { id: 'c' },
    ],
  };
  const moved = moveItemInSection(cv3, 'experiences', 1, 0);
  assert.deepEqual(moved.experiences.map((e) => e.id), ['b', 'a', 'c']);
});

test('computeReorderTargetIndex : clamping', () => {
  assert.equal(computeReorderTargetIndex(0, 2, 3), 2);
  assert.equal(computeReorderTargetIndex(0, -1, 3), 0);
  assert.equal(computeReorderTargetIndex(0, 10, 3), 2);
  assert.equal(computeReorderTargetIndex(5, 0, 3), -1, "fromIndex hors bornes -> -1");
  assert.equal(computeReorderTargetIndex(0.5, 0, 3), -1);
});
