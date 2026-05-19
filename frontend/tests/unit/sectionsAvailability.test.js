/**
 * Tests unitaires de `lib/sectionsAvailability.js`.
 * Utilise un mini-mock DOM (sans JSDOM) pour rester rapide et
 * deterministe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupIdLabel, readSectionsAvailability } from '../../src/lib/sectionsAvailability.js';

/** Petit helper pour fabriquer un container avec des sections groupees par parent.
 *  shape = [ { parentClass: 'cv-body', keys: ['experiences','formations'] }, ... ]
 *  retourne le container fictif racine.
 */
function makeContainer(shape) {
  const root = {
    children: [],
    querySelectorAll(selector) {
      if (selector !== '[data-cv-section]') return [];
      // Aplatit en DFS.
      const out = [];
      function walk(node) {
        for (const child of node.children || []) {
          if (child.dataset && child.dataset.cvSection) out.push(child);
          walk(child);
        }
      }
      walk(root);
      return out;
    },
  };
  for (const { parentClass, parentTag, keys } of shape) {
    const parent = { className: parentClass || '', tagName: parentTag || 'DIV', children: [] };
    for (const k of keys) {
      parent.children.push({ dataset: { cvSection: k }, parentNode: parent, tagName: 'SECTION' });
    }
    root.children.push(parent);
  }
  return root;
}

test('readSectionsAvailability : container null -> null', () => {
  assert.equal(readSectionsAvailability(null), null);
  assert.equal(readSectionsAvailability(undefined), null);
  assert.equal(readSectionsAvailability({}), null, 'objet sans querySelectorAll');
});

test('readSectionsAvailability : container vide -> null', () => {
  const empty = makeContainer([]);
  assert.equal(readSectionsAvailability(empty), null);
});

test('readSectionsAvailability : layout mono-colonne (article)', () => {
  const c = makeContainer([
    { parentTag: 'ARTICLE', parentClass: 'cv cv-preview cv-editable cv-print-split', keys: ['resume', 'experiences', 'formations'] },
  ]);
  const out = readSectionsAvailability(c);
  assert.ok(out);
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].groupId, 'main', 'ARTICLE -> main');
  assert.deepEqual(out.groups[0].keys, ['resume', 'experiences', 'formations']);
  assert.deepEqual(out.availableKeys, ['resume', 'experiences', 'formations']);
  assert.equal(out.keyToGroup.experiences, 'main');
});

test('readSectionsAvailability : layout sidebar (main + sidebar)', () => {
  const c = makeContainer([
    { parentClass: 'cv-body main-column', keys: ['experiences', 'formations', 'projets'] },
    { parentClass: 'cv-sidebar', keys: ['competences', 'certifications'] },
  ]);
  const out = readSectionsAvailability(c);
  assert.equal(out.groups.length, 2);
  assert.equal(out.groups[0].groupId, 'main');
  assert.equal(out.groups[1].groupId, 'sidebar');
  assert.equal(out.keyToGroup.competences, 'sidebar');
  assert.equal(out.keyToGroup.experiences, 'main');
});

test('readSectionsAvailability : parent inconnu -> group-N', () => {
  const c = makeContainer([
    { parentClass: 'weird-wrapper', parentTag: 'SECTION', keys: ['experiences'] },
  ]);
  const out = readSectionsAvailability(c);
  assert.equal(out.groups[0].groupId, 'group-0');
});

test('readSectionsAvailability : sections rendues = availableKeys', () => {
  const c = makeContainer([
    { parentClass: 'cv-body', keys: ['experiences', 'formations'] },
  ]);
  const out = readSectionsAvailability(c);
  assert.deepEqual(out.availableKeys, ['experiences', 'formations']);
  // `resume`, `certifications`, `projets`, `competences` ne sont PAS dans availableKeys
  // -> seront marquees "locked" dans le drawer.
  assert.equal(out.availableKeys.includes('resume'), false);
});

test('groupIdLabel : libelles traduits', () => {
  assert.equal(groupIdLabel('main'), 'Principal');
  assert.equal(groupIdLabel('sidebar'), 'Sidebar');
  assert.equal(groupIdLabel('group-0'), null);
  assert.equal(groupIdLabel('unknown'), null);
});
