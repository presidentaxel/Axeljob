import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cvFromImportPayload,
  extractImportApiResponse,
  finishImportLoadingAnimation,
  isSparseImportedCv,
  ONBOARDING_IMPORT_STEPS,
  onboardingImportErrorMessage,
} from '../../src/lib/cvImportUtils.js';

test('extractImportApiResponse : import_policy exposé', () => {
  const result = extractImportApiResponse({
    cv: { prenom: 'Camille' },
    layout_hints: { template_match: 'minimal' },
    layout: null,
    vision: { source: 'gemini_vision' },
    import_policy: {
      ocr: false,
      layout_fallback: 'text_ai_vision_or_preset',
      message: 'note policy',
    },
  });
  assert.equal(result.cv.prenom, 'Camille');
  assert.equal(result.importPolicy?.ocr, false);
  assert.equal(result.importPolicy?.layout_fallback, 'text_ai_vision_or_preset');
  assert.equal(result.importPolicy?.message, 'note policy');
});

test('extractImportApiResponse : sans policy → null', () => {
  const result = extractImportApiResponse({ cv: { nom: 'Durand' } });
  assert.equal(result.importPolicy, null);
});

test('AXE-344: cvFromImportPayload aplatit identity/contact imbriqués', () => {
  const cv = cvFromImportPayload({
    identity: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      titre_professionnel: 'Mathématicienne',
    },
    contact: {
      email: 'ada@ex.com',
      telephone: '0600000000',
      linkedin: 'https://linkedin.com/in/ada',
      ville: 'Londres',
    },
    experiences: [{ poste: 'Analyste', entreprise: 'Babbage', bullet_points: [] }],
  });
  assert.equal(cv.prenom, 'Ada');
  assert.equal(cv.nom, 'Lovelace');
  assert.equal(cv.first_name, 'Ada');
  assert.equal(cv.last_name, 'Lovelace');
  assert.equal(cv.email, 'ada@ex.com');
  assert.equal(cv.telephone, '0600000000');
  assert.equal(cv.titre_professionnel, 'Mathématicienne');
  assert.equal(cv.ville, 'Londres');
  assert.equal(cv.experiences.length, 1);
});

test('AXE-341: CV importé vide = sparse', () => {
  assert.equal(isSparseImportedCv(null), true);
  assert.equal(isSparseImportedCv({}), true);
  assert.equal(isSparseImportedCv({ prenom: 'Ada' }), false);
  assert.equal(isSparseImportedCv({ experiences: [{ poste: 'Analyste' }] }), false);
});

test('AXE-341: messages d’erreur d’analyse à l’onboarding', () => {
  assert.match(onboardingImportErrorMessage({ status: 429 }), /Quota/);
  assert.match(onboardingImportErrorMessage({ status: 502 }), /analyse n’a pas abouti/);
  assert.equal(
    onboardingImportErrorMessage({ status: 400, message: 'PDF scanné.' }),
    'PDF scanné.',
  );
});

test('AXE-341: finishImportLoadingAnimation respecte la liste d’étapes', () => {
  let idx = 0;
  finishImportLoadingAnimation((value) => { idx = value; }, {
    steps: ONBOARDING_IMPORT_STEPS,
  });
  assert.equal(idx, ONBOARDING_IMPORT_STEPS.length - 1);
});
