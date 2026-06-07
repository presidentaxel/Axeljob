import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCanvasLayoutForCv,
  analyzeCvProfile,
  applyThemeColorsToDecorativeBlocks,
  applyVisionSectionPlacement,
  buildFullCanvasImportLayout,
  buildLayoutFromVisionDetection,
  buildThemeFromVisionImport,
  estimateSemanticBlockHeight,
  inferThemeFromProfile,
  mergePresetDecorations,
  recommendTemplateId,
} from '../../src/lib/canvasCvImportAdapter.js';
import { createCanvasLayoutForTemplate } from '../../src/lib/layoutTemplatePresets.js';
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

test('recommendTemplateId : template_match vision prioritaire', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const templates = [{ id: 'modern', name: 'Modern' }, { id: 'executive', name: 'Executive' }];
  const id = recommendTemplateId(analysis, templates, 'minimal', { template_match: 'modern' });
  assert.equal(id, 'modern');
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

test('applyThemeColorsToDecorativeBlocks recolore sidebar', () => {
  const layout = createStarterLayoutV3();
  layout.theme = {
    color_sidebar: '#112233',
    color_accent: '#aabbcc',
    color_header: '#445566',
  };
  layout.pages[0].blocks.unshift({
    id: 'sb', type: 'shape:rect', x: 0, y: 0, w: 50, h: 297, z: 0, style: { color: '#000' },
  });
  const next = applyThemeColorsToDecorativeBlocks(layout);
  const sb = next.pages[0].blocks.find((b) => b.id === 'sb');
  assert.equal(sb.style.color, '#112233');
});

test('applyVisionSectionPlacement déplace compétences vers colonne principale', () => {
  const template = { id: 'modern', name: 'Modern' };
  const base = createCanvasLayoutForTemplate(template);
  const visionMeta = {
    layout_style: 'sidebar-left',
    sections_in_sidebar: ['photo', 'contact', 'languages'],
    sections_in_main: ['experiences', 'formations', 'skills', 'resume'],
  };
  const next = applyVisionSectionPlacement(base, visionMeta, {
    layoutStyle: 'sidebar-left',
    templateId: 'modern',
  });
  const skills = next.pages[0].blocks.filter((b) => b.type === 'skills');
  assert.ok(skills.length >= 1);
  for (const block of skills) {
    assert.ok((Number(block.x) || 0) > 40, 'skills devraient être en colonne principale');
  }
});

test('buildThemeFromVisionImport : couleurs PDF, pas preset executive', () => {
  const theme = buildThemeFromVisionImport(
    { dominant_colors: { accent: '#003366', sidebar: '#eef2f7', header: '#003366' } },
    {},
    { id: 'executive', options: [{ key: 'accent_color', default: '#b8860b' }] },
  );
  assert.equal(theme.color_accent, '#003366');
  assert.equal(theme.color_sidebar, '#eef2f7');
  assert.notEqual(theme.color_accent, '#b8860b');
});

test('buildLayoutFromVisionDetection : preset calibré + couleurs vision', () => {
  const templates = [
    { id: 'modern', name: 'Modern' },
    { id: 'executive', name: 'Executive' },
  ];
  const visionMeta = {
    source: 'gemini_vision',
    template_match: 'modern',
    confidence: 0.88,
    layout_style: 'sidebar-left',
    dominant_colors: { accent: '#e11d48', sidebar: '#1e3a5f', header: '#1e3a5f' },
    sections_found: ['experiences', 'formations', 'skills'],
  };
  const result = buildLayoutFromVisionDetection(DENSE_CV, visionMeta, templates, {});
  assert.equal(result.importSource, 'vision-guided');
  assert.equal(result.recommendedTemplateId, 'modern');
  assert.ok(result.blockCount >= 8);
  assert.equal(result.layout.theme.color_accent, '#e11d48');
  assert.equal(result.layout.theme.color_sidebar, '#1e3a5f');
  const hasSidebar = result.layout.pages[0].blocks.some(
    (b) => b.type === 'shape:rect' && (Number(b.w) || 0) > 30,
  );
  assert.ok(hasSidebar);
});

test('buildFullCanvasImportLayout : vision detection → vision-guided', () => {
  const templates = [{ id: 'classic', name: 'Classic' }, { id: 'creative', name: 'Creative' }];
  const result = buildFullCanvasImportLayout(DENSE_CV, templates, {
    visionMeta: {
      source: 'gemini_vision',
      template_match: 'creative',
      confidence: 0.75,
      dominant_colors: { accent: '#6366f1', sidebar: '#6366f1' },
    },
  });
  assert.equal(result.importSource, 'vision-guided');
  assert.equal(result.recommendedTemplateId, 'creative');
});

test('buildFullCanvasImportLayout : canvas preset sans vision', () => {
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
});
