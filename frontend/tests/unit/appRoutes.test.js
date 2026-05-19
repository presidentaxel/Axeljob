/**
 * Tests unitaires pour la table de routes /app/* (lib/appRoutes.js).
 *
 * Cible : verrouiller le contrat de navigation (clés stables, mapping
 * pathname → vue) pour éviter qu'un renommage casse silencieusement
 * l'onglet Settings, Profil, Support, etc.
 *
 * Exécution : `npm run test:unit` (utilise le runner natif `node --test`,
 * pas de framework de test additionnel à installer).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_BASE,
  APP_ROUTES,
  APP_DEFAULT_ROUTE,
  getViewFromPathname,
  isKnownAppPathname,
} from '../../src/lib/appRoutes.js';

test('APP_BASE est "/app"', () => {
  assert.equal(APP_BASE, '/app');
});

test('APP_ROUTES contient toutes les routes attendues (clés stables)', () => {
  const expectedKeys = ['cv', 'postule', 'profil', 'linkedin', 'settings', 'support', 'monitoring'];
  for (const key of expectedKeys) {
    assert.ok(key in APP_ROUTES, `APP_ROUTES manque la clé "${key}"`);
  }
});

test('APP_ROUTES.settings pointe sur /app/settings', () => {
  assert.equal(APP_ROUTES.settings, '/app/settings');
});

test('APP_DEFAULT_ROUTE redirige vers /app/cv', () => {
  assert.equal(APP_DEFAULT_ROUTE, '/app/cv');
});

test('getViewFromPathname mappe chaque route principale sur sa vue', () => {
  assert.equal(getViewFromPathname('/app/cv'), 'cv');
  assert.equal(getViewFromPathname('/app/postule'), 'candidatures');
  assert.equal(getViewFromPathname('/app/profil'), 'profil');
  assert.equal(getViewFromPathname('/app/linkedin'), 'profil');
  assert.equal(getViewFromPathname('/app/settings'), 'settings');
  assert.equal(getViewFromPathname('/app/support'), 'support');
  assert.equal(getViewFromPathname('/app/monitoring'), 'monitoring');
});

test('getViewFromPathname reconnaît les sous-chemins de settings', () => {
  // Les vues sont sélectionnées via startsWith : un futur sous-onglet de
  // Settings (ex. /app/settings/account) doit rester sur la vue "settings".
  assert.equal(getViewFromPathname('/app/settings/account'), 'settings');
  assert.equal(getViewFromPathname('/app/settings/export'), 'settings');
});

test('getViewFromPathname tombe sur "cv" pour un pathname vide ou inconnu', () => {
  assert.equal(getViewFromPathname(''), 'cv');
  assert.equal(getViewFromPathname(undefined), 'cv');
  assert.equal(getViewFromPathname('/inconnu'), 'cv');
});

test('isKnownAppPathname reconnaît /app/settings et rejette les chemins hors workspace', () => {
  assert.equal(isKnownAppPathname('/app'), true);
  assert.equal(isKnownAppPathname('/app/'), true);
  assert.equal(isKnownAppPathname('/app/settings'), true);
  assert.equal(isKnownAppPathname('/app/settings/account'), true);
  assert.equal(isKnownAppPathname('/app/profil'), true);
  assert.equal(isKnownAppPathname('/app/support'), true);
  assert.equal(isKnownAppPathname('/login'), false);
  assert.equal(isKnownAppPathname(''), false);
  assert.equal(isKnownAppPathname(null), false);
});

test('settings est positionné entre profil et support dans APP_ROUTES (ordre stable)', () => {
  // Garde-fou contre un reorder accidentel : l'ordre de déclaration
  // sert d'aide-mémoire visuelle dans le code, et reflète l'ordre
  // d'apparition dans la topbar.
  const keys = Object.keys(APP_ROUTES);
  const idxProfil = keys.indexOf('profil');
  const idxSettings = keys.indexOf('settings');
  const idxSupport = keys.indexOf('support');
  assert.ok(idxProfil >= 0 && idxSettings >= 0 && idxSupport >= 0);
  assert.ok(idxProfil < idxSettings, 'settings doit venir après profil');
  assert.ok(idxSettings < idxSupport, 'settings doit venir avant support');
});
