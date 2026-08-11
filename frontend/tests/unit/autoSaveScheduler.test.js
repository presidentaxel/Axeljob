/**
 * Tests unitaires du planificateur d auto-save (lib/autoSaveScheduler.js).
 *
 * Utilise un faux horloger + un faux setTimeout pour rendre l ordonnancement
 * deterministe et instantane (pas de delais reels dans les tests).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_SAVE_DEFAULTS,
  createAutoSaveScheduler,
} from '../../src/lib/autoSaveScheduler.js';

/**
 * Construit un faux ordonnanceur de timers. Tous les setTimeout sont
 * stockes ; `runAll()` les execute dans l ordre d insertion en respectant
 * leur delay (le plus court en premier). `now()` simule une horloge.
 */
function createFakeClock() {
  let currentTime = 1_000_000;
  const tasks = [];
  let nextId = 1;

  function setTimeoutFn(cb, ms) {
    const id = nextId++;
    tasks.push({ id, cb, runAt: currentTime + ms });
    return id;
  }

  function clearTimeoutFn(id) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) tasks.splice(idx, 1);
  }

  function now() {
    return currentTime;
  }

  function advance(ms) {
    currentTime += ms;
  }

  async function runDue() {
    // Execute toutes les taches dont runAt <= currentTime, par ordre runAt.
    while (true) {
      const due = tasks
        .filter((t) => t.runAt <= currentTime)
        .sort((a, b) => a.runAt - b.runAt);
      if (due.length === 0) break;
      const next = due[0];
      const idx = tasks.indexOf(next);
      tasks.splice(idx, 1);
      await next.cb();
      await new Promise((r) => queueMicrotask(r));
    }
  }

  async function runAll(maxAdvanceMs = 60_000) {
    let safety = 100;
    while (tasks.length > 0 && safety > 0) {
      const minTime = Math.min(...tasks.map((t) => t.runAt));
      const delta = Math.max(0, minTime - currentTime);
      if (delta > maxAdvanceMs) break;
      advance(delta);
      await runDue();
      safety--;
    }
  }

  return { setTimeoutFn, clearTimeoutFn, now, advance, runDue, runAll, tasks };
}

function makeStateRecorder() {
  const states = [];
  return {
    states,
    onStateChange: (s) => states.push(s),
  };
}

test('etat initial = idle, hasPending=false', () => {
  const rec = makeStateRecorder();
  createAutoSaveScheduler({
    saveFn: async () => {},
    onStateChange: rec.onStateChange,
  });
  assert.equal(rec.states[0].kind, 'idle');
  assert.equal(rec.states[0].hasPending, false);
});

test('schedule passe en pending puis sauve apres delay', async () => {
  const clock = createFakeClock();
  const rec = makeStateRecorder();
  let saveCalls = 0;
  const sch = createAutoSaveScheduler({
    saveFn: async (payload) => {
      saveCalls++;
      assert.deepEqual(payload, { v: 1 });
    },
    delayMs: 100,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onStateChange: rec.onStateChange,
  });

  sch.schedule({ v: 1 });
  assert.equal(sch.getState().kind, 'pending');
  await clock.runAll();
  assert.equal(saveCalls, 1);
  assert.equal(sch.getState().kind, 'saved');
});

