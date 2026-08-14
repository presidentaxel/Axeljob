import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachDeltaVsBest,
  listDifferentialRuleIds,
  scoreImportLayoutVariants,
  toScoreJson,
} from '../../src/lib/scoreImportLayoutVariants.js';
import { buildImportLayoutVariants } from '../../src/lib/importLayoutVariants.js';
import { ATS_SCORE_PARSING_ENDPOINT } from '../../src/lib/atsScoreClient.js';

const CV = {
  prenom: 'Marie',
  nom: 'Martin',
  email: 'marie@ex.com',
  titre_professionnel: 'Directrice Marketing',
  experiences: [{ poste: 'CMO', entreprise: 'Corp', bullet_points: ['A'] }],
  formations: [],
  competences: { techniques: ['SEO'], logiciels: [], langues: [], autres: [] },
};

const TEMPLATES = [
  { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column', 'no-sidebar'] },
  { id: 'classic', name: 'Classic', tags: ['ats-safe', 'sidebar'] },
];

const LAYOUT_A = {
  version: 3,
  format: 'A4',
  grid: 'free',
  pages: [{ id: 'p1', blocks: [{ id: 't1', type: 'text', x: 10, y: 10, w: 40, h: 8 }] }],
};
const LAYOUT_B = {
  ...LAYOUT_A,
  pages: [{
    id: 'p1',
    blocks: [
      { id: 't1', type: 'text', x: 10, y: 10, w: 40, h: 8 },
      { id: 't2', type: 'text', x: 10, y: 30, w: 40, h: 8 },
    ],
  }],
};

test('toScoreJson mappe la shape API (block_ids)', () => {
  const json = toScoreJson({
    score: 88,
    version: '2026.05.2',
    kind: 'parsing',
    rules: [{
      id: 'malus_sidebar_present',
      label: 'Sidebar',
      delta: -5,
      severity: 'warning',
      blockIds: ['sb'],
      advice: 'Retirer',
    }],
  });
  assert.equal(json.total, 88);
  assert.deepEqual(json.rules[0].block_ids, ['sb']);
  assert.equal('blockIds' in json.rules[0], false);
});

test('attachDeltaVsBest : meilleur à 0, autres négatifs', () => {
  const out = attachDeltaVsBest([
    { id: 'ats-safe', score_json: { total: 95 } },
    { id: 'design', score_json: { total: 80 } },
    { id: 'mix', score_json: { total: 90 } },
  ]);
  assert.equal(out.find((v) => v.id === 'ats-safe').delta_vs_best, 0);
  assert.equal(out.find((v) => v.id === 'design').delta_vs_best, -15);
  assert.equal(out.find((v) => v.id === 'mix').delta_vs_best, -5);
});

test('listDifferentialRuleIds isole les règles hors meilleure variante', () => {
  const scored = attachDeltaVsBest([
    {
      id: 'ats-safe',
      score_json: { total: 100, rules: [{ id: 'bonus_contact' }] },
    },
    {
      id: 'design',
      score_json: {
        total: 85,
        rules: [{ id: 'bonus_contact' }, { id: 'malus_sidebar_present' }],
      },
    },
  ]);
  const diff = listDifferentialRuleIds(scored);
  assert.deepEqual(diff['ats-safe'], []);
  assert.deepEqual(diff.design, ['malus_sidebar_present']);
});

test('scoreImportLayoutVariants appelle score-parsing en parallèle', async () => {
  const calls = [];
  const fetcher = async (path, body) => {
    calls.push({ path, layoutBlocks: body.layout?.pages?.[0]?.blocks?.length || 0 });
    assert.equal(path, ATS_SCORE_PARSING_ENDPOINT);
    assert.equal(body.cv.email, CV.email);
    const total = body.layout.pages[0].blocks.length === 1 ? 95 : 80;
    return {
      kind: 'parsing',
      total,
      version: '2026.05.2',
      rules: total < 90
        ? [{ id: 'malus_x', label: 'x', delta: -15, severity: 'warning', block_ids: [] }]
        : [],
    };
  };

  const { variants, best_total, differential_rule_ids } = await scoreImportLayoutVariants(
    [
      { id: 'ats-safe', label: 'ATS-safe', layout: LAYOUT_A },
      { id: 'design', label: 'Design', layout: LAYOUT_B },
    ],
    CV,
    { fetcher },
  );

  assert.equal(calls.length, 2);
  assert.equal(best_total, 95);
  assert.equal(variants.find((v) => v.id === 'ats-safe').delta_vs_best, 0);
  assert.equal(variants.find((v) => v.id === 'design').delta_vs_best, -15);
  assert.equal(variants.find((v) => v.id === 'design').score_json.total, 80);
  assert.ok(differential_rule_ids.design.includes('malus_x'));
});

test('scoreImportLayoutVariants + buildImportLayoutVariants (pipeline AXE-324)', async () => {
  const scoreByVariantId = {
    'ats-safe': 98,
    design: 72,
    mix: 88,
  };
  const { variants: built } = buildImportLayoutVariants(CV, TEMPLATES, {
    visionLayout: null,
  });
  assert.equal(built.length, 3);

  const layoutToId = new WeakMap();
  for (const v of built) {
    layoutToId.set(v.layout, v.id);
  }

  const fetcher = async (_path, body) => {
    const id = layoutToId.get(body.layout);
    assert.ok(id, 'layout doit correspondre à une variante');
    return { kind: 'parsing', total: scoreByVariantId[id], version: 't', rules: [] };
  };

  const { variants, best_total } = await scoreImportLayoutVariants(built, CV, { fetcher });
  assert.equal(best_total, 98);
  assert.deepEqual(
    variants.map((v) => ({ id: v.id, delta: v.delta_vs_best, total: v.score_json.total })),
    [
      { id: 'ats-safe', delta: 0, total: 98 },
      { id: 'design', delta: -26, total: 72 },
      { id: 'mix', delta: -10, total: 88 },
    ],
  );
});

test('scoreImportLayoutVariants refuse layout manquant', async () => {
  await assert.rejects(
    () => scoreImportLayoutVariants([{ id: 'ats-safe' }], CV, {
      fetcher: async () => ({ total: 1 }),
    }),
    /layout missing/,
  );
});
