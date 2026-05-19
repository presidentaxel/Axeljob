/**
 * Tests unitaires de `lib/applyLayoutToDom.js`.
 *
 * On utilise un mini-mock DOM qui implemente strictement les APIs que le
 * module consomme (querySelectorAll, dataset.cvSection, parentNode,
 * insertBefore, nextSibling). Cela evite la dependance JSDOM et garde
 * les tests rapides + deterministes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyLayoutToDom } from '../../src/lib/applyLayoutToDom.js';

/** Cree un node "section" mock identifiable par sa data-cv-section. */
function makeSection(key) {
  return {
    dataset: { cvSection: key },
    parentNode: null,
    nextSibling: null,
    __key: key,
  };
}

/** Cree un container mock contenant des `sections` en ordre. */
function makeContainer(keys) {
  const sections = keys.map(makeSection);
  const container = {
    children: sections,
    querySelectorAll(selector) {
      if (selector !== '[data-cv-section]') return [];
      return container.children.filter((n) => n.dataset && n.dataset.cvSection);
    },
    insertBefore(node, refNode) {
      // Detache node de sa position courante.
      const idx = container.children.indexOf(node);
      if (idx >= 0) container.children.splice(idx, 1);
      // Ou inserer ?
      if (refNode == null) {
        container.children.push(node);
      } else {
        const refIdx = container.children.indexOf(refNode);
        if (refIdx < 0) container.children.push(node);
        else container.children.splice(refIdx, 0, node);
      }
      node.parentNode = container;
      // Recalcule nextSibling de tous les nodes (simulation simplifiee).
      for (let i = 0; i < container.children.length; i += 1) {
        container.children[i].nextSibling = container.children[i + 1] || null;
        container.children[i].parentNode = container;
      }
    },
  };
  for (const s of sections) {
    s.parentNode = container;
  }
  for (let i = 0; i < sections.length; i += 1) {
    sections[i].nextSibling = sections[i + 1] || null;
  }
  return container;
}

function getOrderKeys(container) {
  return container.children.map((n) => n.dataset.cvSection);
}

test('applyLayoutToDom : reordonne correctement', () => {
  const container = makeContainer(['resume', 'experiences', 'formations', 'certifications']);
  const moved = applyLayoutToDom(container, ['certifications', 'resume', 'formations', 'experiences']);
  assert.equal(moved, true);
  assert.deepEqual(getOrderKeys(container), ['certifications', 'resume', 'formations', 'experiences']);
});

test('applyLayoutToDom : idempotent (rien a deplacer)', () => {
  const container = makeContainer(['resume', 'experiences', 'formations']);
  const moved = applyLayoutToDom(container, ['resume', 'experiences', 'formations']);
  assert.equal(moved, false, 'aucun deplacement quand deja en ordre');
  assert.deepEqual(getOrderKeys(container), ['resume', 'experiences', 'formations']);
});

test('applyLayoutToDom : sections non listees restent a la fin', () => {
  const container = makeContainer(['resume', 'experiences', 'extra1', 'formations', 'extra2']);
  applyLayoutToDom(container, ['formations', 'resume', 'experiences']);
  const result = getOrderKeys(container);
  assert.deepEqual(result.slice(0, 3), ['formations', 'resume', 'experiences']);
  assert.ok(result.includes('extra1'));
  assert.ok(result.includes('extra2'));
  assert.equal(result.length, 5);
});

test('applyLayoutToDom : sectionsOrder contient des cles non presentes -> skip', () => {
  const container = makeContainer(['resume', 'experiences']);
  const moved = applyLayoutToDom(container, ['fantom', 'experiences', 'resume', 'other']);
  assert.equal(moved, true);
  assert.deepEqual(getOrderKeys(container), ['experiences', 'resume']);
});

test('applyLayoutToDom : container null -> no-op et retourne false', () => {
  assert.equal(applyLayoutToDom(null, ['a', 'b']), false);
  assert.equal(applyLayoutToDom(undefined, ['a']), false);
});

test('applyLayoutToDom : sectionsOrder vide ou non-array -> no-op', () => {
  const container = makeContainer(['resume', 'experiences']);
  const orderBefore = getOrderKeys(container);
  applyLayoutToDom(container, []);
  assert.deepEqual(getOrderKeys(container), orderBefore);
  applyLayoutToDom(container, 'not-array');
  assert.deepEqual(getOrderKeys(container), orderBefore);
});

test('applyLayoutToDom : container sans sections -> false', () => {
  const empty = {
    children: [],
    querySelectorAll: () => [],
    insertBefore: () => {},
  };
  assert.equal(applyLayoutToDom(empty, ['a']), false);
});

test('applyLayoutToDom : ne deplace que ce qui est necessaire (perf)', () => {
  // Si seul un node bouge, on insertBefore une seule fois.
  let calls = 0;
  const container = makeContainer(['a', 'b', 'c']);
  const baseInsert = container.insertBefore.bind(container);
  container.insertBefore = (node, ref) => {
    calls += 1;
    baseInsert(node, ref);
  };
  applyLayoutToDom(container, ['a', 'b', 'c']);
  assert.equal(calls, 0, 'ordre identique -> aucun insertBefore');
});
