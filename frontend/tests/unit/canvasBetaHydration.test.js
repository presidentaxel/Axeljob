/**
 * Hydratation canvas Beta : page blanche vs auto-seed profil (AXE-345).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideBetaCanvasHydration } from '../../src/lib/canvasBetaHydration.js';
import { createBlankLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';

test('page blanche persistée (layout: null) : panel, pas de seed', () => {
  const d = decideBetaCanvasHydration({
    hasLayoutField: true,
    rawLayout: null,
    seedableProfile: true,
  });
  assert.equal(d.mode, 'blank');
  assert.equal(d.seed, false);
  assert.equal(d.startup, true);
});

test('layout serveur rempli : on le garde, pas de toast/seed', () => {
  const layout = createBlankLayoutV3();
  layout.pages[0].blocks = [{ id: 'b1', type: 'text', x: 0, y: 0, w: 10, h: 10 }];
  const d = decideBetaCanvasHydration({
    hasLayoutField: true,
    rawLayout: layout,
    seedableProfile: true,
  });
  assert.equal(d.mode, 'server');
  assert.equal(d.seed, false);
  assert.equal(d.startup, false);
});

test('brouillon local plein + pas de layout serveur : restaurer le draft', () => {
  const layout = createBlankLayoutV3();
  layout.pages[0].blocks = [{ id: 'b1', type: 'text', x: 0, y: 0, w: 10, h: 10 }];
  const d = decideBetaCanvasHydration({
    hasLayoutField: false,
    rawLayout: null,
    seedableProfile: true,
    localDraftLayout: layout,
  });
  assert.equal(d.mode, 'draft');
  assert.equal(d.seed, false);
  assert.equal(d.startup, false);
});

test('onboarding data-only sans layout : panel Comment commencer, pas de seed', () => {
  const d = decideBetaCanvasHydration({
    hasLayoutField: false,
    rawLayout: null,
    seedableProfile: true,
  });
  assert.equal(d.mode, 'blank');
  assert.equal(d.seed, false);
  assert.equal(d.startup, true);
});

test('profil vide sans layout : panel Comment commencer', () => {
  const d = decideBetaCanvasHydration({
    hasLayoutField: false,
    rawLayout: null,
    seedableProfile: false,
  });
  assert.equal(d.startup, true);
  assert.equal(d.seed, false);
});
