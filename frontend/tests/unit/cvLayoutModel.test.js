/**
 * Tests unitaires du modele `layout` (cf. cvLayoutModel.js).
 * Couvre createDefault, sanitize (entree corrompue), move, set ratio,
 * isDefault et getOrderedSectionEntries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_SECTION_KEYS,
  SIDEBAR_RATIOS,
  createDefaultLayout,
  frontendLayoutToScoringLayout,
  getOrderedSectionEntries,
  isDefaultLayout,
  moveSectionInLayout,
  resetLayout,
  sanitizeLayout,
  setSidebarRatio,
} from '../../src/lib/cvLayoutModel.js';

test('createDefaultLayout : ordre canonique, mono-colonne, theme neutre', () => {
  const def = createDefaultLayout();
  assert.deepEqual(def.sectionsOrder, [...CANONICAL_SECTION_KEYS]);
  assert.equal(def.sidebarRatio, 0);
  assert.equal(def.theme, 'neutral');
});

test('createDefaultLayout : retourne des objets distincts (pas de partage)', () => {
  const a = createDefaultLayout();
  const b = createDefaultLayout();
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.sectionsOrder, b.sectionsOrder);
});

test('sanitizeLayout : null/undefined -> defaut', () => {
  assert.deepEqual(sanitizeLayout(null), createDefaultLayout());
  assert.deepEqual(sanitizeLayout(undefined), createDefaultLayout());
  assert.deepEqual(sanitizeLayout('not-an-object'), createDefaultLayout());
});

test('sanitizeLayout : retire les cles inconnues et dedoublonne', () => {
  const result = sanitizeLayout({
    sectionsOrder: ['experiences', 'unknown', 'experiences', 'resume', 'formations'],
  });
  assert.equal(result.sectionsOrder.includes('unknown'), false);
  const expCount = result.sectionsOrder.filter((k) => k === 'experiences').length;
  assert.equal(expCount, 1);
});

test('sanitizeLayout : complete avec les cles canoniques manquantes en fin', () => {
  const result = sanitizeLayout({ sectionsOrder: ['experiences'] });
  assert.equal(result.sectionsOrder[0], 'experiences');
  for (const key of CANONICAL_SECTION_KEYS) {
    assert.ok(result.sectionsOrder.includes(key));
  }
  assert.equal(result.sectionsOrder.length, CANONICAL_SECTION_KEYS.length);
});

test('sanitizeLayout : sidebarRatio invalide -> 0', () => {
  assert.equal(sanitizeLayout({ sidebarRatio: 99 }).sidebarRatio, 0);
  assert.equal(sanitizeLayout({ sidebarRatio: '30' }).sidebarRatio, 0, 'string refused');
});

test('sanitizeLayout : sidebarRatio valide preserve', () => {
  for (const r of SIDEBAR_RATIOS) {
    assert.equal(sanitizeLayout({ sidebarRatio: r }).sidebarRatio, r);
  }
});

test('sanitizeLayout : theme inconnu -> neutral', () => {
  assert.equal(sanitizeLayout({ theme: 'dark' }).theme, 'neutral');
  assert.equal(sanitizeLayout({ theme: 42 }).theme, 'neutral');
});

test('isDefaultLayout : true sur defaut, false sur reorder', () => {
  assert.equal(isDefaultLayout(createDefaultLayout()), true);
  assert.equal(isDefaultLayout(null), true, 'null -> sanitize -> defaut');
  const reordered = moveSectionInLayout(createDefaultLayout(), 0, 2);
  assert.equal(isDefaultLayout(reordered), false);
});

test('moveSectionInLayout : deplace en respectant l ordre', () => {
  const init = createDefaultLayout();
  const moved = moveSectionInLayout(init, 0, 2);
  assert.equal(moved.sectionsOrder[2], CANONICAL_SECTION_KEYS[0]);
  assert.equal(moved.sectionsOrder[0], CANONICAL_SECTION_KEYS[1]);
  assert.equal(moved.sectionsOrder[1], CANONICAL_SECTION_KEYS[2]);
});

test('moveSectionInLayout : indices hors bornes -> sanitized inchange', () => {
  const init = createDefaultLayout();
  const result = moveSectionInLayout(init, 99, 0);
  assert.deepEqual(result.sectionsOrder, init.sectionsOrder);
  const result2 = moveSectionInLayout(init, 0, 99);
  assert.deepEqual(result2.sectionsOrder, init.sectionsOrder);
});

test('moveSectionInLayout : from == to -> sanitized inchange', () => {
  const init = createDefaultLayout();
  const result = moveSectionInLayout(init, 1, 1);
  assert.deepEqual(result.sectionsOrder, init.sectionsOrder);
});

test('moveSectionInLayout : non-mutant', () => {
  const init = createDefaultLayout();
  const initOrder = init.sectionsOrder.slice();
  moveSectionInLayout(init, 0, 2);
  assert.deepEqual(init.sectionsOrder, initOrder, 'le layout d entree n est pas mute');
});

test('setSidebarRatio : ratio valide', () => {
  const l = setSidebarRatio(createDefaultLayout(), 30);
  assert.equal(l.sidebarRatio, 30);
});

test('setSidebarRatio : ratio invalide -> inchange', () => {
  const init = createDefaultLayout();
  const l = setSidebarRatio(init, 99);
  assert.equal(l.sidebarRatio, init.sidebarRatio);
});

test('resetLayout : equivalent au defaut', () => {
  const reset = resetLayout();
  assert.deepEqual(reset, createDefaultLayout());
});

test('getOrderedSectionEntries : labels resolus', () => {
  const entries = getOrderedSectionEntries(createDefaultLayout());
  assert.equal(entries.length, CANONICAL_SECTION_KEYS.length);
  assert.equal(entries[0].key, 'resume');
  assert.equal(entries[0].label, 'Résumé');
  for (const e of entries) {
    assert.ok(e.label, `label manquant pour ${e.key}`);
  }
});

test('getOrderedSectionEntries : sanitise une entree corrompue', () => {
  const entries = getOrderedSectionEntries({ sectionsOrder: ['experiences', 'fake'] });
  assert.equal(entries.length, CANONICAL_SECTION_KEYS.length);
  assert.equal(entries[0].key, 'experiences');
});

test('frontendLayoutToScoringLayout : conversion camelCase -> snake_case', () => {
  const payload = frontendLayoutToScoringLayout(createDefaultLayout(), { templateId: 'classic' });
  assert.equal(payload.template_id, 'classic');
  assert.equal(payload.format, 'A4');
  assert.equal(payload.sidebar_ratio, 0);
  assert.equal(payload.grid, 'single-column');
  assert.deepEqual(payload.sections_order, [...CANONICAL_SECTION_KEYS]);
  assert.equal(payload.metadata.source, 'editor_beta_layout');
});

test('frontendLayoutToScoringLayout : ratio % -> float 0..1', () => {
  const payload = frontendLayoutToScoringLayout(setSidebarRatio(createDefaultLayout(), 33));
  assert.equal(payload.sidebar_ratio, 0.33);
  assert.equal(payload.grid, 'single-or-sidebar');
});

test('frontendLayoutToScoringLayout : reorder propage', () => {
  const layout = moveSectionInLayout(createDefaultLayout(), 0, 2);
  const payload = frontendLayoutToScoringLayout(layout);
  assert.equal(payload.sections_order[2], 'resume');
});

test('frontendLayoutToScoringLayout : sans templateId -> null', () => {
  const payload = frontendLayoutToScoringLayout(createDefaultLayout());
  assert.equal(payload.template_id, null);
});
