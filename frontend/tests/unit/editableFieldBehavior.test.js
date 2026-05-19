/**
 * Tests unitaires du module `editableFieldBehavior.js`.
 *
 * On simule un mini-DOM minimal pour pouvoir tester :
 *  - la normalisation des paths
 *  - le mapping path -> config
 *  - l attachement / detachement des listeners
 *  - l etat data-cv-empty
 *  - le comportement Escape (annule + restore)
 *  - le comportement Enter sur single-line (preventDefault + focus next)
 *  - la propagation de Enter sur multi-line (pas de preventDefault)
 *  - le paste nettoye sur single-line
 *
 * Pas de jsdom : un mock leger suffit, car le module ne fait que de la
 * manipulation d attribut + des handlers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachEditableFieldBehavior,
  findNextEditableField,
  getEditableFieldConfig,
  normalizeFieldPath,
} from '../../src/lib/editableFieldBehavior.js';

/**
 * Mini element DOM compatible avec ce dont le module a besoin.
 * On gere : addEventListener / removeEventListener, attributes, textContent,
 * blur, focus, closest, ownerDocument minimal.
 */
function createMockElement(opts = {}) {
  const listeners = new Map();
  const attrs = new Map();
  const el = {
    _kind: 'element',
    tagName: opts.tagName || 'SPAN',
    textContent: opts.textContent || '',
    _focused: false,
    _parent: null,
    children: [],
    addEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(type, arr.filter((f) => f !== fn));
    },
    dispatch(type, evt) {
      const arr = listeners.get(type) || [];
      const event = Object.assign({
        type,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      }, evt || {});
      for (const fn of arr) fn(event);
      return event;
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); },
    hasAttribute(k) { return attrs.has(k); },
    focus() { el._focused = true; },
    blur() { el._focused = false; el.dispatch('blur', {}); },
    closest() { return null; },
    querySelectorAll() { return []; },
    ownerDocument: null,
    _listeners: listeners,
    _attrs: attrs,
  };
  return el;
}

// ---------------------------------------------------------------------------
// normalizeFieldPath
// ---------------------------------------------------------------------------

test('normalizeFieldPath : remplace les segments numeriques par *', () => {
  assert.equal(normalizeFieldPath('prenom'), 'prenom');
  assert.equal(normalizeFieldPath('experiences.0.entreprise'), 'experiences.*.entreprise');
  assert.equal(normalizeFieldPath('experiences.12.bullet_points.3'), 'experiences.*.bullet_points.*');
  assert.equal(normalizeFieldPath('competences.techniques.0'), 'competences.techniques.*');
});

test('normalizeFieldPath : tolere null / undefined / non-string', () => {
  assert.equal(normalizeFieldPath(null), '');
  assert.equal(normalizeFieldPath(undefined), '');
  assert.equal(normalizeFieldPath(123), '');
  assert.equal(normalizeFieldPath(''), '');
});

// ---------------------------------------------------------------------------
// getEditableFieldConfig
// ---------------------------------------------------------------------------

test('getEditableFieldConfig : renvoie la config pour un champ simple', () => {
  const c = getEditableFieldConfig('prenom');
  assert.equal(c.placeholder, 'Prénom');
  assert.equal(c.multiline, false);
});

test('getEditableFieldConfig : renvoie multiline=true pour resume', () => {
  const c = getEditableFieldConfig('resume');
  assert.equal(c.multiline, true);
});

test('getEditableFieldConfig : renvoie multiline=true pour bullet_points', () => {
  const c = getEditableFieldConfig('experiences.0.bullet_points.2');
  assert.equal(c.multiline, true);
  assert.match(c.placeholder, /Action|résultat/i);
});

test('getEditableFieldConfig : path inconnu -> defaut (placeholder vide, single-line)', () => {
  const c = getEditableFieldConfig('inconnu.0.field');
  assert.equal(c.placeholder, '');
  assert.equal(c.multiline, false);
});

// ---------------------------------------------------------------------------
// attachEditableFieldBehavior — attributs initiaux
// ---------------------------------------------------------------------------

