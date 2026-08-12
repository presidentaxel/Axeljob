/**
 * Tests unitaires des presets Sections CV (AXE-31).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSemanticBlockType, sanitizeBlock } from '../../src/lib/cvLayoutModelV3.js';
import {
  CV_SECTION_ITEMS,
  createCvSectionBlockPreset,
} from '../../src/lib/canvasCvSectionPresets.js';

test('CV_SECTION_ITEMS couvre les types sémantiques utiles', () => {
  assert.ok(CV_SECTION_ITEMS.length >= 8);
  const types = new Set(CV_SECTION_ITEMS.map((i) => i.type));
  for (const required of ['identity', 'experiences', 'formations', 'skills', 'contact']) {
    assert.ok(types.has(required), `manque ${required}`);
  }
});

test('createCvSectionBlockPreset : expériences liées au CV', () => {
  const preset = createCvSectionBlockPreset('experiences');
  assert.equal(preset.type, 'experiences');
  assert.equal(preset.bind, 'experiences');
  assert.ok(preset.w > 0 && preset.h > 0);
  assert.ok(isSemanticBlockType(preset.type));
  const block = sanitizeBlock({ ...preset, x: 10, y: 10 });
  assert.equal(block.type, 'experiences');
  assert.equal(block.bind, 'experiences');
});

test('createCvSectionBlockPreset : identité avec bind tableau', () => {
  const preset = createCvSectionBlockPreset('identity');
  assert.ok(Array.isArray(preset.bind));
  assert.ok(preset.bind.includes('prenom'));
  const copy = createCvSectionBlockPreset('identity');
  copy.bind.push('x');
  assert.notEqual(preset.bind.length, copy.bind.length);
});

test('createCvSectionBlockPreset : type inconnu -> null', () => {
  assert.equal(createCvSectionBlockPreset('inconnu'), null);
  assert.equal(createCvSectionBlockPreset('text'), null);
});

test('tous les items produisent un bloc sanitisable', () => {
  for (const item of CV_SECTION_ITEMS) {
    const preset = createCvSectionBlockPreset(item.type);
    assert.ok(preset, item.type);
    const block = sanitizeBlock({ ...preset, x: 10, y: 20 });
    assert.equal(block.type, item.type);
    assert.ok(isSemanticBlockType(block.type));
  }
});
