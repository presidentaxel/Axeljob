import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultImportVariantId,
  importChooserToastMessage,
  isBestAtsVariant,
  mergeBuiltAndScoredVariants,
  resolveImportVariant,
  sortImportVariantsForChooser,
} from '../../src/lib/importLayoutChooser.js';

test('defaultImportVariantId privilégie design', () => {
  assert.equal(
    defaultImportVariantId([
      { id: 'ats-safe', delta_vs_best: 0 },
      { id: 'design', delta_vs_best: -10 },
      { id: 'mix', delta_vs_best: -5 },
    ]),
    'design',
  );
});

test('defaultImportVariantId sans design : meilleur score', () => {
  assert.equal(
    defaultImportVariantId([
      { id: 'ats-safe', delta_vs_best: 0, score_json: { total: 95 } },
      { id: 'mix', delta_vs_best: -8, score_json: { total: 87 } },
    ]),
    'ats-safe',
  );
});

test('resolveImportVariant fallback design', () => {
  const variants = [
    { id: 'ats-safe', layout: { a: 1 } },
    { id: 'design', layout: { b: 2 } },
  ];
  assert.equal(resolveImportVariant(variants, 'ghost').id, 'design');
  assert.equal(resolveImportVariant(variants, 'ats-safe').id, 'ats-safe');
});

test('mergeBuiltAndScoredVariants conserve layout built', () => {
  const layoutA = { pages: [{ id: 'p1', blocks: [] }] };
  const merged = mergeBuiltAndScoredVariants(
    [{ id: 'ats-safe', layout: layoutA, label: 'ATS-safe', blockCount: 3 }],
    [{
      id: 'ats-safe',
      layout: { pages: [] },
      score_json: { total: 91 },
      delta_vs_best: 0,
    }],
  );
  assert.equal(merged[0].layout, layoutA);
  assert.equal(merged[0].score_json.total, 91);
  assert.equal(merged[0].delta_vs_best, 0);
});

test('mergeBuiltAndScoredVariants sans score : delta null (pas faux meilleur)', () => {
  const merged = mergeBuiltAndScoredVariants(
    [
      { id: 'ats-safe', layout: {} },
      { id: 'design', layout: {} },
    ],
    [],
  );
  assert.equal(merged[0].delta_vs_best, null);
  assert.equal(merged[0].score_json, null);
  assert.equal(merged[1].delta_vs_best, null);
  assert.equal(isBestAtsVariant(merged[0]), false);
});

test('isBestAtsVariant exige un score', () => {
  assert.equal(isBestAtsVariant({ delta_vs_best: 0 }), false);
  assert.equal(
    isBestAtsVariant({ delta_vs_best: 0, score_json: { total: 95 } }),
    true,
  );
  assert.equal(
    isBestAtsVariant({ delta_vs_best: -5, score_json: { total: 80 } }),
    false,
  );
});

test('sortImportVariantsForChooser ordre produit', () => {
  const sorted = sortImportVariantsForChooser([
    { id: 'mix' },
    { id: 'ats-safe' },
    { id: 'design' },
  ]);
  assert.deepEqual(sorted.map((v) => v.id), ['ats-safe', 'design', 'mix']);
});

test('importChooserToastMessage inclut score', () => {
  const msg = importChooserToastMessage({
    id: 'mix',
    label: 'Mix',
    blockCount: 12,
    score_json: { total: 88 },
  });
  assert.match(msg, /12/);
  assert.match(msg, /88/);
  assert.match(msg, /mix/i);
});
