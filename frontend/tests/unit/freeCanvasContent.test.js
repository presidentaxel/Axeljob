import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getByPath,
  normalizeBind,
  bindIncludesPath,
  resolveBoundText,
  resolveBoundStringList,
  resolveCompetenceList,
  resolveExperiences,
  resolveFormations,
} from '../../src/lib/freeCanvasContent.js';

const CV = {
  prenom: 'Jean',
  nom: 'Dupont',
  titre_professionnel: 'Dev',
  resume: 'Resume court',
  experiences: [
    { poste: 'Lead', entreprise: 'ACME', bullet_points: ['A', ''] },
    { poste: '', entreprise: '', bullet_points: ['', ''] },
  ],
  formations: [{ diplome: 'Master', etablissement: 'Paris', date: '2020' }],
  competences: { techniques: ['JS', 'Python', ''] },
};

test('getByPath : chemin simple et index', () => {
  assert.equal(getByPath(CV, 'prenom'), 'Jean');
  assert.equal(getByPath(CV, 'experiences.0.poste'), 'Lead');
  assert.equal(getByPath(CV, 'inconnu'), undefined);
});

test('normalizeBind', () => {
  assert.deepEqual(normalizeBind('resume'), ['resume']);
  assert.deepEqual(normalizeBind(['a', 'b']), ['a', 'b']);
  assert.deepEqual(normalizeBind(null), []);
});

test('bindIncludesPath : legacy vide = tout ; sinon filtre', () => {
  assert.equal(bindIncludesPath(undefined, 'prenom'), true);
  assert.equal(bindIncludesPath([], 'prenom'), true);
  assert.equal(bindIncludesPath(['prenom', 'nom'], 'prenom'), true);
  assert.equal(bindIncludesPath(['prenom', 'nom'], 'titre_professionnel'), false);
  assert.equal(bindIncludesPath('email', 'email'), true);
  assert.equal(bindIncludesPath('email', 'telephone'), false);
});

test('resolveBoundText : identity', () => {
  const t = resolveBoundText(CV, ['prenom', 'nom']);
  assert.equal(t, 'Jean Dupont');
});

test('resolveBoundStringList : competences', () => {
  assert.deepEqual(resolveBoundStringList(CV, 'competences.techniques'), ['JS', 'Python']);
});

test('resolveCompetenceList : bind string (pas bind[0])', () => {
  const cv = {
    competences: {
      techniques: ['Excel'],
      logiciels: ['Python', 'Git'],
      autres: ['Permis B'],
    },
  };
  assert.deepEqual(resolveCompetenceList(cv, 'competences.logiciels'), ['Python', 'Git']);
  assert.deepEqual(resolveCompetenceList(cv, 'competences.autres'), ['Permis B']);
  assert.deepEqual(resolveCompetenceList(cv, 'competences.techniques'), ['Excel']);
});

test('resolveCompetenceList : alias informatiques', () => {
  const cv = { competences: { informatiques: ['Figma', 'Notion'] } };
  assert.deepEqual(resolveCompetenceList(cv, 'competences.logiciels'), ['Figma', 'Notion']);
});

test('resolveExperiences : filtre vide + limit', () => {
  assert.equal(resolveExperiences(CV).length, 1);
  assert.equal(resolveExperiences(CV, 1).length, 1);
  assert.equal(resolveExperiences({ experiences: [] }).length, 0);
});

test('resolveFormations', () => {
  assert.equal(resolveFormations(CV).length, 1);
});
