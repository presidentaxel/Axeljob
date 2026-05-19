/**
 * Tests unitaires du client front du scoring ATS (`lib/atsScoreClient.js`).
 *
 * Couvre :
 *  - construction defensive du payload (champs vides ignores),
 *  - validation d entree (template_id ou layout requis),
 *  - normalisation defensive de la reponse API,
 *  - clamp du score dans [0, 100],
 *  - bucketisation en tonalite UI.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATS_SCORE_PARSING_ENDPOINT,
  buildAtsScoreParsingPayload,
  fetchAtsScoreParsing,
  normalizeAtsScoreResponse,
  scoreToneFor,
} from '../../src/lib/atsScoreClient.js';

test('endpoint est /api/ats/score-parsing (contrat backend)', () => {
  assert.equal(ATS_SCORE_PARSING_ENDPOINT, '/api/ats/score-parsing');
});

test('buildAtsScoreParsingPayload ignore les champs vides', () => {
  assert.deepEqual(buildAtsScoreParsingPayload({}), {});
  assert.deepEqual(buildAtsScoreParsingPayload({ templateId: '  ' }), {});
  assert.deepEqual(buildAtsScoreParsingPayload({ layout: {} }), {});
  assert.deepEqual(buildAtsScoreParsingPayload({ templateId: 'minimal' }), { template_id: 'minimal' });
});

test('buildAtsScoreParsingPayload trim le templateId', () => {
  assert.deepEqual(buildAtsScoreParsingPayload({ templateId: '  modern  ' }), { template_id: 'modern' });
});

test('buildAtsScoreParsingPayload accepte un layout non vide', () => {
  const layout = { grid: { columns: 2 } };
  assert.deepEqual(buildAtsScoreParsingPayload({ layout }), { layout });
});

test('buildAtsScoreParsingPayload propage le cv si fourni', () => {
  const cv = { nom: 'Doe' };
  assert.deepEqual(buildAtsScoreParsingPayload({ templateId: 'minimal', cv }), { template_id: 'minimal', cv });
});

test('fetchAtsScoreParsing leve si ni templateId ni layout', async () => {
  await assert.rejects(
    () => fetchAtsScoreParsing({}, { fetcher: async () => ({}) }),
    /template_id or layout/,
  );
});

test('fetchAtsScoreParsing passe le payload au fetcher injecte', async () => {
  let captured = null;
  const fakeFetcher = async (path, body) => {
    captured = { path, body };
    return { kind: 'parsing', total: 95, version: '2026.05', rules: [] };
  };
  const result = await fetchAtsScoreParsing({ templateId: 'minimal' }, { fetcher: fakeFetcher });
  assert.equal(captured.path, ATS_SCORE_PARSING_ENDPOINT);
  assert.deepEqual(captured.body, { template_id: 'minimal' });
  assert.equal(result.score, 95);
  assert.equal(result.version, '2026.05');
});

test('fetchAtsScoreParsing propage les erreurs du fetcher', async () => {
  const failing = async () => { throw new Error('rate limited'); };
  await assert.rejects(
    () => fetchAtsScoreParsing({ templateId: 'minimal' }, { fetcher: failing }),
    /rate limited/,
  );
});

test('normalizeAtsScoreResponse leve si shape invalide', () => {
  assert.throws(() => normalizeAtsScoreResponse(null), /invalide/);
  assert.throws(() => normalizeAtsScoreResponse('nope'), /invalide/);
  assert.throws(() => normalizeAtsScoreResponse({}), /manquant/);
});

test('normalizeAtsScoreResponse clamp le score dans [0, 100]', () => {
  // Regression : meme si le backend renvoie un score hors borne, l UI
  // ne doit jamais afficher 150/100 ou -10/100.
  assert.equal(normalizeAtsScoreResponse({ total: 150 }).score, 100);
  assert.equal(normalizeAtsScoreResponse({ total: -10 }).score, 0);
  assert.equal(normalizeAtsScoreResponse({ total: 73.6 }).score, 74);
});

test('normalizeAtsScoreResponse accepte total ou score (futur-proof)', () => {
  assert.equal(normalizeAtsScoreResponse({ total: 80 }).score, 80);
  assert.equal(normalizeAtsScoreResponse({ score: 80 }).score, 80);
});

test('normalizeAtsScoreResponse normalise les regles', () => {
  const result = normalizeAtsScoreResponse({
    total: 90,
    rules: [
      { id: 'malus_sidebar_present', label: 'Sidebar present', delta: -5, severity: 'warning' },
      { id: 'orphan_without_id_should_be_dropped' },
      null,
      'not-an-object',
      { label: 'rule sans id ignoree' },
    ],
  });
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules[0].id, 'malus_sidebar_present');
  assert.equal(result.rules[0].delta, -5);
  assert.equal(result.rules[1].id, 'orphan_without_id_should_be_dropped');
  // Default label = id si absent
  assert.equal(result.rules[1].label, 'orphan_without_id_should_be_dropped');
});

test('normalizeAtsScoreResponse accepte rules_triggered (alias retrocompat)', () => {
  // Au cas ou un futur changement de l API renommait rules <-> rules_triggered.
  const result = normalizeAtsScoreResponse({
    total: 92,
    rules_triggered: [{ id: 'malus_two_columns', label: '', delta: -8, severity: 'warning' }],
  });
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].id, 'malus_two_columns');
});

test('scoreToneFor renvoie good / meh / bad / unknown selon les seuils', () => {
  assert.equal(scoreToneFor(100), 'good');
  assert.equal(scoreToneFor(90), 'good');
  assert.equal(scoreToneFor(89), 'meh');
  assert.equal(scoreToneFor(70), 'meh');
  assert.equal(scoreToneFor(69), 'bad');
  assert.equal(scoreToneFor(0), 'bad');
  assert.equal(scoreToneFor(NaN), 'unknown');
  assert.equal(scoreToneFor(undefined), 'unknown');
});
