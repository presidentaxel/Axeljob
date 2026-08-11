/**
 * Tests unitaires de `lib/betaEditorFullscreen.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BETA_EDITOR_FULLSCREEN_BODY_CLASS,
  purgeLegacyBetaFullscreenBodyClass,
} from '../../src/lib/betaEditorFullscreen.js';

function makeMockBody() {
  const classes = new Set([BETA_EDITOR_FULLSCREEN_BODY_CLASS]);
  return {
    classList: {
      add: (c) => { classes.add(c); },
      remove: (c) => { classes.delete(c); },
      contains: (c) => classes.has(c),
    },
    _classes: classes,
  };
}

function makeMockDocument() {
  const body = makeMockBody();
  return { body };
}

test('BETA_EDITOR_FULLSCREEN_BODY_CLASS est stable (legacy)', () => {
  assert.equal(BETA_EDITOR_FULLSCREEN_BODY_CLASS, 'cv-editor-beta-fullscreen');
});

test('purgeLegacyBetaFullscreenBodyClass retire la classe legacy du body', () => {
  const doc = makeMockDocument();
  assert.ok(doc.body.classList.contains(BETA_EDITOR_FULLSCREEN_BODY_CLASS));
  purgeLegacyBetaFullscreenBodyClass(doc);
  assert.equal(doc.body.classList.contains(BETA_EDITOR_FULLSCREEN_BODY_CLASS), false);
});

test('purgeLegacyBetaFullscreenBodyClass ne crashe pas sans document', () => {
  assert.doesNotThrow(() => purgeLegacyBetaFullscreenBodyClass(null));
});
