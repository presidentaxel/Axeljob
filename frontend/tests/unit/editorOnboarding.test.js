/**
 * Tests unitaires onboarding éditeur Beta (AXE-32).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITOR_ONBOARDING_DISMISSED_KEY,
  EDITOR_ONBOARDING_STEPS,
  dismissEditorOnboarding,
  isEditorOnboardingDismissed,
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

test('dismissEditorOnboarding : storage absent -> false', () => {
  assert.equal(dismissEditorOnboarding(null), false);
});
