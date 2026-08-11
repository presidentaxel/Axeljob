/**
 * Tests unitaires du store undo/redo (`lib/layoutHistoryStore.js`).
 *
 * Couverture :
 *  - createHistoryStore : forme initiale
 *  - getPresent / canUndo / canRedo / getHistoryDepth
 *  - commit (dur, no-op si meme ref, coalescing par groupKey + fenetre temps)
 *  - undo / redo : reversibilite + bornes (no-op si vide)
 *  - cycle complet commit -> undo -> redo -> verifier present
 *  - HISTORY_LIMIT : fenetre glissante
 *  - reset : purge history
 *  - une action apres un undo invalide le future (canRedo = false)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  createHistoryStore,
  getHistoryDepth,
  getPresent,
  redo,
  reset,
  undo,
} from '../../src/lib/layoutHistoryStore.js';

// Layouts fictifs (objets distincts par reference -> simulent les
// nouveaux layouts produits par cvLayoutModelV3.js).
const L0 = { id: 0 };
const L1 = { id: 1 };
const L2 = { id: 2 };
const L3 = { id: 3 };

// ---------------------------------------------------------------------------
// createHistoryStore / inspecteurs
// ---------------------------------------------------------------------------

test('createHistoryStore : forme initiale', () => {
  const s = createHistoryStore(L0);
  assert.equal(getPresent(s), L0);
  assert.equal(canUndo(s), false);
  assert.equal(canRedo(s), false);
  assert.deepEqual(getHistoryDepth(s), { past: 0, future: 0 });
});

test('getPresent / canUndo / canRedo : tolerent null', () => {
  assert.equal(getPresent(null), undefined);
  assert.equal(canUndo(null), false);
  assert.equal(canRedo(null), false);
  assert.deepEqual(getHistoryDepth(null), { past: 0, future: 0 });
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

test('commit : dur, pousse present dans past', () => {
  const s0 = createHistoryStore(L0);
  const s1 = commit(s0, L1, { now: 1000 });
  assert.equal(getPresent(s1), L1);
  assert.deepEqual(s1.past, [L0]);
  assert.equal(canUndo(s1), true);
  assert.equal(canRedo(s1), false);
});

test('commit : no-op si meme reference que present', () => {
  const s0 = createHistoryStore(L0);
  const s1 = commit(s0, L0);
  assert.equal(s1, s0);
});

test('commit : chaine de commits empile correctement', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = commit(s, L3, { now: 3000 });
  assert.equal(getPresent(s), L3);
  assert.deepEqual(s.past, [L0, L1, L2]);
});

test('commit : null store -> cree un store autour de newLayout', () => {
  const s = commit(null, L0);
  assert.equal(getPresent(s), L0);
  assert.equal(canUndo(s), false);
});

// ---------------------------------------------------------------------------
// coalescing
// ---------------------------------------------------------------------------

test('coalesce : meme groupKey + dans la fenetre -> ne pousse pas dans past', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000, groupKey: 'drag:b1' });
  s = commit(s, L2, { now: 1100, groupKey: 'drag:b1' });
  s = commit(s, L3, { now: 1200, groupKey: 'drag:b1' });
  assert.equal(getPresent(s), L3);
  // Seul L0 est dans past (1er commit "dur"), les suivants coalesce
  assert.deepEqual(s.past, [L0]);
});

test('coalesce : groupKey different -> commit dur', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000, groupKey: 'drag:b1' });
  s = commit(s, L2, { now: 1100, groupKey: 'drag:b2' }); // autre bloc
  assert.deepEqual(s.past, [L0, L1]);
});

test('coalesce : groupKey identique MAIS hors fenetre -> commit dur', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000, groupKey: 'drag:b1' });
  s = commit(s, L2, { now: 1000 + COALESCE_WINDOW_MS + 1, groupKey: 'drag:b1' });
  assert.deepEqual(s.past, [L0, L1]);
});

test('coalesce : sans groupKey -> jamais coalesce', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 1010 });
  s = commit(s, L3, { now: 1020 });
  assert.deepEqual(s.past, [L0, L1, L2]);
});

test('coalesce : fenetre custom via coalesceWindowMs', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000, groupKey: 'g', coalesceWindowMs: 50 });
  s = commit(s, L2, { now: 1040, groupKey: 'g', coalesceWindowMs: 50 });
  assert.deepEqual(s.past, [L0]); // coalesce
  s = commit(s, L3, { now: 1200, groupKey: 'g', coalesceWindowMs: 50 });
  assert.deepEqual(s.past, [L0, L2]); // hors fenetre custom
});

test('coalesce : le 1er commit n est JAMAIS coalesce, meme avec groupKey', () => {
  // Sinon on perd la possibilite d undo apres la 1ere action de drag.
  const s0 = createHistoryStore(L0);
  const s1 = commit(s0, L1, { now: 1000, groupKey: 'g' });
  assert.deepEqual(s1.past, [L0]);
});

// ---------------------------------------------------------------------------
// undo / redo
// ---------------------------------------------------------------------------

test('undo : no-op si past vide', () => {
  const s0 = createHistoryStore(L0);
  const s1 = undo(s0);
  assert.equal(s1, s0);
});

test('undo : reculer d un cran', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  const u = undo(s);
  assert.equal(getPresent(u), L1);
  assert.deepEqual(u.past, [L0]);
  assert.deepEqual(u.future, [L2]);
  assert.equal(canRedo(u), true);
});

test('redo : no-op si future vide', () => {
  const s0 = createHistoryStore(L0);
  const s1 = redo(s0);
  assert.equal(s1, s0);
});

test('redo : refait un undo', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = undo(s);
  s = redo(s);
  assert.equal(getPresent(s), L2);
  assert.deepEqual(s.past, [L0, L1]);
  assert.equal(canRedo(s), false);
});

test('undo puis nouvelle action : invalide future (canRedo = false)', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = undo(s);
  assert.equal(canRedo(s), true);
  s = commit(s, L3, { now: 3000 });
  assert.equal(canRedo(s), false);
  assert.deepEqual(s.future, []);
});

test('cycle complet : commit x3 -> undo x2 -> redo x1 -> commit -> present', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = commit(s, L3, { now: 3000 });
  s = undo(s);
  s = undo(s);
  assert.equal(getPresent(s), L1);
  s = redo(s);
  assert.equal(getPresent(s), L2);
});

// ---------------------------------------------------------------------------
// HISTORY_LIMIT : fenetre glissante
// ---------------------------------------------------------------------------

test('HISTORY_LIMIT : drop les plus anciens past (fenetre glissante)', () => {
  // Init present = -1. On commit 60 fois { id: 0..59 } sans groupKey
  // (donc 60 commits "durs"). Chaque commit pousse l ancien present
  // dans past, soit au final 60 items poussables : -1, 0, ..., 58.
  // HISTORY_LIMIT = 50 -> on garde les 50 derniers : 9, ..., 58.
  const ITERS = HISTORY_LIMIT + 10;
  let s = createHistoryStore({ id: -1 });
  for (let i = 0; i < ITERS; i++) {
    s = commit(s, { id: i }, { now: 1000 + i });
  }
  assert.equal(s.past.length, HISTORY_LIMIT);
  assert.equal(s.past[0].id, ITERS - 1 - HISTORY_LIMIT);          // 9
  assert.equal(s.past[s.past.length - 1].id, ITERS - 2);          // 58
  assert.equal(s.present.id, ITERS - 1);                          // 59
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

test('reset : purge history et installe le nouveau layout', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = undo(s);
  assert.equal(canRedo(s), true);
  const fresh = reset(L3);
  assert.equal(getPresent(fresh), L3);
  assert.equal(canUndo(fresh), false);
  assert.equal(canRedo(fresh), false);
});

// ---------------------------------------------------------------------------
// getHistoryDepth
// ---------------------------------------------------------------------------

test('getHistoryDepth : reporte past et future', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  s = commit(s, L2, { now: 2000 });
  s = undo(s);
  assert.deepEqual(getHistoryDepth(s), { past: 1, future: 1 });
});

// ---------------------------------------------------------------------------
// commit { replace: true } : maj du present SANS entree d historique
// ---------------------------------------------------------------------------

test('commit replace : met a jour le present sans pousser dans past', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 }); // past=[L0], present=L1
  assert.deepEqual(getHistoryDepth(s), { past: 1, future: 0 });
  s = commit(s, L2, { replace: true }); // present=L2, past inchange
  assert.equal(getPresent(s), L2);
  assert.deepEqual(getHistoryDepth(s), { past: 1, future: 0 });
  // un undo doit revenir a L0 (l etat replace L2 n est pas une entree)
  s = undo(s);
  assert.equal(getPresent(s), L0);
});

test('commit replace : no-op si meme reference que present', () => {
  let s = createHistoryStore(L0);
  s = commit(s, L1, { now: 1000 });
  const before = s;
  s = commit(s, L1, { replace: true });
  assert.equal(s, before);
});