test('attachEditableFieldBehavior : pose placeholder + multiline sur le DOM', () => {
  const el = createMockElement({ textContent: '' });
  const cfg = getEditableFieldConfig('prenom');
  const cleanup = attachEditableFieldBehavior(el, cfg);
  assert.equal(el.getAttribute('data-cv-placeholder'), 'Prénom');
  assert.equal(el.getAttribute('data-cv-multiline'), 'false');
  assert.ok(el.hasAttribute('data-cv-empty'), 'empty au demarrage');
  cleanup();
  assert.equal(el.getAttribute('data-cv-placeholder'), null);
  assert.equal(el.getAttribute('data-cv-multiline'), null);
  assert.equal(el.getAttribute('data-cv-empty'), null);
});

test('attachEditableFieldBehavior : pas de data-cv-empty si textContent non vide', () => {
  const el = createMockElement({ textContent: 'John' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('prenom'));
  assert.equal(el.hasAttribute('data-cv-empty'), false);
});

test('attachEditableFieldBehavior : input -> recalcule data-cv-empty', () => {
  const el = createMockElement({ textContent: 'X' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('prenom'));
  assert.equal(el.hasAttribute('data-cv-empty'), false);
  el.textContent = '';
  el.dispatch('input', {});
  assert.equal(el.hasAttribute('data-cv-empty'), true);
});

// ---------------------------------------------------------------------------
// Escape : annule l edition
// ---------------------------------------------------------------------------

test('Escape : restaure la valeur snapshot prise au focus', () => {
  const el = createMockElement({ textContent: 'Jean' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('prenom'));
  el.dispatch('focus', {});
  el.textContent = 'Jean-Paul';
  el.dispatch('input', {});
  const evt = el.dispatch('keydown', { key: 'Escape' });
  assert.equal(evt.defaultPrevented, true);
  assert.equal(el.textContent, 'Jean');
});

// ---------------------------------------------------------------------------
// Enter single-line : preventDefault + focus next
// ---------------------------------------------------------------------------

test('Enter sur single-line : preventDefault + blur', () => {
  const el = createMockElement({ textContent: 'Jean' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('prenom'));
  el.dispatch('focus', {});
  const evt = el.dispatch('keydown', { key: 'Enter' });
  assert.equal(evt.defaultPrevented, true);
  assert.equal(el._focused, false);
});

test('Enter sur multi-line : pas de preventDefault (saut natif)', () => {
  const el = createMockElement({ textContent: 'foo' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('resume'));
  el.dispatch('focus', {});
  const evt = el.dispatch('keydown', { key: 'Enter' });
  assert.equal(evt.defaultPrevented, false);
});

// ---------------------------------------------------------------------------
// Touches autres : pas d effet
// ---------------------------------------------------------------------------

test('Touche `a` : pas de preventDefault', () => {
  const el = createMockElement({ textContent: '' });
  attachEditableFieldBehavior(el, getEditableFieldConfig('prenom'));
  const evt = el.dispatch('keydown', { key: 'a' });
  assert.equal(evt.defaultPrevented, false);
});

// ---------------------------------------------------------------------------
// findNextEditableField (sans closest)
// ---------------------------------------------------------------------------

test('findNextEditableField : null si pas de scope', () => {
  const el = createMockElement({ textContent: '' });
  // pas de closest, pas d ownerDocument valide
  assert.equal(findNextEditableField(el), null);
});

test('findNextEditableField : tolere null', () => {
  assert.equal(findNextEditableField(null), null);
});

// ---------------------------------------------------------------------------
// attachEditableFieldBehavior : tolere args invalides
// ---------------------------------------------------------------------------

test('attachEditableFieldBehavior : retourne noop si field null', () => {
  const cleanup = attachEditableFieldBehavior(null, {});
  assert.equal(typeof cleanup, 'function');
  cleanup(); // ne throw pas
});

test('attachEditableFieldBehavior : config absent -> defaut single-line', () => {
  const el = createMockElement({ textContent: '' });
  attachEditableFieldBehavior(el, null);
  assert.equal(el.getAttribute('data-cv-multiline'), 'false');
});
