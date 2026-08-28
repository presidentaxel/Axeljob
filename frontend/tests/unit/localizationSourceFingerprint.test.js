import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localizationSourceFingerprint } from '../../src/lib/localizationSourceFingerprint.js';

test('empreinte inchangée si seules les options de template bougent', () => {
  const cv = {
    titre_professionnel: 'Analyste',
    resume: 'Trois ans d’expérience.',
    template_options: { font: 'Georgia' },
    experiences: [{ id: 'exp_1', poste: 'Analyste', bullet_points: ['Suivi'] }],
  };
  const a = localizationSourceFingerprint(cv);
  const b = localizationSourceFingerprint({
    ...cv,
    template_options: { font: 'Inter', font_size_body: 8 },
  });
  assert.equal(a, b);
});

test('empreinte change si le résumé ou une expérience change', () => {
  const cv = {
    titre_professionnel: 'Analyste',
    resume: 'Trois ans d’expérience.',
    experiences: [{ id: 'exp_1', poste: 'Analyste', bullet_points: ['Suivi'] }],
  };
  const a = localizationSourceFingerprint(cv);
  assert.notEqual(a, localizationSourceFingerprint({ ...cv, resume: 'Nouveau résumé.' }));
  assert.notEqual(
    a,
    localizationSourceFingerprint({
      ...cv,
      experiences: [{ id: 'exp_1', poste: 'Analyste', bullet_points: ['Suivi des limites'] }],
    }),
  );
  assert.notEqual(
    a,
    localizationSourceFingerprint({
      ...cv,
      experiences: [{ id: 'exp_1', poste: 'Analyste', entreprise: 'Autre SAS', bullet_points: ['Suivi'] }],
    }),
  );
});