test('debounce : seul le dernier payload est sauvegarde', async () => {
  const clock = createFakeClock();
  const captured = [];
  const sch = createAutoSaveScheduler({
    saveFn: async (payload) => { captured.push(payload); },
    delayMs: 100,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  sch.schedule({ v: 1 });
  clock.advance(50);
  sch.schedule({ v: 2 });
  clock.advance(50);
  sch.schedule({ v: 3 });
  await clock.runAll();
  assert.deepEqual(captured, [{ v: 3 }]);
});

test('flush immediat bypass le delay', async () => {
  const clock = createFakeClock();
  let saveCalls = 0;
  const sch = createAutoSaveScheduler({
    saveFn: async () => { saveCalls++; },
    delayMs: 100_000,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  sch.schedule({ v: 1 });
  assert.equal(saveCalls, 0);
  await sch.flush();
  assert.equal(saveCalls, 1);
  assert.equal(sch.getState().kind, 'saved');
});

test('hasPendingChanges true entre schedule et save', async () => {
  const clock = createFakeClock();
  const sch = createAutoSaveScheduler({
    saveFn: async () => {},
    delayMs: 100,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  assert.equal(sch.hasPendingChanges(), false);
  sch.schedule({ v: 1 });
  assert.equal(sch.hasPendingChanges(), true);
  await clock.runAll();
  assert.equal(sch.hasPendingChanges(), false);
});

test('retry exponentiel sur erreur (jusqu a maxRetries)', async () => {
  const clock = createFakeClock();
  let attempts = 0;
  const failingSave = async () => {
    attempts++;
    throw new Error('500 server error');
  };
  const sch = createAutoSaveScheduler({
    saveFn: failingSave,
    delayMs: 10,
    maxRetries: 3,
    baseRetryDelayMs: 50,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  sch.schedule({ v: 1 });
  await clock.runAll();
  assert.equal(attempts, 3, '3 tentatives au total avant abandon');
  assert.equal(sch.getState().kind, 'error');
});

test('retry passe en kind=retrying entre les tentatives', async () => {
  const clock = createFakeClock();
  const recorded = [];
  let attempts = 0;
  const flakySave = async () => {
    attempts++;
    if (attempts < 2) throw new Error('transient');
  };
  const sch = createAutoSaveScheduler({
    saveFn: flakySave,
    delayMs: 10,
    maxRetries: 5,
    baseRetryDelayMs: 50,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onStateChange: (s) => recorded.push(s.kind),
  });
  sch.schedule({ v: 1 });
  await clock.runAll();
  assert.equal(sch.getState().kind, 'saved');
  // Doit avoir traverse retrying au moins une fois.
  assert.ok(recorded.includes('retrying'), `retrying absent de la sequence: ${recorded.join(',')}`);
});

test('schedule pendant saving garde le payload pour replay', async () => {
  const clock = createFakeClock();
  const captured = [];
  let savePromiseResolve = null;
  const saveFn = (payload) => new Promise((resolve) => {
    captured.push(payload);
    savePromiseResolve = resolve;
  });
  const sch = createAutoSaveScheduler({
    saveFn,
    delayMs: 10,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  sch.schedule({ v: 1 });
  clock.advance(20);
  await clock.runDue();
  // saveFn est en cours, en attente de resolve
  assert.equal(sch.getState().kind, 'saving');

  // L utilisateur modifie a nouveau pendant la sauvegarde
  sch.schedule({ v: 2 });
  assert.equal(sch.getState().kind, 'saving');

  // On termine la save en cours
  savePromiseResolve();
  await new Promise((r) => queueMicrotask(r));

  // Apres la fin de la 1ere save, un nouveau cycle pending -> saving doit demarrer
  assert.equal(sch.getState().hasPending, true);
  // On declenche le timer
  await clock.runAll();
  assert.deepEqual(captured, [{ v: 1 }, { v: 2 }]);
});

test('dispose stoppe les timers en cours', () => {
  const clock = createFakeClock();
  let saveCalls = 0;
  const sch = createAutoSaveScheduler({
    saveFn: async () => { saveCalls++; },
    delayMs: 100,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  sch.schedule({ v: 1 });
  assert.equal(clock.tasks.length, 1);
  sch.dispose();
  assert.equal(clock.tasks.length, 0, 'le timer en cours est annule');
  assert.equal(saveCalls, 0);
});

test('createAutoSaveScheduler exige un saveFn function', () => {
  assert.throws(() => createAutoSaveScheduler({}), /saveFn/);
  assert.throws(() => createAutoSaveScheduler({ saveFn: null }), /saveFn/);
});

test('AUTO_SAVE_DEFAULTS expose les constantes (contrat public)', () => {
  // Regression : si on change ces defauts, c est une decision produit
  // qui doit etre explicite.
  assert.equal(AUTO_SAVE_DEFAULTS.delayMs, 1500);
  assert.equal(AUTO_SAVE_DEFAULTS.maxRetries, 3);
  assert.equal(AUTO_SAVE_DEFAULTS.baseRetryDelayMs, 1000);
});

test('un onStateChange qui throw ne casse pas le scheduler', async () => {
  const clock = createFakeClock();
  let saveCalls = 0;
  const sch = createAutoSaveScheduler({
    saveFn: async () => { saveCalls++; },
    delayMs: 50,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onStateChange: () => { throw new Error('listener exploded'); },
  });
  sch.schedule({ v: 1 });
  await clock.runAll();
  assert.equal(saveCalls, 1);
  assert.equal(sch.getState().kind, 'saved');
});
