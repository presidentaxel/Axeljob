import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCanvasLayoutForCv,
  analyzeCvProfile,
  buildFullCanvasImportLayout,
  buildImportLayoutFromVision,
  estimateSemanticBlockHeight,
  inferThemeFromProfile,
  mergePresetDecorations,
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

test('mergePresetDecorations ajoute bandeaux preset si absents', () => {
  const vision = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: { color_accent: '#3182ce' },
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'b1', type: 'identity', bind: ['prenom', 'nom'], x: 60, y: 20, w: 100, h: 20, z: 2, style: {} },
      ],
    }],
  };
  const templates = [{ id: 'modern', name: 'Modern' }];
  const { layout: preset } = buildFullCanvasImportLayout(DENSE_CV, templates, {
    layoutHints: { layout_style: 'sidebar-left' },
  });
  const merged = mergePresetDecorations(vision, preset);
  const rects = merged.pages[0].blocks.filter((b) => b.type === 'shape:rect');
  assert.ok(rects.length >= 1);
  assert.ok(merged.pages[0].blocks.length > 1);
});

test('buildImportLayoutFromVision utilise le layout vision', () => {
  const visionLayout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {
      color_accent: '#dc2626',
      color_sidebar: '#1e293b',
      color_header: '#1e293b',
      color_section_title: '#dc2626',
      color_body: '#1a1a1a',
    },
    pages: [{
      id: 'page_import_1',
      blocks: [
        { id: 'bg', type: 'shape:rect', x: 0, y: 0, w: 53, h: 297, z: 0, style: { color: '#1e293b' } },
        { id: 'id', type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 8, y: 30, w: 37, h: 22, z: 2, style: { zone: 'sidebar', color: '#fff' } },
        { id: 'exp', type: 'experiences', bind: 'experiences', x: 60, y: 20, w: 130, h: 120, z: 1, style: { zone: 'main', section_label: 'EXPÉRIENCE' } },
        { id: 'form', type: 'formations', bind: 'formations', x: 60, y: 150, w: 130, h: 30, z: 1, style: { zone: 'main', section_label: 'FORMATION' } },
      ],
    }],
  };
  const templates = [{ id: 'modern', name: 'Modern' }, { id: 'executive', name: 'Executive' }];
  const result = buildImportLayoutFromVision(DENSE_CV, visionLayout, templates, {
    layoutHints: { layout_style: 'sidebar-left' },
    visionMeta: { confidence: 0.9, source: 'gemini_vision' },
  });
  assert.equal(result.importSource, 'vision');
  assert.ok(result.blockCount >= 4);
  assert.equal(result.layout.theme.color_accent, '#dc2626');
});

test('buildFullCanvasImportLayout : préfère vision si confidence suffisante', () => {
  const visionLayout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: { color_accent: '#6366f1' },
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'bg', type: 'shape:rect', x: 0, y: 0, w: 53, h: 297, z: 0, style: { color: '#6366f1' } },
        { id: 'exp', type: 'experiences', bind: 'experiences', x: 60, y: 20, w: 130, h: 100, z: 1, style: { zone: 'main' } },
      ],
    }],
  };
  const templates = [{ id: 'classic', name: 'Classic' }];
  const result = buildFullCanvasImportLayout(DENSE_CV, templates, {
    visionLayout,
    visionMeta: { confidence: 0.82 },
  });
  assert.equal(result.importSource, 'vision');
});

test('buildFullCanvasImportLayout : canvas complet avec blocs (preset)', () => {
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
