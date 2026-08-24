import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cvTemplateCopy } from '../../src/lib/cvTemplateCopy.js';

test('titres de section FR par défaut', () => {
  const st = cvTemplateCopy('fr');
  assert.equal(st.experience, 'EXPÉRIENCE PROFESSIONNELLE');
  assert.equal(st.education_title, 'Formation');
});

test('titres de section EN si langue du CV est en', () => {
  const st = cvTemplateCopy('en');
  assert.equal(st.experience, 'PROFESSIONAL EXPERIENCE');
  assert.equal(st.education_title, 'Education');
  assert.equal(st.clients, 'Clients:');
});
