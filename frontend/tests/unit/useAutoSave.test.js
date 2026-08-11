/**
 * Tests AXE-29 : cycle de vie autosave (flush unmount / inactive / pagehide).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAutoSaveScheduler } from '../../src/lib/autoSaveScheduler.js';
import { createAutoSaveLifecycleHandlers } from '../../src/lib/useAutoSave.js';
import { formatPdfExportError } from '../../src/lib/canvasEditorUtils.js';

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
      safety -= 1;
    }
  }

  return { setTimeoutFn, clearTimeoutFn, now, advance, runDue, runAll, tasks };
}

test('onUnmount flush puis dispose quand des changements sont pending', async () => {
  const clock = createFakeClock();
  const calls = [];
  const scheduler = createAutoSaveScheduler({
    saveFn: async (payload) => {
      calls.push(payload);
    },
    delayMs: 1500,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
  });
  const life = createAutoSaveLifecycleHandlers(() => scheduler);
  scheduler.schedule({ prenom: 'Ada', layout: { version: 3, pages: [{ blocks: [] }] } });
  assert.equal(scheduler.hasPendingChanges(), true);

  await life.onUnmount(scheduler);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prenom, 'Ada');
  assert.equal(scheduler.hasPendingChanges(), false);
});

test('onInactive flush avant changement de vue (isActive false)', async () => {
  const clock = createFakeClock();
  const calls = [];
  const scheduler = createAutoSaveScheduler({
    saveFn: async (payload) => {
      calls.push(payload);
    },
    delayMs: 5000,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
  });
  const life = createAutoSaveLifecycleHandlers(() => scheduler);
  scheduler.schedule({ nom: 'Lovelace' });
  await life.onInactive();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].nom, 'Lovelace');
});

test('onPageHide flush les changements pending', async () => {
  const clock = createFakeClock();
  const calls = [];
  const scheduler = createAutoSaveScheduler({
    saveFn: async (payload) => {
      calls.push(payload);
    },
    delayMs: 5000,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
  });
  const life = createAutoSaveLifecycleHandlers(() => scheduler);
  scheduler.schedule({ titre: 'Engineer' });
  await life.onPageHide();
  assert.equal(calls.length, 1);
});

test('formatPdfExportError produit un message visible', () => {
  assert.equal(
    formatPdfExportError(new Error('Quota dépassé'), ' — autorisez les téléchargements'),
    'Quota dépassé — autorisez les téléchargements',
  );
  assert.equal(formatPdfExportError(null), 'Impossible de telecharger le PDF.');
});

test('schedule après undo conserve le layout fourni au flush', async () => {
  const clock = createFakeClock();
  const calls = [];
  const scheduler = createAutoSaveScheduler({
    saveFn: async (payload) => {
      calls.push(payload);
    },
    delayMs: 100,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
  });
  const layoutAfterUndo = {
    version: 3,
    pages: [{ id: 'p1', blocks: [{ id: 't1', type: 'text', content: 'après undo', x: 0, y: 0, w: 10, h: 10, z: 1 }] }],
  };
  scheduler.schedule({ prenom: 'Ada', layout: layoutAfterUndo });
  await scheduler.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].layout.pages[0].blocks[0].content, 'après undo');
});
