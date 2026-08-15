/**
 * Tests mapping rule → messages coach + corrections actionnables (AXE-36 / AXE-333).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATS_COACH_ADVICE,
  filterRulesForCoachMode,
  getAtsCoachAdvice,
  isAtsCoachRuleFixable,
  summarizeAtsCoachStatus,
} from '../../src/lib/atsCoachAdvice.js';
import {
  applyAtsCoachFix,
  didAtsCoachFixChangeLayout,
  formatAtsScoreImpact,
} from '../../src/lib/atsCoachFixes.js';

test('chaque entrée ATS_COACH_ADVICE a title + explanation', () => {
  for (const [id, advice] of Object.entries(ATS_COACH_ADVICE)) {
    assert.ok(advice.title?.trim(), `title manquant pour ${id}`);
    assert.ok(advice.explanation?.trim(), `explanation manquante pour ${id}`);
  }
});

test('chaque règle non fixable a une raison explicite', () => {
  for (const [id, advice] of Object.entries(ATS_COACH_ADVICE)) {
    if (advice.fixKind) continue;
    assert.ok(
      advice.notApplicableReason?.trim(),
      `notApplicableReason manquant pour ${id}`,
    );
  }
});

test('getAtsCoachAdvice mappe les règles clés en langage clair', () => {
  assert.match(
    getAtsCoachAdvice({ id: 'malus_contact_low_on_page' }).title,
    /contact/i,
  );
  assert.match(
    getAtsCoachAdvice({ id: 'malus_free_canvas_reading_order' }).explanation,
    /haut|lecture|ATS/i,
  );
  assert.equal(
    getAtsCoachAdvice({ id: 'malus_experiences_before_resume' }).fixKind,
    'reading-order',
  );
});

test('getAtsCoachAdvice préfère advice API si fourni', () => {
  const advice = getAtsCoachAdvice({
    id: 'malus_contact_low_on_page',
    advice: 'Message backend prioritaire.',
  });
  assert.equal(advice.explanation, 'Message backend prioritaire.');
});

test('isAtsCoachRuleFixable pour contact, ordre, sections, photo', () => {
  assert.equal(isAtsCoachRuleFixable('malus_contact_low_on_page'), true);
  assert.equal(isAtsCoachRuleFixable('malus_identity_not_first'), true);
  assert.equal(isAtsCoachRuleFixable('malus_free_canvas_missing_profile_sections'), true);
  assert.equal(isAtsCoachRuleFixable('malus_photo_present'), true);
  assert.equal(isAtsCoachRuleFixable('malus_missing_identity'), false);
});

test('filterRulesForCoachMode masque les bonus en mode design', () => {
  const rules = [
    { id: 'bonus_mono_column', delta: 10 },
    { id: 'malus_contact_low_on_page', delta: -3 },
  ];
  assert.deepEqual(
    filterRulesForCoachMode(rules, 'design').map((r) => r.id),
    ['malus_contact_low_on_page'],
  );
  assert.equal(filterRulesForCoachMode(rules, 'ats-safe').length, 2);
});

test('summarizeAtsCoachStatus distingue bon score et risques', () => {
  assert.match(summarizeAtsCoachStatus(95, []), /Excellent/);
  assert.match(
    summarizeAtsCoachStatus(92, [{ delta: -3 }, { delta: -2 }]),
    /2 risques/,
  );
});

test('formatAtsScoreImpact affiche avant → après', () => {
  assert.equal(formatAtsScoreImpact(86, 79), 'Impact score : 86 → 79 ↓');
  assert.equal(formatAtsScoreImpact(70, 70), 'Impact score : aucun (70/100)');
});

test('applyAtsCoachFix remonte un contact trop bas', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'c1', type: 'contact', x: 10, y: 120, w: 80, h: 20, z: 1, style: {} },
      ],
    }],
  };
  const next = applyAtsCoachFix(layout, 'malus_contact_low_on_page');
  assert.ok(next.pages[0].blocks[0].y <= 40);
  assert.equal(didAtsCoachFixChangeLayout(layout, next), true);
});

test('applyAtsCoachFix reading-order empile identity avant experiences', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'exp', type: 'experiences', x: 10, y: 10, w: 180, h: 40, z: 2, style: {} },
        { id: 'id', type: 'identity', x: 10, y: 80, w: 180, h: 20, z: 1, style: {} },
      ],
    }],
  };
  const next = applyAtsCoachFix(layout, 'malus_identity_not_first');
  const identity = next.pages[0].blocks.find((b) => b.id === 'id');
  const experiences = next.pages[0].blocks.find((b) => b.id === 'exp');
  assert.ok(identity.y < experiences.y);
});

test('applyAtsCoachFix ajoute les sections manquantes du profil', () => {
  const cv = {
    prenom: 'Alice',
    nom: 'Martin',
    email: 'a@b.fr',
    experiences: [{ poste: 'Dev', entreprise: 'Acme' }],
  };
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{ id: 'page-1', blocks: [] }],
  };
  const next = applyAtsCoachFix(layout, 'malus_free_canvas_missing_profile_sections', { cv });
  const types = new Set(next.pages[0].blocks.map((b) => b.type));
  assert.ok(types.has('identity'));
  assert.ok(types.has('contact'));
  assert.ok(types.has('experiences'));
  assert.equal(didAtsCoachFixChangeLayout(layout, next), true);
});

test('applyAtsCoachFix no-semantic pose un starter même si CV vide', () => {
  // Bugbot : ne plus no-op quand canvas vide + profil vide.
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{ id: 'page-1', blocks: [] }],
  };
  const next = applyAtsCoachFix(layout, 'malus_free_canvas_no_semantic_blocks', { cv: {} });
  const types = new Set(next.pages[0].blocks.map((b) => b.type));
  assert.ok(types.has('identity'));
  assert.ok(types.has('contact'));
  assert.equal(didAtsCoachFixChangeLayout(layout, next), true);
});

test('applyAtsCoachFix hide-photo masque theme et retire le bloc', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: { show_photo: true },
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'ph', type: 'photo', x: 10, y: 10, w: 28, h: 28, z: 1, style: {} },
        { id: 'id', type: 'identity', x: 50, y: 10, w: 100, h: 20, z: 2, style: {} },
      ],
    }],
  };
  const next = applyAtsCoachFix(layout, 'malus_photo_present');
  assert.equal(next.theme.show_photo, false);
  assert.equal(next.pages[0].blocks.some((b) => b.type === 'photo'), false);
});

test('applyAtsCoachFix fix-font et body size changent le theme', () => {
  const layout = {
    version: 3,
    grid: 'single-or-sidebar',
    theme: { font_heading: 'Papyrus', font_body: 'Comic Sans', font_size_body: 7 },
    pages: [{ id: 'p1', blocks: [] }],
  };
  const fonts = applyAtsCoachFix(layout, 'malus_exotic_font');
  assert.equal(fonts.theme.font_heading, 'Arial');
  assert.equal(fonts.theme.font_body, 'Arial');
  const size = applyAtsCoachFix(layout, 'malus_body_font_size_out_of_range');
  assert.equal(size.theme.font_size_body, 10);
});

test('applyAtsCoachFix single-column retire la sidebar template', () => {
  const layout = {
    grid: 'single-or-sidebar',
    sidebar_ratio: 0.35,
    theme: {},
    pages: [{ id: 'p1', blocks: [] }],
  };
  const next = applyAtsCoachFix(layout, 'malus_sidebar_present');
  assert.equal(next.sidebar_ratio, 0);
});
