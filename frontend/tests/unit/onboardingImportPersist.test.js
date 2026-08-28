import assert from 'node:assert/strict';
import test from 'node:test';

import { isStructuralLayout } from '../../src/lib/canvasCvImportAdapter.js';
import {
  ONBOARDING_LAYOUT_COPIED_HINT,
  ONBOARDING_LAYOUT_MISSING_HINT,
  ONBOARDING_LAYOUT_TEXT_HINT,
  buildOnboardingImportPersist,
  onboardingLayoutHint,
  onboardingLayoutWasCopied,
} from '../../src/lib/onboardingImportPersist.js';

const DENSE_CV = {
  prenom: 'Marie',
  nom: 'Martin',
  titre_professionnel: 'Directrice Marketing',
  email: 'marie@ex.com',
  experiences: [
    { poste: 'Head of Growth', entreprise: 'ScaleUp', bullet_points: ['A'] },
  ],
  formations: [{ diplome: 'MBA', etablissement: 'HEC' }],
  competences: { techniques: ['SEO'], logiciels: [], langues: [], autres: [] },
};

const TEMPLATES = [
  { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column', 'no-sidebar'] },
  { id: 'classic', name: 'Classic', tags: ['sidebar', 'photo'] },
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
      ],
    },
  ],
  theme: { template_id: 'imported', color_body: '#1a1a1a' },
};

test('onboardingLayoutWasCopied : structurel et vision seulement', () => {
  assert.equal(onboardingLayoutWasCopied('structural'), true);
  assert.equal(onboardingLayoutWasCopied('vision-guided'), true);
  assert.equal(onboardingLayoutWasCopied('preset'), false);
  assert.equal(onboardingLayoutWasCopied('ats-safe'), false);
  assert.equal(onboardingLayoutWasCopied(''), false);
});

test('onboardingLayoutHint : copie OK vs Word vs texte vs policy', () => {
  assert.equal(onboardingLayoutHint({ layoutCopied: true }), ONBOARDING_LAYOUT_COPIED_HINT);
  assert.equal(
    onboardingLayoutHint({ method: 'upload', layoutCopied: false }),
    ONBOARDING_LAYOUT_MISSING_HINT,
  );
  assert.equal(
    onboardingLayoutHint({ method: 'text', layoutCopied: false }),
    ONBOARDING_LAYOUT_TEXT_HINT,
  );
  assert.equal(
    onboardingLayoutHint({
      method: 'upload',
      layoutCopied: false,
      importPolicy: { message: 'PDF scanné : pas de mise en page.' },
    }),
    'PDF scanné : pas de mise en page.',
  );
});

test('AXE-398: PDF structurel → persist layout design, pas un preset', () => {
  const result = buildOnboardingImportPersist(
    {
      cv: DENSE_CV,
      layout: STRUCTURAL_LAYOUT,
      layout_hints: { template_match: 'classic' },
      vision: { source: 'gemini_vision' },
    },
    TEMPLATES,
    { method: 'upload' },
  );
  assert.equal(result.cv.prenom, 'Marie');
  assert.equal(result.layoutCopied, true);
  assert.equal(result.importSource, 'structural');
  assert.equal(result.layoutHint, ONBOARDING_LAYOUT_COPIED_HINT);
  assert.ok(result.persistBody.layout);
  assert.equal(isStructuralLayout(result.persistBody.layout), true);
  assert.ok(result.persistBody.template_id);
  assert.notEqual(result.persistBody.template_id, 'imported');
});

test('AXE-398: Word / sans structurel → CV seul + message explicite', () => {
  const result = buildOnboardingImportPersist(
    { cv: DENSE_CV, layout: null, vision: {} },
    TEMPLATES,
    { method: 'upload' },
  );
  assert.equal(result.layoutCopied, false);
  assert.equal(result.importSource, 'preset');
  assert.equal(result.layoutHint, ONBOARDING_LAYOUT_MISSING_HINT);
  assert.equal(result.persistBody.prenom, 'Marie');
  assert.equal('layout' in result.persistBody, false);
  assert.equal('template_id' in result.persistBody, false);
});

test('AXE-398: coller-texte → hint dédié, pas de layout', () => {
  const result = buildOnboardingImportPersist(
    { cv: DENSE_CV },
    TEMPLATES,
    { method: 'text' },
  );
  assert.equal(result.layoutCopied, false);
  assert.equal(result.layoutHint, ONBOARDING_LAYOUT_TEXT_HINT);
  assert.equal('layout' in result.persistBody, false);
});

test('AXE-398: vision-guided sans structurel → persist layout', () => {
  const result = buildOnboardingImportPersist(
    {
      cv: DENSE_CV,
      layout: null,
      vision: {
        source: 'gemini_vision',
        template_match: 'classic',
        confidence: 0.92,
        layout_style: 'sidebar-left',
      },
      layout_hints: { template_match: 'classic' },
    },
    TEMPLATES,
    { method: 'upload' },
  );
  assert.equal(result.layoutCopied, true);
  assert.equal(result.importSource, 'vision-guided');
  assert.ok(result.persistBody.layout);
  assert.equal(result.persistBody.template_id, 'classic');
});
