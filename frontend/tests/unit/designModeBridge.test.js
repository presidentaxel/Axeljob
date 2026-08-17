/**
 * Tests unitaires pont design Stable ↔ Beta (AXE-335).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlankLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  applyStableDesignToCanvas,
  assessCrossModeDiff,
  buildBetaToStableOffer,
  buildStableToBetaOffer,
  canBuildCanvasForTemplate,
  dismissDesignBridge,
  isDesignBridgeDismissed,
  resolveTemplateFromList,
  suggestStableTemplateIdFromLayout,
} from '../../src/lib/designModeBridge.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

const templates = [
  { id: 'minimal', name: 'Minimal' },
  { id: 'modern', name: 'Modern' },
  { id: 'custom_unknown', name: 'Perso' },
];

test('resolveTemplateFromList finds by id', () => {
  assert.equal(resolveTemplateFromList(templates, 'modern')?.id, 'modern');
  assert.equal(resolveTemplateFromList(templates, 'nope'), null);
});

test('canBuildCanvasForTemplate accepts known HTML twins', () => {
  assert.equal(canBuildCanvasForTemplate({ id: 'minimal' }), true);
  assert.equal(canBuildCanvasForTemplate({ id: 'custom_unknown' }), false);
});

test('applyStableDesignToCanvas builds non-empty layout from Stable template', () => {
  const cv = {
    prenom: 'Ada',
    nom: 'Lovelace',
    email: 'ada@example.com',
    experiences: [{ poste: 'Engineer', entreprise: 'Analytical' }],
  };
  const result = applyStableDesignToCanvas(cv, { id: 'minimal' }, { templatesList: templates });
  assert.equal(result.ok, true);
  assert.ok(result.layout?.pages?.[0]?.blocks?.length > 0);
  assert.equal(result.templateId, 'minimal');
});

test('buildStableToBetaOffer only when canvas empty + projectable template', () => {
  const blank = createBlankLayoutV3();
  const offer = buildStableToBetaOffer(blank, 'minimal', templates, { storage: makeStorage() });
  assert.ok(offer);
  assert.equal(offer.direction, 'stable_to_beta');
  assert.equal(offer.templateId, 'minimal');

  const filled = {
    ...blank,
    pages: [{ ...blank.pages[0], blocks: [{ id: 'b1', type: 'text', x: 10, y: 10, w: 40, h: 10, z: 1 }] }],
  };
  assert.equal(buildStableToBetaOffer(filled, 'minimal', templates, { storage: makeStorage() }), null);
});

test('buildBetaToStableOffer when theme template differs', () => {
  const layout = {
    version: 3,
    theme: { template_id: 'modern' },
    pages: [{ blocks: [{ id: 'b1', type: 'identity', x: 10, y: 10, w: 40, h: 20, z: 1 }] }],
  };
  const offer = buildBetaToStableOffer(layout, 'minimal', { storage: makeStorage() });
  assert.ok(offer);
  assert.equal(offer.direction, 'beta_to_stable');
  assert.equal(offer.templateId, 'modern');
});

test('suggestStableTemplateIdFromLayout reads theme', () => {
  assert.equal(suggestStableTemplateIdFromLayout({ theme: { template_id: 'elegant' } }), 'elegant');
  assert.equal(suggestStableTemplateIdFromLayout({}), '');
});

test('assessCrossModeDiff warns on freeform', () => {
  const layout = {
    version: 3,
    freeform: true,
    theme: { template_id: 'modern' },
    pages: [{ blocks: [{ id: 't1', type: 'text', content: 'Note', x: 10, y: 10, w: 40, h: 10, z: 1 }] }],
  };
  const diff = assessCrossModeDiff(layout, 'minimal');
  assert.equal(diff.freeform, true);
  assert.ok(diff.warnings.some((w) => /libre/i.test(w)));
});

test('dismissDesignBridge suppresses future offers', () => {
  const storage = makeStorage();
  const blank = createBlankLayoutV3();
  assert.ok(buildStableToBetaOffer(blank, 'minimal', templates, { storage }));
  dismissDesignBridge('stable_to_beta', 'minimal', storage);
  assert.equal(isDesignBridgeDismissed('stable_to_beta', 'minimal', storage), true);
  assert.equal(buildStableToBetaOffer(blank, 'minimal', templates, { storage }), null);
});
