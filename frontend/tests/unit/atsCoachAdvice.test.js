/**
 * Tests mapping rule → messages coach (AXE-36).
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
import { applyAtsCoachFix, formatAtsScoreImpact } from '../../src/lib/atsCoachFixes.js';

test('chaque entrée ATS_COACH_ADVICE a title + explanation', () => {
  for (const [id, advice] of Object.entries(ATS_COACH_ADVICE)) {
    assert.ok(advice.title?.trim(), `title manquant pour ${id}`);
    assert.ok(advice.explanation?.trim(), `explanation manquante pour ${id}`);
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

test('isAtsCoachRuleFixable pour contact et ordre', () => {
  assert.equal(isAtsCoachRuleFixable('malus_contact_low_on_page'), true);
  assert.equal(isAtsCoachRuleFixable('malus_identity_not_first'), true);
  assert.equal(isAtsCoachRuleFixable('malus_photo_present'), false);
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
});
