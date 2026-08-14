/**
 * Tests unitaires composer En-tête (AXE-334 P0).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlankLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  HEADER_COMPOSER_VARIANTS,
  applyHeaderComposerToLayout,
  buildHeaderComposerBlocks,
  collectHeaderBlockIds,
  defaultHeaderComposerState,
  mergeHeaderComposerCv,
  resolveHeaderComposerVariant,
  selectedContactBinds,
  selectedIdentityBinds,
} from '../../src/lib/headerComposerPresets.js';

test('exposes at least 2 design variants', () => {
  assert.ok(HEADER_COMPOSER_VARIANTS.length >= 2);
  assert.equal(resolveHeaderComposerVariant('inline_title').id, 'inline_title');
  assert.equal(
    resolveHeaderComposerVariant('unknown').id,
    HEADER_COMPOSER_VARIANTS[0].id,
  );
});

test('prefills from cv and checks contact only when present', () => {
  const { values, fields } = defaultHeaderComposerState({
    prenom: 'Ada',
    nom: 'Lovelace',
    email: 'ada@example.com',
  });
  assert.equal(values.prenom, 'Ada');
  assert.equal(fields.prenom, true);
  assert.equal(fields.email, true);
  assert.equal(fields.telephone, false);
});

test('builds identity (+ contact) with variant styles and filtered binds', () => {
  const fields = {
    prenom: true,
    nom: true,
    titre_professionnel: false,
    email: true,
    telephone: false,
    linkedin: false,
  };
  const blocks = buildHeaderComposerBlocks({ variantId: 'header_bar', fields });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'identity');
  assert.deepEqual(blocks[0].bind, ['prenom', 'nom']);
  assert.equal(blocks[0].style.identity_divider, true);
  assert.equal(blocks[1].type, 'contact');
  assert.deepEqual(blocks[1].bind, ['email']);
  assert.equal(blocks[1].style.contact_layout, 'header-bar');
  assert.deepEqual(selectedIdentityBinds(fields), ['prenom', 'nom']);
  assert.deepEqual(selectedContactBinds(fields), ['email']);
});

test('merges checked fields into cv with dual-key sync (does not clear unchecked)', () => {
  const next = mergeHeaderComposerCv(
    { prenom: 'Old', email: 'keep@example.com', telephone: '010203' },
    { prenom: 'New', nom: 'Name', email: 'x@y.z', telephone: '999' },
    {
      prenom: true,
      nom: true,
      titre_professionnel: false,
      email: false,
      telephone: false,
      linkedin: false,
    },
  );
  assert.equal(next.prenom, 'New');
  assert.equal(next.first_name, 'New');
  assert.equal(next.nom, 'Name');
  assert.equal(next.last_name, 'Name');
  assert.equal(next.email, 'keep@example.com');
  assert.equal(next.telephone, '010203');
});

test('clearing FR name also clears EN dual-key (no resurrection)', () => {
  const next = mergeHeaderComposerCv(
    { prenom: 'Ada', first_name: 'Ada', nom: 'Lovelace', last_name: 'Lovelace' },
    { prenom: '', nom: 'Lovelace' },
    {
      prenom: true,
      nom: true,
      titre_professionnel: false,
      email: false,
      telephone: false,
      linkedin: false,
    },
  );
  assert.equal(next.prenom, '');
  assert.equal(next.first_name, '');
  assert.equal(next.nom, 'Lovelace');
  assert.equal(next.last_name, 'Lovelace');
});

test('replaces existing identity/contact (one instance) when applying', () => {
  const layout = createBlankLayoutV3();
  const first = applyHeaderComposerToLayout(layout, 0, {
    variantId: 'stacked',
    fields: {
      prenom: true,
      nom: true,
      titre_professionnel: true,
      email: true,
      telephone: false,
      linkedin: false,
    },
  });
  assert.equal(collectHeaderBlockIds(first.layout).length, 2);
  assert.equal(first.placedIds.length, 2);

  const second = applyHeaderComposerToLayout(first.layout, 0, {
    variantId: 'inline_title',
    fields: {
      prenom: true,
      nom: false,
      titre_professionnel: true,
      email: false,
      telephone: false,
      linkedin: false,
    },
  });
  assert.equal(collectHeaderBlockIds(second.layout).length, 1);
  const identity = second.layout.pages[0].blocks.find((b) => b.type === 'identity');
  assert.deepEqual(identity.bind, ['prenom', 'titre_professionnel']);
  assert.equal(identity.style.header_layout, 'inline-title');
});
