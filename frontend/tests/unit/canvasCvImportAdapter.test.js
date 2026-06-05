import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCanvasLayoutForCv,
  analyzeCvProfile,
  buildFullCanvasImportLayout,
  estimateSemanticBlockHeight,
  inferThemeFromProfile,
  recommendTemplateId,
} from '../../src/lib/canvasCvImportAdapter.js';
import { createStarterLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';

const DENSE_CV = {
  prenom: 'Marie',
  nom: 'Martin',
  titre_professionnel: 'Directrice Marketing',
  email: 'marie@ex.com',
  resume: 'Profil senior avec 12 ans d experience en growth et brand.',
  experiences: [
    { poste: 'Head of Growth', entreprise: 'ScaleUp', bullet_points: ['A', 'B', 'C'] },
    { poste: 'CMO', entreprise: 'Agency', bullet_points: ['D'] },
    { poste: 'Lead', entreprise: 'Corp', bullet_points: ['E', 'F'] },
    { poste: 'Manager', entreprise: 'X', bullet_points: [] },
    { poste: 'Consultant', entreprise: 'Y', bullet_points: ['G'] },
  ],
  formations: [{ diplome: 'MBA', etablissement: 'HEC', date: '2015' }],
  competences: {
    techniques: ['SEO', 'SEA', 'Analytics'],
    logiciels: ['HubSpot', 'GA4'],
    langues: [{ langue: 'Anglais', niveau: 'C1' }],
    autres: [],
  },
  certifications: [{ nom: 'Google Ads', organisme: 'Google' }],
  projets: [],
};

test('analyzeCvProfile compte sections et densité', () => {
  const a = analyzeCvProfile(DENSE_CV);
  assert.equal(a.expCount, 5);
  assert.equal(a.formationCount, 1);
  assert.equal(a.skillCount, 5);
  assert.equal(a.isExecutiveProfile, true);
  assert.ok(a.density > 10);
});

test('recommendTemplateId : profil exécutif dense → executive ou classic', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const templates = [
    { id: 'minimal', name: 'Minimal' },
    { id: 'executive', name: 'Executive' },
    { id: 'classic', name: 'Classic' },
  ];
  const id = recommendTemplateId(analysis, templates, 'minimal');
  assert.equal(id, 'executive');
});

test('estimateSemanticBlockHeight : expériences volumineuses', () => {
  const h = estimateSemanticBlockHeight({ type: 'experiences', h: 40 }, DENSE_CV);
  assert.ok(h > 50);
});

test('inferThemeFromProfile : hints accent prioritaire', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const theme = inferThemeFromProfile(analysis, { accent_color: '#ff5500' });
  assert.equal(theme.color_accent, '#ff5500');
});

test('buildFullCanvasImportLayout : canvas complet avec blocs', () => {
  const templates = [
    { id: 'classic', name: 'Classic' },
    { id: 'executive', name: 'Executive' },
  ];
  const { layout, blockCount, recommendedTemplateId } = buildFullCanvasImportLayout(
    DENSE_CV,
    templates,
    { layoutHints: { layout_style: 'sidebar-right' } },
  );
  assert.equal(recommendedTemplateId, 'executive');
  assert.ok(blockCount >= 4);
  assert.ok(layout.pages[0].blocks.length >= 4);
  assert.ok(layout.theme?.color_accent);
});

test('adaptCanvasLayoutForCv supprime blocs vides et redimensionne', () => {
  const layout = createStarterLayoutV3();
  const sparseCv = {
    prenom: 'A',
    nom: 'B',
    experiences: [{ poste: 'Dev', entreprise: 'Co', bullet_points: ['x'] }],
    formations: [],
    certifications: [],
    projets: [],
    competences: { techniques: [], logiciels: [], langues: [], autres: [] },
  };
  const before = layout.pages[0].blocks.length;
  const { layout: next, removedBlockCount, resizedBlockCount } = adaptCanvasLayoutForCv(
    sparseCv,
    layout,
    { templatesList: [{ id: 'classic' }], templateId: 'classic' },
  );
  assert.ok(removedBlockCount >= 1);
  assert.ok(resizedBlockCount >= 1);
  assert.ok(next.pages[0].blocks.length <= before);
  const exp = next.pages[0].blocks.find((b) => b.type === 'experiences');
  assert.ok(exp);
  assert.ok(exp.h >= 20);
});
