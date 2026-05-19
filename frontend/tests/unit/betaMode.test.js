/**
 * Tests unitaires du module `lib/betaMode.js`.
 *
 * Couvre :
 *  - lecture / écriture persistante,
 *  - tolérance aux storages indisponibles / qui lèvent,
 *  - dispatch / souscription d'événements,
 *  - régressions identifiées (handler qui throw, valeurs autres que "1").
 *
 * Exécution : `npm run test:unit` (utilise `node --test`, pas de framework).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BETA_MODE_EVENT,
  BETA_MODE_STORAGE_KEY,
  dispatchBetaModeChange,
  isBetaModeEnabled,
  setBetaModeEnabled,
  subscribeBetaMode,
} from '../../src/lib/betaMode.js';

/** Construit un faux Storage compatible Web Storage API. */
function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    _raw: store,
  };
}

/** Storage qui throw sur setItem (mode incognito iOS, quota, etc.). */
function makeThrowingStorage() {
  return {
    getItem: () => { throw new Error('storage forbidden'); },
    setItem: () => { throw new Error('storage forbidden'); },
    removeItem: () => {},
    clear: () => {},
  };
}

test('BETA_MODE_STORAGE_KEY est versionne (v1)', () => {
  // Regression : la cle doit etre versionnee pour permettre une migration
  // future sans collision avec un ancien stockage.
  assert.match(BETA_MODE_STORAGE_KEY, /_v\d+$/);
});

test('isBetaModeEnabled retourne false quand rien n est stocke', () => {
  const s = makeFakeStorage();
  assert.equal(isBetaModeEnabled(s), false);
});

test('setBetaModeEnabled(true) persiste "1"', () => {
  const s = makeFakeStorage();
  assert.equal(setBetaModeEnabled(true, s), true);
  assert.equal(s.getItem(BETA_MODE_STORAGE_KEY), '1');
  assert.equal(isBetaModeEnabled(s), true);
});

test('setBetaModeEnabled(false) persiste "0"', () => {
  const s = makeFakeStorage();
  setBetaModeEnabled(true, s);
  assert.equal(setBetaModeEnabled(false, s), true);
  assert.equal(s.getItem(BETA_MODE_STORAGE_KEY), '0');
  assert.equal(isBetaModeEnabled(s), false);
});

test('isBetaModeEnabled retourne false pour une valeur stockee autre que "1"', () => {
  // Regression : seul "1" doit etre considere comme actif, pour empecher
  // qu'un ancien stockage tronque ou corrompu active accidentellement la beta.
  const s = makeFakeStorage();
  s.setItem(BETA_MODE_STORAGE_KEY, 'true');
  assert.equal(isBetaModeEnabled(s), false);
  s.setItem(BETA_MODE_STORAGE_KEY, 'yes');
  assert.equal(isBetaModeEnabled(s), false);
});

test('isBetaModeEnabled retourne false quand le storage leve une exception', () => {
  // Regression : un mode incognito ou un quota plein ne doit pas crasher
  // toute l app, il doit simplement renvoyer false.
  assert.equal(isBetaModeEnabled(makeThrowingStorage()), false);
});

test('setBetaModeEnabled retourne false quand le storage leve', () => {
  // Regression : on doit pouvoir afficher un message d erreur UX clair
  // si la persistance echoue (mode prive bloque).
  assert.equal(setBetaModeEnabled(true, makeThrowingStorage()), false);
});

test('setBetaModeEnabled retourne false quand aucun storage n est disponible', () => {
  assert.equal(setBetaModeEnabled(true, null), false);
});

test('isBetaModeEnabled retourne false quand aucun storage n est disponible', () => {
  assert.equal(isBetaModeEnabled(null), false);
});

test('subscribeBetaMode retourne un no-op quand pas d EventTarget global', () => {
  // Dans Node sans DOM, subscribe ne doit pas crasher et doit retourner
  // une fonction d unsubscribe valide (idempotente).
  const unsubscribe = subscribeBetaMode(() => {});
  assert.equal(typeof unsubscribe, 'function');
  // Doit pouvoir etre appele plusieurs fois sans throw.
  unsubscribe();
  unsubscribe();
});

test('dispatchBetaModeChange ne crashe jamais et retourne un booleen', () => {
  // Le module ne doit jamais crasher l environnement de test Node, meme
  // si dispatchEvent / CustomEvent ne sont pas disponibles. Node fournit
  // CustomEvent mais pas dispatchEvent global (alors que les navigateurs
  // fournissent les deux) ; la fonction doit etre defensive.
  const result = dispatchBetaModeChange(true);
  assert.equal(typeof result, 'boolean');
});

test('subscribeBetaMode recoit les notifications quand un EventTarget existe', { skip: typeof globalThis.addEventListener !== 'function' || typeof globalThis.CustomEvent !== 'function' }, () => {
  const events = [];
  const unsubscribe = subscribeBetaMode((v) => events.push(v));
  dispatchBetaModeChange(true);
  dispatchBetaModeChange(false);
  unsubscribe();
  dispatchBetaModeChange(true);
  // Apres unsubscribe : on ne recoit plus rien.
  assert.deepEqual(events, [true, false]);
});

test('un handler qui throw ne casse pas les autres', { skip: typeof globalThis.addEventListener !== 'function' || typeof globalThis.CustomEvent !== 'function' }, () => {
  // Regression : si un handler de souscription lance une exception,
  // les autres handlers doivent continuer d etre appeles normalement.
  const received = [];
  const u1 = subscribeBetaMode(() => { throw new Error('handler casse'); });
  const u2 = subscribeBetaMode((v) => received.push(v));
  dispatchBetaModeChange(true);
  u1();
  u2();
  assert.deepEqual(received, [true]);
});

test('BETA_MODE_EVENT a un nom stable et namespace', () => {
  // Regression : le nom de l event est partage entre subscribers (autres
  // composants, plugins de dev tools eventuels). Tout renommage doit etre
  // intentionnel et accompagne.
  assert.equal(BETA_MODE_EVENT, 'cv-bot:beta-mode-changed');
});
