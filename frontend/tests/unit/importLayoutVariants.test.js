import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPORT_VARIANT_IDS,
  buildImportLayoutVariants,
  pickAtsSafeTemplate,
} from '../../src/lib/importLayoutVariants.js';
import { isStructuralLayout } from '../../src/lib/canvasCvImportAdapter.js';

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
  ],
  formations: [{ diplome: 'MBA', etablissement: 'HEC', date: '2015' }],
  competences: {
    techniques: ['SEO', 'SEA', 'Analytics'],
    logiciels: ['HubSpot'],
    langues: [{ langue: 'Anglais', niveau: 'C1' }],
    autres: [],
  },
  certifications: [],
  projets: [],
};

const TEMPLATES = [
  { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column', 'no-sidebar'] },
  { id: 'classic', name: 'Classic', tags: ['sidebar', 'photo'] },
  { id: 'executive', name: 'Executive', tags: ['sidebar'] },
];

const STRUCTURAL_LAYOUT = {
  version: 3,
  format: 'A4',
  grid: 'free',
  unit: 'mm',
  source: 'pdf_structural',
  pages: [
    {
      id: 'page_1',
      blocks: [
        {
          id: 'sb',
          type: 'shape:rect',
          x: 0,
          y: 0,
          w: 63,
          h: 297,
          z: 0,
          style: { color: '#1e3a5f' },
        },
        {
          id: 't1',
          type: 'text',
          content: 'Marie Martin',
          x: 14,
          y: 21,
          w: 80,
          h: 8,
          z: 3,
          style: { font_size: 20, color: '#000000', bold: true },
        },
        {
          id: 't2',
          type: 'text',
          content: 'Directrice Marketing',
          x: 14,
          y: 35,
          w: 90,
          h: 5,
          z: 3,
          style: { font_size: 11, color: '#333333' },
        },
        {
          id: 't3',
          type: 'text',
          content: 'Experience',
          x: 80,
          y: 60,
          w: 100,
          h: 6,
          z: 3,
          style: { font_size: 12, bold: true },
        },
        {
          id: 't4',
          type: 'text',
          content: 'Head of Growth — ScaleUp',
          x: 80,
          y: 90,
          w: 110,
          h: 5,
          z: 3,
          style: { font_size: 10 },
        },
      ],
    },
  ],
  theme: { template_id: 'imported', color_body: '#1a1a1a' },
};

test('pickAtsSafeTemplate privilégie id minimal', () => {
  const picked = pickAtsSafeTemplate(TEMPLATES);
  assert.equal(picked.id, 'minimal');
});

test('pickAtsSafeTemplate ignore le premier ats-safe alphabétique (bold)', () => {
  // Tous les templates livrés portent `ats-safe` ; /api/templates liste
  // alphabétiquement → bold en premier. On doit quand même forcer minimal.
  const shippedLike = [
    { id: 'bold', name: 'Bold', tags: ['ats-safe', 'sidebar', 'photo', 'bold'] },
    { id: 'classic', name: 'Classic', tags: ['ats-safe', 'sidebar', 'photo'] },
    { id: 'elegant', name: 'Elegant', tags: ['ats-safe', 'single-column', 'no-sidebar'] },
    { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column', 'no-sidebar', 'minimal'] },
  ];
  assert.equal(pickAtsSafeTemplate(shippedLike).id, 'minimal');
});

test('pickAtsSafeTemplate sans minimal : single-column / no-sidebar', () => {
  const picked = pickAtsSafeTemplate([
    { id: 'bold', tags: ['ats-safe', 'sidebar'] },
    { id: 'elegant', tags: ['ats-safe', 'single-column', 'no-sidebar'] },
  ]);
  assert.equal(picked.id, 'elegant');
});

test('pickAtsSafeTemplate fallback minimal synthétique', () => {
  const picked = pickAtsSafeTemplate([{ id: 'classic', tags: ['sidebar'] }]);
  assert.equal(picked.id, 'minimal');
  assert.ok(picked.tags.includes('ats-safe'));
});

test('buildImportLayoutVariants retourne les 3 ids attendus', () => {
  const { variants } = buildImportLayoutVariants(DENSE_CV, TEMPLATES, {
    visionLayout: STRUCTURAL_LAYOUT,
  });
  assert.deepEqual(variants.map((v) => v.id), [...IMPORT_VARIANT_IDS]);
  for (const v of variants) {
    assert.ok(v.label);
    assert.ok(v.layout?.pages?.length >= 1);
    assert.ok(v.blockCount > 0);
  }
});

test('ats-safe force le template minimal', () => {
  const { variants } = buildImportLayoutVariants(DENSE_CV, TEMPLATES, {
    visionLayout: STRUCTURAL_LAYOUT,
    layoutHints: { template_match: 'executive' },
  });
  const ats = variants.find((v) => v.id === 'ats-safe');
  assert.equal(ats.recommendedTemplateId, 'minimal');
  assert.equal(ats.importSource, 'ats-safe');
});

test('design privilégie le layout structurel', () => {
  const { variants } = buildImportLayoutVariants(DENSE_CV, TEMPLATES, {
    visionLayout: STRUCTURAL_LAYOUT,
  });
  const design = variants.find((v) => v.id === 'design');
  assert.equal(design.importSource, 'structural');
  assert.equal(isStructuralLayout(design.layout), true);
});

test('mix part du structurel et applique ATS (importSource mix)', () => {
  const { variants } = buildImportLayoutVariants(DENSE_CV, TEMPLATES, {
    visionLayout: STRUCTURAL_LAYOUT,
  });
  const design = variants.find((v) => v.id === 'design');
  const mix = variants.find((v) => v.id === 'mix');
  assert.equal(mix.importSource, 'mix');
  assert.equal(mix.blockCount, design.blockCount);
  // Les layouts restent indépendants (pas la même référence).
  assert.notEqual(mix.layout, design.layout);
});

test('sans structurel : design tombe en preset, mix reste disponible', () => {
  const { variants } = buildImportLayoutVariants(DENSE_CV, TEMPLATES, {
    visionLayout: null,
  });
  const design = variants.find((v) => v.id === 'design');
  const mix = variants.find((v) => v.id === 'mix');
  assert.equal(design.importSource, 'preset');
  assert.equal(mix.importSource, 'mix');
  assert.ok(mix.layout?.pages?.length >= 1);
});
