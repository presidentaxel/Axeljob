/**
 * AXE-339 — freeform canvas → identité / contact (heuristique).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  IDENTITY_APPLY_CONFIDENCE,
  applyIdentitySyncPatch,
  boostConfidenceWithLayout,
  parseContactCandidate,
  parseIdentityCandidate,
  plainTextFromContent,
  suggestFreeformCvSync,
} from '../../src/lib/freeCanvasIdentitySync.js';

describe('freeCanvasIdentitySync', () => {
  it('plainTextFromContent strip HTML', () => {
    assert.equal(plainTextFromContent('<strong>Jean</strong> Dupont'), 'Jean Dupont');
  });

  it('parseIdentityCandidate : Jean Dupont', () => {
    const hit = parseIdentityCandidate('Jean Dupont');
    assert.ok(hit);
    assert.equal(hit.prenom, 'Jean');
    assert.equal(hit.nom, 'Dupont');
    assert.ok(hit.confidence >= 0.5);
  });

  it('parseIdentityCandidate refuse email / chiffres / titre section', () => {
    assert.equal(parseIdentityCandidate('jean@example.com'), null);
    assert.equal(parseIdentityCandidate('Jean 2 Dupont'), null);
    assert.equal(parseIdentityCandidate('Expériences'), null);
  });

  it('parseContactCandidate email + téléphone', () => {
    const hit = parseContactCandidate('jean@example.com — +33 6 12 34 56 78');
    assert.ok(hit);
    assert.equal(hit.patch.email, 'jean@example.com');
    assert.ok(hit.patch.telephone.includes('33'));
    assert.ok(hit.confidence >= 0.8);
  });

  it('boostConfidenceWithLayout : haut de page + bold', () => {
    const base = 0.55;
    const boosted = boostConfidenceWithLayout(
      base,
      { y: 12, type: 'title', style: { bold: true, font_size: 18 } },
      { height_mm: 297 },
    );
    assert.ok(boosted > base);
    assert.ok(boosted >= IDENTITY_APPLY_CONFIDENCE);
  });

  it('suggestFreeformCvSync apply identité en tête', () => {
    const suggestion = suggestFreeformCvSync({
      content: 'Jean Dupont',
      block: { type: 'title', y: 10, style: { bold: true, font_size: 18 } },
      page: { height_mm: 297 },
      cv: { prenom: '', nom: '', email: '' },
    });
    assert.equal(suggestion.action, 'apply');
    assert.equal(suggestion.patch.prenom, 'Jean');
    assert.equal(suggestion.patch.nom, 'Dupont');
  });

  it('suggestFreeformCvSync hint si confiance moyenne', () => {
    const suggestion = suggestFreeformCvSync({
      content: 'jean dupont',
      block: { type: 'text', y: 200, style: {} },
      page: { height_mm: 297 },
      cv: {},
    });
    assert.equal(suggestion.action, 'hint');
    assert.ok(suggestion.message);
    assert.ok(Array.isArray(suggestion.options));
    assert.ok(suggestion.options.some((o) => o.label === 'Nom complet'));
    assert.ok(suggestion.options.some((o) => o.label === 'Titre pro'));
  });

  it('suggestFreeformCvSync ask pour un mot ambigu', () => {
    const suggestion = suggestFreeformCvSync({
      content: 'Développeur',
      block: { type: 'title', y: 20, style: { bold: true } },
      page: { height_mm: 297 },
      cv: {},
    });
    assert.equal(suggestion.action, 'hint');
    assert.equal(suggestion.kind, 'ask');
    assert.ok(suggestion.options.some((o) => o.label === 'Titre pro'));
    assert.ok(suggestion.options.some((o) => o.label === 'Prénom'));
  });

  it('suggestFreeformCvSync none si déjà synchronisé', () => {
    const suggestion = suggestFreeformCvSync({
      content: 'Jean Dupont',
      block: { type: 'title', y: 10, style: { bold: true, font_size: 18 } },
      page: { height_mm: 297 },
      cv: { prenom: 'Jean', nom: 'Dupont', first_name: 'Jean', last_name: 'Dupont' },
    });
    assert.equal(suggestion.action, 'none');
  });

  it('applyIdentitySyncPatch synchronise dual-key', () => {
    const next = applyIdentitySyncPatch(
      { email: 'a@b.c' },
      { prenom: 'Jean', nom: 'Dupont' },
    );
    assert.equal(next.prenom, 'Jean');
    assert.equal(next.first_name, 'Jean');
    assert.equal(next.nom, 'Dupont');
    assert.equal(next.last_name, 'Dupont');
    assert.equal(next.email, 'a@b.c');
  });

  it('suggestFreeformCvSync apply contact email', () => {
    const suggestion = suggestFreeformCvSync({
      content: 'contact: marie.curie@lab.fr',
      block: { type: 'text', y: 40 },
      page: { height_mm: 297 },
      cv: { email: '' },
    });
    assert.equal(suggestion.action, 'apply');
    assert.equal(suggestion.kind, 'contact');
    assert.equal(suggestion.patch.email, 'marie.curie@lab.fr');
  });
});
