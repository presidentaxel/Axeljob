/**
 * Tests unitaires des helpers de `lib/templateOptionsSchema.js`.
 *
 * Couvre l extraction defensive du schema, la sanitisation des valeurs
 * (color/select/boolean) et le regroupement pour l affichage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTemplateOptionsDefaults,
  getTemplateOptionsSchema,
  groupTemplateOptions,
  resetTemplateOptionsToDefaults,
  sanitizeTemplateOptionValue,
} from '../../src/lib/templateOptionsSchema.js';

const SAMPLE_TEMPLATE = {
  id: 'classic',
  name: 'Classique',
  options: [
    { key: 'header_color', type: 'color', default: '#1e2a3a', label: 'Couleur en-tete' },
    { key: 'sidebar_color', type: 'color', default: '#f4f4f2', label: 'Couleur sidebar' },
    { key: 'font', type: 'select', choices: ['Inter', 'Georgia'], default: 'Inter', label: 'Police' },
    { key: 'show_photo', type: 'boolean', default: true, label: 'Afficher la photo' },
    { key: 'malformed_field', type: 'unknown', default: 'x' },
    null,
    { key: '', type: 'color', default: '#fff' },
  ],
};

test('getTemplateOptionsSchema filtre les entrees mal formees', () => {
  const schema = getTemplateOptionsSchema(SAMPLE_TEMPLATE);
  assert.equal(schema.length, 4);
  assert.deepEqual(schema.map((f) => f.key), ['header_color', 'sidebar_color', 'font', 'show_photo']);
});

test('getTemplateOptionsSchema retourne [] pour input invalide', () => {
  assert.deepEqual(getTemplateOptionsSchema(null), []);
  assert.deepEqual(getTemplateOptionsSchema({}), []);
  assert.deepEqual(getTemplateOptionsSchema({ options: 'not-an-array' }), []);
});

test('applyTemplateOptionsDefaults complete les champs manquants', () => {
  const result = applyTemplateOptionsDefaults(SAMPLE_TEMPLATE, { header_color: '#ff0000' });
  assert.equal(result.header_color, '#ff0000', 'la valeur existante est preservee');
  assert.equal(result.sidebar_color, '#f4f4f2', 'le defaut est applique pour le champ manquant');
  assert.equal(result.font, 'Inter');
  assert.equal(result.show_photo, true);
});

test('applyTemplateOptionsDefaults preserve les cles inconnues', () => {
  // Regression : quand un user change de template, on garde ses anciennes
  // options meme si le nouveau template ne les declare pas. L API backend
  // les ignore mais le user retrouve ses choix s il revient sur l ancien.
  const result = applyTemplateOptionsDefaults(SAMPLE_TEMPLATE, { custom_unknown_field: 'hello' });
  assert.equal(result.custom_unknown_field, 'hello');
});

test('applyTemplateOptionsDefaults gere null/undefined sur currentOptions', () => {
  const result = applyTemplateOptionsDefaults(SAMPLE_TEMPLATE, null);
  assert.equal(result.header_color, '#1e2a3a');
  assert.equal(result.show_photo, true);
});

test('sanitizeTemplateOptionValue color : accepte hex valides', () => {
  const field = { type: 'color' };
  assert.equal(sanitizeTemplateOptionValue(field, '#ffffff'), '#ffffff');
  assert.equal(sanitizeTemplateOptionValue(field, '#abc'), '#abc');
  assert.equal(sanitizeTemplateOptionValue(field, '  #112233  '), '#112233');
});

test('sanitizeTemplateOptionValue color : refuse les valeurs non-hex', () => {
  const field = { type: 'color' };
  assert.equal(sanitizeTemplateOptionValue(field, 'red'), undefined);
  assert.equal(sanitizeTemplateOptionValue(field, '#zzz'), undefined);
  assert.equal(sanitizeTemplateOptionValue(field, 42), undefined);
  assert.equal(sanitizeTemplateOptionValue(field, null), undefined);
});

test('sanitizeTemplateOptionValue select : accepte uniquement les choices', () => {
  const field = { type: 'select', choices: ['A', 'B', 'C'] };
  assert.equal(sanitizeTemplateOptionValue(field, 'A'), 'A');
  assert.equal(sanitizeTemplateOptionValue(field, 'C'), 'C');
  assert.equal(sanitizeTemplateOptionValue(field, 'D'), undefined);
  assert.equal(sanitizeTemplateOptionValue(field, 1), undefined);
});

test('sanitizeTemplateOptionValue select : refuse si choices absent', () => {
  const field = { type: 'select' };
  assert.equal(sanitizeTemplateOptionValue(field, 'whatever'), undefined);
});

test('sanitizeTemplateOptionValue boolean : coerce les valeurs equivalentes', () => {
  const field = { type: 'boolean' };
  assert.equal(sanitizeTemplateOptionValue(field, true), true);
  assert.equal(sanitizeTemplateOptionValue(field, false), false);
  assert.equal(sanitizeTemplateOptionValue(field, 'true'), true);
  assert.equal(sanitizeTemplateOptionValue(field, 'false'), false);
  assert.equal(sanitizeTemplateOptionValue(field, 1), true);
  assert.equal(sanitizeTemplateOptionValue(field, 0), false);
  // input ambigu : refuse pour ne pas confondre.
  assert.equal(sanitizeTemplateOptionValue(field, 'yes'), undefined);
  assert.equal(sanitizeTemplateOptionValue(field, null), undefined);
});

test('sanitizeTemplateOptionValue : type inconnu -> undefined', () => {
  assert.equal(sanitizeTemplateOptionValue({ type: 'magic' }, 'whatever'), undefined);
  assert.equal(sanitizeTemplateOptionValue(null, 'x'), undefined);
});

test('groupTemplateOptions regroupe par type (couleurs, typo, affichage)', () => {
  const groups = groupTemplateOptions(SAMPLE_TEMPLATE);
  assert.deepEqual(groups.map((g) => g.id), ['color', 'typo', 'display']);
  assert.equal(groups[0].fields.length, 2, '2 couleurs');
  assert.equal(groups[1].fields.length, 1, '1 select');
  assert.equal(groups[2].fields.length, 1, '1 boolean');
});

test('groupTemplateOptions omet les groupes vides', () => {
  const template = { options: [{ key: 'k', type: 'color', default: '#000' }] };
  const groups = groupTemplateOptions(template);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'color');
});

test('resetTemplateOptionsToDefaults retourne les defauts uniquement', () => {
  const result = resetTemplateOptionsToDefaults(SAMPLE_TEMPLATE);
  assert.deepEqual(result, {
    header_color: '#1e2a3a',
    sidebar_color: '#f4f4f2',
    font: 'Inter',
    show_photo: true,
  });
});

test('resetTemplateOptionsToDefaults sur template vide -> {}', () => {
  assert.deepEqual(resetTemplateOptionsToDefaults({ options: [] }), {});
  assert.deepEqual(resetTemplateOptionsToDefaults(null), {});
});
