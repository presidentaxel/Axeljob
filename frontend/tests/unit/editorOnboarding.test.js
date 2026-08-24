/**
 * Tests unitaires onboarding éditeur Beta (AXE-32).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITOR_FIRST_RUN_SURFACES,
  EDITOR_ONBOARDING_DISMISSED_KEY,
  EDITOR_ONBOARDING_STEPS,
  dismissEditorOnboarding,
  isEditorOnboardingDismissed,
  resolveEditorFirstRunSurface,
  shouldLockCanvasScrollForFirstRun,
  shouldShowEditorOnboarding,
} from '../../src/lib/editorOnboarding.js';

function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    _raw: store,
  };
}

test('EDITOR_ONBOARDING_STEPS : exactement 3 étapes ordonnées', () => {
  assert.equal(EDITOR_ONBOARDING_STEPS.length, 3);
  assert.equal(EDITOR_ONBOARDING_STEPS[0].id, 'sections');
  assert.equal(EDITOR_ONBOARDING_STEPS[1].id, 'design');
  assert.equal(EDITOR_ONBOARDING_STEPS[2].id, 'place');
});

test('isEditorOnboardingDismissed : false par défaut', () => {
  assert.equal(isEditorOnboardingDismissed(makeFakeStorage()), false);
});

test('dismissEditorOnboarding : persiste et ne réaffiche plus', () => {
  const storage = makeFakeStorage();
  assert.equal(dismissEditorOnboarding(storage), true);
  assert.equal(storage.getItem(EDITOR_ONBOARDING_DISMISSED_KEY), '1');
  assert.equal(isEditorOnboardingDismissed(storage), true);
  assert.equal(
    shouldShowEditorOnboarding({ dismissed: true, loading: false, startupPromptOpen: false }),
    false,
  );
});

test('shouldShowEditorOnboarding : masqué pendant loading ou startup AXE-28', () => {
  assert.equal(shouldShowEditorOnboarding({ dismissed: false, loading: true }), false);
  assert.equal(
    shouldShowEditorOnboarding({ dismissed: false, loading: false, startupPromptOpen: true }),
    false,
  );
  assert.equal(
    shouldShowEditorOnboarding({ dismissed: false, loading: false, startupPromptOpen: false }),
    true,
  );
});

test('AXE-345 : une seule surface first-run à la fois', () => {
  assert.equal(
    resolveEditorFirstRunSurface({
      loading: false,
      startupPromptOpen: true,
      importOpen: false,
      designBridgeOpen: true,
      canvasEmpty: true,
    }),
    EDITOR_FIRST_RUN_SURFACES.STARTUP,
  );
  assert.equal(
    resolveEditorFirstRunSurface({
      loading: false,
      startupPromptOpen: true,
      importOpen: true,
      designBridgeOpen: false,
      canvasEmpty: true,
    }),
    EDITOR_FIRST_RUN_SURFACES.IMPORT,
  );
  assert.equal(
    resolveEditorFirstRunSurface({
      loading: false,
      startupPromptOpen: false,
      importOpen: false,
      designBridgeOpen: true,
      dismissed: false,
      canvasEmpty: true,
    }),
    EDITOR_FIRST_RUN_SURFACES.DESIGN_BRIDGE,
  );
  assert.equal(
    resolveEditorFirstRunSurface({
      loading: false,
      startupPromptOpen: false,
      importOpen: false,
      designBridgeOpen: false,
      dismissed: false,
      canvasEmpty: true,
    }),
    EDITOR_FIRST_RUN_SURFACES.NONE,
  );
  assert.equal(
    resolveEditorFirstRunSurface({
      loading: false,
      startupPromptOpen: false,
      importOpen: false,
      designBridgeOpen: false,
      dismissed: false,
      canvasEmpty: false,
    }),
    EDITOR_FIRST_RUN_SURFACES.ONBOARDING,
  );
});

test('AXE-345 : lock scroll canvas pour overlays internes seulement', () => {
  assert.equal(shouldLockCanvasScrollForFirstRun(EDITOR_FIRST_RUN_SURFACES.STARTUP), true);
  assert.equal(shouldLockCanvasScrollForFirstRun(EDITOR_FIRST_RUN_SURFACES.ONBOARDING), true);
  assert.equal(shouldLockCanvasScrollForFirstRun(EDITOR_FIRST_RUN_SURFACES.DESIGN_BRIDGE), true);
  assert.equal(shouldLockCanvasScrollForFirstRun(EDITOR_FIRST_RUN_SURFACES.IMPORT), false);
  assert.equal(shouldLockCanvasScrollForFirstRun(EDITOR_FIRST_RUN_SURFACES.NONE), false);
});

test('dismissEditorOnboarding : storage absent -> false', () => {
  assert.equal(dismissEditorOnboarding(null), false);
});
