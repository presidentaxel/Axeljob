/**
 * Tests unitaires du modele de mise en page v2 (`lib/cvLayoutModelV2.js`).
 * Couvre : defaut, sanitize defensif, migration v1->v2, mouvements
 * inter-zones, toggle on/off, ratio, side, flatten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_SECTION_KEYS_V2,
  CANONICAL_ZONE_KEYS,
  LAYOUT_V2_VERSION,
  SIDEBAR_RATIO_DEFAULT,
  SIDEBAR_RATIO_MAX,
  SIDEBAR_RATIO_MIN,
  SIDEBAR_SIDES,
  createDefaultLayoutV2,
  flattenLayoutV2ToOrder,
  getZoneOfSection,
  isDefaultLayoutV2,
  migrateLayoutV1ToV2,
  moveSectionToZone,
  resetLayoutV2,
  sanitizeLayoutV2,
  setSidebarRatioV2,
  setSidebarSide,
  setZoneEnabled,
} from '../../src/lib/cvLayoutModelV2.js';

test('createDefaultLayoutV2 : forme canonique', () => {
  const d = createDefaultLayoutV2();
  assert.equal(d.version, LAYOUT_V2_VERSION);
  assert.equal(d.sidebarRatio, SIDEBAR_RATIO_DEFAULT);
  assert.equal(d.sidebarSide, 'right');
  assert.equal(d.theme, 'default');
  // Toutes les zones actives
  assert.ok(d.zones.header.enabled);
  assert.ok(d.zones.main.enabled);
  assert.ok(d.zones.sidebar.enabled);
  // identity dans le header
  assert.equal(d.zones.header.sections[0], 'identity');
  assert.ok(d.zones.header.sections.includes('resume'));
  // experiences/formations/projets dans main
  for (const k of ['experiences', 'formations', 'projets']) {
    assert.ok(d.zones.main.sections.includes(k), `${k} dans main`);
  }
  // competences/certifications dans sidebar
  for (const k of ['competences', 'certifications']) {
    assert.ok(d.zones.sidebar.sections.includes(k), `${k} dans sidebar`);
  }
});

test('createDefaultLayoutV2 : presence exhaustive des sections canoniques', () => {
  const d = createDefaultLayoutV2();
  const flat = flattenLayoutV2ToOrder(d);
  for (const s of CANONICAL_SECTION_KEYS_V2) {
    assert.ok(flat.includes(s), `${s} doit apparaitre dans le layout par defaut`);
  }
  // Pas de doublons
  assert.equal(new Set(flat).size, flat.length);
});

test('sanitizeLayoutV2 : null / undefined / non-objet -> defaut', () => {
  assert.deepEqual(sanitizeLayoutV2(null), createDefaultLayoutV2());
  assert.deepEqual(sanitizeLayoutV2(undefined), createDefaultLayoutV2());
  assert.deepEqual(sanitizeLayoutV2(42), createDefaultLayoutV2());
  assert.deepEqual(sanitizeLayoutV2('foo'), createDefaultLayoutV2());
});

test('sanitizeLayoutV2 : input partiel -> complete avec defauts', () => {
  const out = sanitizeLayoutV2({ zones: { header: { enabled: false, sections: ['resume'] } } });
  assert.equal(out.zones.header.enabled, false);
  assert.equal(out.zones.main.enabled, true);
  assert.equal(out.zones.sidebar.enabled, true);
  // Toutes les sections canoniques sont presentes
  const flat = [...out.zones.header.sections, ...out.zones.main.sections, ...out.zones.sidebar.sections];
  for (const s of CANONICAL_SECTION_KEYS_V2) {
    assert.ok(flat.includes(s), `${s} doit etre re-ajoute`);
  }
});

test('sanitizeLayoutV2 : main.enabled invariant force a true', () => {
  const out = sanitizeLayoutV2({ zones: { main: { enabled: false, sections: ['experiences'] } } });
  assert.equal(out.zones.main.enabled, true);
});

test('sanitizeLayoutV2 : sections inconnues / doublons / non-string', () => {
  const out = sanitizeLayoutV2({
    zones: {
      header: { enabled: true, sections: ['identity', 'unknown', 42, 'resume', 'resume'] },
      main: { enabled: true, sections: ['experiences', 'resume'] }, // doublon resume
      sidebar: { enabled: true, sections: ['competences', 'certifications'] },
    },
  });
  // Premiere occurrence de resume (dans header) gagne -> pas dans main
  assert.ok(out.zones.header.sections.includes('resume'));
  assert.ok(!out.zones.main.sections.includes('resume'));
  // unknown / 42 jetes
  assert.ok(!out.zones.header.sections.includes('unknown'));
  assert.ok(!out.zones.header.sections.includes(42));
});

test('sanitizeLayoutV2 : sidebarRatio clamp + theme default', () => {
  assert.equal(sanitizeLayoutV2({ sidebarRatio: 0 }).sidebarRatio, SIDEBAR_RATIO_MIN);
  assert.equal(sanitizeLayoutV2({ sidebarRatio: 999 }).sidebarRatio, SIDEBAR_RATIO_MAX);
  assert.equal(sanitizeLayoutV2({ sidebarRatio: 'foo' }).sidebarRatio, SIDEBAR_RATIO_DEFAULT);
  assert.equal(sanitizeLayoutV2({ theme: '' }).theme, 'default');
  assert.equal(sanitizeLayoutV2({ theme: 'classy' }).theme, 'classy');
});

test('sanitizeLayoutV2 : sidebarSide fallback', () => {
  assert.equal(sanitizeLayoutV2({ sidebarSide: 'left' }).sidebarSide, 'left');
  assert.equal(sanitizeLayoutV2({ sidebarSide: 'top' }).sidebarSide, 'right');
  assert.equal(sanitizeLayoutV2({}).sidebarSide, 'right');
});

test('isDefaultLayoutV2 : detection juste', () => {
  assert.equal(isDefaultLayoutV2(createDefaultLayoutV2()), true);
  assert.equal(isDefaultLayoutV2({}), true, 'objet vide -> sanitize -> default');
  assert.equal(isDefaultLayoutV2(null), true, 'null -> default');

  const moved = moveSectionToZone(createDefaultLayoutV2(), 'experiences', 'sidebar');
  assert.equal(isDefaultLayoutV2(moved), false);

  const disabled = setZoneEnabled(createDefaultLayoutV2(), 'sidebar', false);
  assert.equal(isDefaultLayoutV2(disabled), false);
});

test('migrateLayoutV1ToV2 : sectionsOrder plat -> zones', () => {
  const v1 = {
    version: 1,
    sectionsOrder: ['resume', 'experiences', 'formations', 'competences', 'certifications', 'projets'],
    sidebarRatio: 35,
    theme: 'default',
  };
  const v2 = migrateLayoutV1ToV2(v1);
  assert.equal(v2.version, LAYOUT_V2_VERSION);
  assert.equal(v2.zones.header.sections[0], 'identity', 'identity injecte au mount');
  assert.ok(v2.zones.header.sections.includes('resume'));
  assert.ok(v2.zones.main.sections.includes('experiences'));
  assert.ok(v2.zones.sidebar.sections.includes('competences'));
});

test('migrateLayoutV1ToV2 : v1 partiel ou null', () => {
  const v2 = migrateLayoutV1ToV2(null);
  assert.deepEqual(v2, createDefaultLayoutV2());

  const partial = migrateLayoutV1ToV2({ sectionsOrder: ['experiences'] });
  // Sections manquantes injectees dans leur zone par defaut
  assert.ok(partial.zones.header.sections.includes('identity'));
  assert.ok(partial.zones.header.sections.includes('resume'));
  assert.ok(partial.zones.main.sections.includes('experiences'));
});

test('migrateLayoutV1ToV2 : ratio + theme propages', () => {
  const v2 = migrateLayoutV1ToV2({ sectionsOrder: [], sidebarRatio: 45, theme: 'classy' });
  assert.equal(v2.sidebarRatio, 45);
  assert.equal(v2.theme, 'classy');
});

test('migrateLayoutV1ToV2 : ratio invalide -> defaut', () => {
  const v2 = migrateLayoutV1ToV2({ sectionsOrder: [], sidebarRatio: 'foo' });
  assert.equal(v2.sidebarRatio, SIDEBAR_RATIO_DEFAULT);
});

test('getZoneOfSection : trouve la zone, sinon null', () => {
  const d = createDefaultLayoutV2();
  assert.equal(getZoneOfSection(d, 'identity'), 'header');
  assert.equal(getZoneOfSection(d, 'experiences'), 'main');
  assert.equal(getZoneOfSection(d, 'competences'), 'sidebar');
  assert.equal(getZoneOfSection(d, 'unknown'), null);
});

test('moveSectionToZone : deplace inter-zones, retire de l ancienne', () => {
  const d = createDefaultLayoutV2();
  const moved = moveSectionToZone(d, 'experiences', 'sidebar');
  assert.equal(getZoneOfSection(moved, 'experiences'), 'sidebar');
  assert.ok(!moved.zones.main.sections.includes('experiences'));
  // Append en fin par defaut
  assert.equal(moved.zones.sidebar.sections.at(-1), 'experiences');
});

test('moveSectionToZone : avec targetIndex', () => {
  const d = createDefaultLayoutV2();
  const moved = moveSectionToZone(d, 'experiences', 'sidebar', 0);
  assert.equal(moved.zones.sidebar.sections[0], 'experiences');
});

test('moveSectionToZone : reorder intra-zone', () => {
  const d = createDefaultLayoutV2(); // main = [experiences, formations, projets]
  const moved = moveSectionToZone(d, 'projets', 'main', 0);
  assert.equal(moved.zones.main.sections[0], 'projets');
  assert.equal(moved.zones.main.sections.length, d.zones.main.sections.length);
});

test('moveSectionToZone : section ou zone inconnue -> no-op', () => {
  const d = createDefaultLayoutV2();
  const a = moveSectionToZone(d, 'unknown', 'sidebar');
  assert.deepEqual(a, d);
  const b = moveSectionToZone(d, 'experiences', 'unknown');
  assert.deepEqual(b, d);
});

test('setZoneEnabled : false sur main -> no-op (invariant)', () => {
  const d = createDefaultLayoutV2();
  const out = setZoneEnabled(d, 'main', false);
  assert.equal(out.zones.main.enabled, true);
});

test('setZoneEnabled : false sur sidebar -> sections migrees vers main', () => {
  const d = createDefaultLayoutV2();
  const sidebarSections = d.zones.sidebar.sections.slice();
  const out = setZoneEnabled(d, 'sidebar', false);
  assert.equal(out.zones.sidebar.enabled, false);
  assert.equal(out.zones.sidebar.sections.length, 0);
  // Les sections sont en fin de main
  for (const s of sidebarSections) {
    assert.ok(out.zones.main.sections.includes(s), `${s} migre vers main`);
  }
});

test('setZoneEnabled : true ne re-distribue pas (le user choisit)', () => {
  const d = createDefaultLayoutV2();
  // Toggle off puis on -> sidebar reste vide
  const off = setZoneEnabled(d, 'sidebar', false);
  const onAgain = setZoneEnabled(off, 'sidebar', true);
  assert.equal(onAgain.zones.sidebar.enabled, true);
  assert.equal(onAgain.zones.sidebar.sections.length, 0);
});

test('setSidebarRatioV2 : clamp', () => {
  const d = createDefaultLayoutV2();
  assert.equal(setSidebarRatioV2(d, 5).sidebarRatio, SIDEBAR_RATIO_MIN);
  assert.equal(setSidebarRatioV2(d, 80).sidebarRatio, SIDEBAR_RATIO_MAX);
  assert.equal(setSidebarRatioV2(d, 40).sidebarRatio, 40);
  assert.equal(setSidebarRatioV2(d, 'x').sidebarRatio, SIDEBAR_RATIO_DEFAULT);
});

test('setSidebarSide : left | right uniquement', () => {
  const d = createDefaultLayoutV2();
  assert.equal(setSidebarSide(d, 'left').sidebarSide, 'left');
  assert.equal(setSidebarSide(d, 'right').sidebarSide, 'right');
  // Invalid -> no-op
  assert.equal(setSidebarSide(d, 'top').sidebarSide, d.sidebarSide);
});

test('resetLayoutV2 : retourne l etat par defaut', () => {
  assert.deepEqual(resetLayoutV2(), createDefaultLayoutV2());
});

test('flattenLayoutV2ToOrder : ordre visuel header -> main -> sidebar', () => {
  const d = createDefaultLayoutV2();
  const flat = flattenLayoutV2ToOrder(d);
  // identity et resume au debut (header)
  assert.equal(flat[0], 'identity');
  // experiences/formations/projets ensuite (main)
  const expIdx = flat.indexOf('experiences');
  const compIdx = flat.indexOf('competences');
  assert.ok(expIdx < compIdx, 'main avant sidebar dans flatten');
});

test('flattenLayoutV2ToOrder : zones desactivees sautees', () => {
  const d = setZoneEnabled(createDefaultLayoutV2(), 'sidebar', false);
  const flat = flattenLayoutV2ToOrder(d);
  // toutes les sections (y compris ex-sidebar) sont dans le flatten via main
  for (const s of CANONICAL_SECTION_KEYS_V2) {
    assert.ok(flat.includes(s), `${s} present dans flatten meme apres toggle off`);
  }
});

test('immutabilite : les helpers ne mutent pas l input', () => {
  const d = createDefaultLayoutV2();
  const before = JSON.stringify(d);
  moveSectionToZone(d, 'experiences', 'sidebar');
  setZoneEnabled(d, 'sidebar', false);
  setSidebarRatioV2(d, 40);
  setSidebarSide(d, 'left');
  assert.equal(JSON.stringify(d), before, 'd ne doit pas avoir change');
});

test('exports : constantes utiles exposees', () => {
  assert.ok(Object.isFrozen(CANONICAL_SECTION_KEYS_V2));
  assert.ok(Object.isFrozen(CANONICAL_ZONE_KEYS));
  assert.ok(Object.isFrozen(SIDEBAR_SIDES));
  assert.equal(SIDEBAR_SIDES.length, 2);
  assert.equal(LAYOUT_V2_VERSION, 2);
});
