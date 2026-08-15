/**
 * Tests unitaires composers sections (AXE-340).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlankLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  SECTION_COMPOSER_TYPES,
  SECTION_COMPOSER_VARIANTS,
  applySectionComposerToLayout,
  buildSectionComposerBlock,
  canPlaceSectionComposer,
  defaultSectionComposerState,
  mergeSectionComposerCv,
  resolveSectionComposerVariant,
} from '../../src/lib/sectionComposerPresets.js';

test('exposes all section composers with >= 2 variants', () => {
  assert.ok(SECTION_COMPOSER_TYPES.includes('contact'));
  assert.ok(SECTION_COMPOSER_TYPES.includes('experiences'));
  for (const type of SECTION_COMPOSER_TYPES) {
    assert.ok(
      (SECTION_COMPOSER_VARIANTS[type] || []).length >= 2,
      `${type} should have >= 2 variants`,
    );
    assert.equal(
      resolveSectionComposerVariant(type, 'unknown').id,
      SECTION_COMPOSER_VARIANTS[type][0].id,
    );
  }
});

test('contact: prefills and builds bind from checked fields', () => {
  const state = defaultSectionComposerState('contact', {
    email: 'a@b.c',
    telephone: '',
  });
  assert.equal(state.values.email, 'a@b.c');
  assert.equal(state.fields.email, true);
  const block = buildSectionComposerBlock('contact', {
    variantId: 'header_bar',
    fields: { email: true, telephone: false, linkedin: false },
  });
  assert.equal(block.type, 'contact');
  assert.deepEqual(block.bind, ['email']);
  assert.equal(block.style.contact_layout, 'header-bar');
});

test('resume + skills merge into cv without wiping other fields', () => {
  const withResume = mergeSectionComposerCv(
    'resume',
    { prenom: 'Ada', resume: 'old' },
    { text: 'New pitch' },
  );
  assert.equal(withResume.prenom, 'Ada');
  assert.equal(withResume.resume, 'New pitch');

  const withSkills = mergeSectionComposerCv(
    'skills',
    { competences: { techniques: ['x'], logiciels: ['Excel'] } },
    { skillsText: 'React\nSQL' },
  );
  assert.deepEqual(withSkills.competences.techniques, ['React', 'SQL']);
  assert.deepEqual(withSkills.competences.logiciels, ['Excel']);
});

test('experiences: replaces existing block (one instance)', () => {
  let layout = createBlankLayoutV3();
  layout = applySectionComposerToLayout(layout, 0, 'experiences', { variantId: 'compact' }).layout;
  const firstIds = layout.pages[0].blocks.filter((b) => b.type === 'experiences').map((b) => b.id);
  assert.equal(firstIds.length, 1);

  const second = applySectionComposerToLayout(layout, 0, 'experiences', { variantId: 'detailed' });
  const nextIds = second.layout.pages[0].blocks.filter((b) => b.type === 'experiences').map((b) => b.id);
  assert.equal(nextIds.length, 1);
  assert.notEqual(nextIds[0], firstIds[0]);
  assert.equal(second.placedIds[0], nextIds[0]);
  assert.equal(
    second.layout.pages[0].blocks.find((b) => b.id === nextIds[0]).style.exp_style,
    'bold',
  );
});

test('canPlace requires at least one contact field', () => {
  assert.equal(canPlaceSectionComposer('contact', { fields: {} }), false);
  assert.equal(canPlaceSectionComposer('contact', { fields: { email: true } }), true);
  assert.equal(canPlaceSectionComposer('photo', {}), true);
});

test('languages merge writes competences.langues', () => {
  const next = mergeSectionComposerCv(
    'languages',
    { competences: { techniques: ['Go'] } },
    { items: [{ langue: 'Français', niveau: 'C2' }] },
  );
  assert.deepEqual(next.competences.langues, [{ langue: 'Français', niveau: 'C2' }]);
  assert.deepEqual(next.competences.techniques, ['Go']);
});
