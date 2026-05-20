/**
 * Tests unitaires du modele de mise en page v3 (`lib/cvLayoutModelV3.js`).
 *
 * Couverture :
 *  - constantes (version, dimensions A4, listes de types)
 *  - sanitizeBlock : clamps, type valide, id auto, bind vs content
 *  - createBlankLayoutV3 / createStarterLayoutV3 : forme canonique
 *  - sanitizeLayoutV3 : tolerance defensive
 *  - findBlock / listAllBlocks / isEmptyLayoutV3
 *  - addBlockToPage / removeBlock / updateBlock
 *  - setBlockPosition / setBlockSize / moveBlockBy
 *  - bringToFront / sendToBack / updateBlockStyle
 *  - appendBlankPage / removePage
 *  - updateTheme
 *  - detectLayoutVersion / migrateLayoutToV3
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_BLOCK_TYPES,
  BLOCK_MIN_HEIGHT_MM,
  BLOCK_MIN_WIDTH_MM,
  LAYOUT_V3_VERSION,
  NON_SEMANTIC_BLOCK_TYPES,
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  PAGE_WIDTH_MM,
  SEMANTIC_BLOCK_TYPES,
  addBlockToPage,
  appendBlankPage,
  bringToFront,
  createBlankLayoutV3,
  createStarterLayoutV3,
  detectLayoutVersion,
  findBlock,
  isEmptyLayoutV3,
  isLayoutV3Shape,
  isAutoHeightBlockType,
  isNonSemanticBlockType,
  isSemanticBlockType,
  listAllBlocks,
  migrateLayoutToV3,
  moveBlockBy,
  removeBlock,
  removePage,
  sanitizeBlock,
  sanitizeLayoutV3,
  sendToBack,
  setBlockPosition,
  setBlockSize,
  updateBlock,
  updateBlockStyle,
  updateTheme,
} from '../../src/lib/cvLayoutModelV3.js';

// Helpers deterministes pour la generation d ids (snapshots stables)
let counter = 0;
const idHelpers = {
  nowFn: () => 1700000000000,
  randFn: () => {
    counter += 1;
    return (counter * 0.0123) % 1;
  },
};
const resetCounter = () => { counter = 0; };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

test('Constantes : version 3, A4 = 210x297 mm', () => {
  assert.equal(LAYOUT_V3_VERSION, 3);
  assert.equal(PAGE_WIDTH_MM, 210);
  assert.equal(PAGE_HEIGHT_MM, 297);
  assert.equal(PAGE_MARGIN_MM, 10);
  assert.equal(PAGE_USABLE_WIDTH_MM, 190);
});

test('Types semantiques vs non semantiques : disjoints + couverts par ALL', () => {
  const sSet = new Set(SEMANTIC_BLOCK_TYPES);
  const nSet = new Set(NON_SEMANTIC_BLOCK_TYPES);
  for (const t of SEMANTIC_BLOCK_TYPES) assert.ok(!nSet.has(t));
  for (const t of NON_SEMANTIC_BLOCK_TYPES) assert.ok(!sSet.has(t));
  for (const t of ALL_BLOCK_TYPES) {
    assert.ok(sSet.has(t) || nSet.has(t));
  }
});

test('isSemanticBlockType / isNonSemanticBlockType', () => {
  assert.ok(isSemanticBlockType('experiences'));
  assert.ok(!isSemanticBlockType('text'));
  assert.ok(isNonSemanticBlockType('text'));
  assert.ok(!isNonSemanticBlockType('experiences'));
  assert.ok(!isSemanticBlockType('inconnu'));
  assert.ok(!isNonSemanticBlockType('inconnu'));
});

test('isAutoHeightBlockType : texte sémantique sauf photo', () => {
  assert.ok(isAutoHeightBlockType('experiences'));
  assert.ok(isAutoHeightBlockType('text'));
  assert.ok(!isAutoHeightBlockType('photo'));
  assert.ok(!isAutoHeightBlockType('shape:rect'));
});

// ---------------------------------------------------------------------------
// sanitizeBlock
// ---------------------------------------------------------------------------

test('sanitizeBlock : null / undefined / non-objet -> null', () => {
  assert.equal(sanitizeBlock(null), null);
  assert.equal(sanitizeBlock(undefined), null);
  assert.equal(sanitizeBlock(42), null);
  assert.equal(sanitizeBlock('foo'), null);
});

test('sanitizeBlock : type manquant ou inconnu -> null', () => {
  assert.equal(sanitizeBlock({}), null);
  assert.equal(sanitizeBlock({ type: 'inconnu', x: 0, y: 0, w: 10, h: 10 }), null);
});

test('sanitizeBlock : bloc semantique minimal valide', () => {
  resetCounter();
  const b = sanitizeBlock({ type: 'experiences', x: 10, y: 20, w: 100, h: 40 }, { idHelpers });
  assert.ok(b);
  assert.equal(b.type, 'experiences');
  assert.equal(b.x, 10);
  assert.equal(b.y, 20);
  assert.equal(b.w, 100);
  assert.equal(b.h, 40);
  assert.equal(b.z, 1);
  assert.deepEqual(b.style, {});
  assert.ok(b.id.startsWith('blk_'));
});

test('sanitizeBlock : bloc non semantique (text) preserve content', () => {
  const b = sanitizeBlock({ type: 'text', content: 'Disponible des septembre', x: 10, y: 10, w: 50, h: 5 });
  assert.equal(b.type, 'text');
  assert.equal(b.content, 'Disponible des septembre');
});

test('sanitizeBlock : clamp x/y/w/h aux limites de page', () => {
  // w > page -> clampe a PAGE_WIDTH
  const b1 = sanitizeBlock({ type: 'text', x: 0, y: 0, w: 9999, h: 9999 });
  assert.equal(b1.w, PAGE_WIDTH_MM);
  assert.equal(b1.h, PAGE_HEIGHT_MM);
  // x trop grand -> clampe pour rester dans la page
  const b2 = sanitizeBlock({ type: 'text', x: 9999, y: 9999, w: 50, h: 20 });
  assert.equal(b2.x, PAGE_WIDTH_MM - 50);
  assert.equal(b2.y, PAGE_HEIGHT_MM - 20);
});

test('sanitizeBlock : w/h trop petits -> minimums', () => {
  const b = sanitizeBlock({ type: 'text', x: 10, y: 10, w: 0.1, h: 0.1 });
  assert.equal(b.w, BLOCK_MIN_WIDTH_MM);
  assert.equal(b.h, BLOCK_MIN_HEIGHT_MM);
});

test('sanitizeBlock : valeurs non numeriques tombent sur defauts', () => {
  const b = sanitizeBlock({ type: 'text', x: 'abc', y: NaN, w: undefined, h: null });
  assert.equal(b.x, PAGE_MARGIN_MM);
  assert.equal(b.y, PAGE_MARGIN_MM);
  assert.equal(b.w, BLOCK_MIN_WIDTH_MM);
  assert.equal(b.h, BLOCK_MIN_HEIGHT_MM);
});

test('sanitizeBlock : z = 0 autorise, z negatif -> 1', () => {
  assert.equal(sanitizeBlock({ type: 'text', x: 0, y: 0, w: 10, h: 10, z: 0 }).z, 0);
  assert.equal(sanitizeBlock({ type: 'text', x: 0, y: 0, w: 10, h: 10, z: -5 }).z, 1);
  assert.equal(sanitizeBlock({ type: 'text', x: 0, y: 0, w: 10, h: 10, z: 1.7 }).z, 1);
});

test('sanitizeBlock : bind tableau pour identity', () => {
  const b = sanitizeBlock({ type: 'identity', bind: ['prenom', 'nom'], x: 0, y: 0, w: 100, h: 20 });
  assert.deepEqual(b.bind, ['prenom', 'nom']);
});

test('sanitizeBlock : preserve icon_name pour icon, target_url pour qrcode', () => {
  const icon = sanitizeBlock({ type: 'icon', icon_name: 'HiPhone', x: 0, y: 0, w: 10, h: 10 });
  assert.equal(icon.icon_name, 'HiPhone');
  const qr = sanitizeBlock({ type: 'qrcode', target_url: 'https://example.com', x: 0, y: 0, w: 30, h: 30 });
  assert.equal(qr.target_url, 'https://example.com');
});

test('sanitizeBlock : id existant preserve', () => {
  const b = sanitizeBlock({ id: 'blk_custom', type: 'text', x: 0, y: 0, w: 10, h: 10 });
  assert.equal(b.id, 'blk_custom');
});

// ---------------------------------------------------------------------------
// createBlankLayoutV3
// ---------------------------------------------------------------------------

test('createBlankLayoutV3 : forme canonique', () => {
  const l = createBlankLayoutV3({ idHelpers });
  assert.equal(l.version, 3);
  assert.equal(l.format, 'A4');
  assert.equal(l.grid, 'free');
  assert.equal(l.unit, 'mm');
  assert.equal(l.pages.length, 1);
  assert.equal(l.pages[0].blocks.length, 0);
  assert.ok(typeof l.theme.font_heading === 'string');
});

// ---------------------------------------------------------------------------
// createStarterLayoutV3
// ---------------------------------------------------------------------------

test('createStarterLayoutV3 : 6 blocs semantiques de base', () => {
  const l = createStarterLayoutV3({ idHelpers });
  assert.equal(l.version, 3);
  assert.equal(l.pages.length, 1);
  const blocks = l.pages[0].blocks;
  assert.equal(blocks.length, 6);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['identity', 'contact', 'resume', 'experiences', 'formations', 'skills'],
  );
  // Tous les blocs ont des coords valides dans la page
  for (const b of blocks) {
    assert.ok(b.x >= 0 && b.x + b.w <= PAGE_WIDTH_MM);
    assert.ok(b.y >= 0 && b.y + b.h <= PAGE_HEIGHT_MM);
  }
});

// ---------------------------------------------------------------------------
// sanitizeLayoutV3
// ---------------------------------------------------------------------------

test('sanitizeLayoutV3 : input vide -> layout vide avec 1 page', () => {
  const l = sanitizeLayoutV3({});
  assert.equal(l.version, 3);
  assert.equal(l.pages.length, 1);
  assert.equal(l.pages[0].blocks.length, 0);
});

test('sanitizeLayoutV3 : filtre les blocs invalides', () => {
  const l = sanitizeLayoutV3({
    pages: [{ blocks: [
      { type: 'text', x: 0, y: 0, w: 10, h: 5, content: 'ok' },
      { type: 'inconnu', x: 0, y: 0, w: 10, h: 10 },
      null,
      'not-an-object',
    ] }],
  });
  assert.equal(l.pages[0].blocks.length, 1);
  assert.equal(l.pages[0].blocks[0].type, 'text');
});

test('sanitizeLayoutV3 : input null -> au moins 1 page vide', () => {
  const l = sanitizeLayoutV3(null);
  assert.equal(l.pages.length, 1);
});

test('sanitizeLayoutV3 : merge le theme avec defaut', () => {
  const l = sanitizeLayoutV3({ theme: { color_accent: '#abc123' } });
  assert.equal(l.theme.color_accent, '#abc123');
  assert.ok(typeof l.theme.font_heading === 'string'); // defaut conserve
});

// ---------------------------------------------------------------------------
// findBlock / listAllBlocks / isEmptyLayoutV3
// ---------------------------------------------------------------------------

test('findBlock : retourne pageIndex + blockIndex + block', () => {
  const l = createStarterLayoutV3({ idHelpers });
  const id = l.pages[0].blocks[2].id;
  const found = findBlock(l, id);
  assert.ok(found);
  assert.equal(found.pageIndex, 0);
  assert.equal(found.blockIndex, 2);
  assert.equal(found.block.id, id);
});

test('findBlock : null si introuvable', () => {
  const l = createStarterLayoutV3({ idHelpers });
  assert.equal(findBlock(l, 'pas_la'), null);
  assert.equal(findBlock(null, 'x'), null);
});

test('listAllBlocks : ordre preserve toutes pages', () => {
  let l = createStarterLayoutV3({ idHelpers });
  l = appendBlankPage(l, { idHelpers });
  l = addBlockToPage(l, 1, { type: 'text', x: 10, y: 10, w: 50, h: 10, content: 'p2' }, { idHelpers });
  const all = listAllBlocks(l);
  assert.equal(all.length, 7);
  assert.equal(all[6].content, 'p2');
});

test('isEmptyLayoutV3 : true sur blank, false sur starter', () => {
  assert.equal(isEmptyLayoutV3(createBlankLayoutV3({ idHelpers })), true);
  assert.equal(isEmptyLayoutV3(createStarterLayoutV3({ idHelpers })), false);
  assert.equal(isEmptyLayoutV3(null), true);
});

// ---------------------------------------------------------------------------
// addBlockToPage / removeBlock / updateBlock
// ---------------------------------------------------------------------------

test('addBlockToPage : ajoute en queue, retourne nouveau layout', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  const l1 = addBlockToPage(l0, 0, { type: 'text', x: 10, y: 10, w: 50, h: 10, content: 'hello' }, { idHelpers });
  assert.notEqual(l0, l1); // immuabilite
  assert.equal(l0.pages[0].blocks.length, 0);
  assert.equal(l1.pages[0].blocks.length, 1);
  assert.equal(l1.pages[0].blocks[0].content, 'hello');
});

test('addBlockToPage : pageIndex invalide -> no-op', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  const l1 = addBlockToPage(l0, 99, { type: 'text', x: 10, y: 10, w: 50, h: 10, content: 'x' });
  assert.equal(l0, l1);
});

test('addBlockToPage : bloc invalide -> no-op', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  const l1 = addBlockToPage(l0, 0, { type: 'inconnu' });
  assert.equal(l0, l1);
});

test('removeBlock : retire par id, no-op si introuvable', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const id = l0.pages[0].blocks[1].id;
  const l1 = removeBlock(l0, id);
  assert.equal(l1.pages[0].blocks.length, 5);
  assert.equal(findBlock(l1, id), null);
  // no-op sur id inconnu
  const l2 = removeBlock(l1, 'fantome');
  assert.equal(l2, l1);
});

test('updateBlock : merge superficiel + style merge', () => {
  // On part d un bloc de taille raisonnable (w=50) pour que x=50 ne soit
  // pas clampe par sanitizeBlock (PAGE_WIDTH=210, donc x_max=160).
  let l = createBlankLayoutV3({ idHelpers });
  l = addBlockToPage(l, 0, {
    type: 'identity',
    bind: ['prenom', 'nom'],
    x: 10, y: 10, w: 50, h: 20, z: 1,
    style: { align: 'left' },
  }, { idHelpers });
  const id = l.pages[0].blocks[0].id;
  const l1 = updateBlock(l, id, { x: 50, style: { color: 'red' } });
  const updated = findBlock(l1, id).block;
  assert.equal(updated.x, 50);
  assert.equal(updated.style.color, 'red');
  assert.equal(updated.style.align, 'left');
});

// ---------------------------------------------------------------------------
// Position / size / move
// ---------------------------------------------------------------------------

test('setBlockPosition : applique x/y avec clamp', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const id = l0.pages[0].blocks[0].id;
  const l1 = setBlockPosition(l0, id, { x: 9999, y: -50 });
  const b = findBlock(l1, id).block;
  assert.equal(b.y, 0);
  assert.equal(b.x, PAGE_WIDTH_MM - b.w);
});

test('setBlockSize : applique w/h avec clamp min', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const id = l0.pages[0].blocks[0].id;
  const l1 = setBlockSize(l0, id, { w: 0.001, h: 0.001 });
  const b = findBlock(l1, id).block;
  assert.equal(b.w, BLOCK_MIN_WIDTH_MM);
  assert.equal(b.h, BLOCK_MIN_HEIGHT_MM);
});

test('moveBlockBy : deplacement relatif', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const id = l0.pages[0].blocks[0].id;
  const ox = l0.pages[0].blocks[0].x;
  const oy = l0.pages[0].blocks[0].y;
  const l1 = moveBlockBy(l0, id, { dx: 5, dy: 3 });
  const b = findBlock(l1, id).block;
  assert.equal(b.x, ox + 5);
  assert.equal(b.y, oy + 3);
});

test('moveBlockBy : id inconnu -> no-op', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const l1 = moveBlockBy(l0, 'fantome', { dx: 10, dy: 10 });
  assert.equal(l0, l1);
});

// ---------------------------------------------------------------------------
// z-index
// ---------------------------------------------------------------------------

test('bringToFront : z = max + 1', () => {
  let l = createBlankLayoutV3({ idHelpers });
  l = addBlockToPage(l, 0, { type: 'text', x: 0, y: 0, w: 10, h: 10, content: 'A', z: 1 }, { idHelpers });
  l = addBlockToPage(l, 0, { type: 'text', x: 0, y: 0, w: 10, h: 10, content: 'B', z: 5 }, { idHelpers });
  const idA = l.pages[0].blocks[0].id;
  l = bringToFront(l, idA);
  assert.equal(findBlock(l, idA).block.z, 6);
});

test('sendToBack : z = min - 1 (jamais < 0)', () => {
  let l = createBlankLayoutV3({ idHelpers });
  l = addBlockToPage(l, 0, { type: 'text', x: 0, y: 0, w: 10, h: 10, content: 'A', z: 5 }, { idHelpers });
  l = addBlockToPage(l, 0, { type: 'text', x: 0, y: 0, w: 10, h: 10, content: 'B', z: 1 }, { idHelpers });
  const idA = l.pages[0].blocks[0].id;
  l = sendToBack(l, idA);
  assert.equal(findBlock(l, idA).block.z, 0);
  // Encore sendToBack -> reste a 0
  l = sendToBack(l, idA);
  assert.equal(findBlock(l, idA).block.z, 0);
});

test('updateBlockStyle : merge dans style', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const id = l0.pages[0].blocks[3].id; // experiences
  const l1 = updateBlockStyle(l0, id, { color: 'blue' });
  const b = findBlock(l1, id).block;
  assert.equal(b.style.color, 'blue');
  assert.equal(b.style.format, 'compact'); // ancien preserve
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

test('appendBlankPage : ajoute page vide', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const l1 = appendBlankPage(l0, { idHelpers });
  assert.equal(l1.pages.length, 2);
  assert.equal(l1.pages[1].blocks.length, 0);
});

test('removePage : preserve au moins une page', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  const l1 = removePage(l0, 0);
  assert.equal(l1, l0); // no-op (1 seule page)
  const l2 = appendBlankPage(l0, { idHelpers });
  const l3 = removePage(l2, 1);
  assert.equal(l3.pages.length, 1);
});

// ---------------------------------------------------------------------------
// updateTheme
// ---------------------------------------------------------------------------

test('updateTheme : merge superficiel', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  const l1 = updateTheme(l0, { color_accent: '#ff0000' });
  assert.equal(l1.theme.color_accent, '#ff0000');
  assert.equal(l1.theme.font_heading, 'Inter');
});

test('updateTheme : patch invalide -> no-op', () => {
  const l0 = createBlankLayoutV3({ idHelpers });
  assert.equal(updateTheme(l0, null), l0);
  assert.equal(updateTheme(l0, 'bad'), l0);
});

// ---------------------------------------------------------------------------
// detectLayoutVersion / migrateLayoutToV3
// ---------------------------------------------------------------------------

test('detectLayoutVersion : v3 / v2 / v1 / inconnu', () => {
  assert.equal(detectLayoutVersion({ version: 3, pages: [] }), 3);
  assert.equal(detectLayoutVersion({ pages: [{ blocks: [] }] }), 3);
  assert.equal(detectLayoutVersion({ version: 2, zones: {} }), 2);
  assert.equal(detectLayoutVersion({ zones: { header: {}, main: {}, sidebar: {} } }), 2);
  assert.equal(detectLayoutVersion({ sectionsOrder: ['experiences'] }), 1);
  assert.equal(detectLayoutVersion(null), 0);
  assert.equal(detectLayoutVersion('foo'), 0);
});

test('migrateLayoutToV3 : depuis v3 = sanitize identite (idempotent)', () => {
  const l0 = createStarterLayoutV3({ idHelpers });
  const l1 = migrateLayoutToV3(l0, { idHelpers });
  assert.equal(l1.version, 3);
  assert.equal(l1.pages.length, 1);
  assert.equal(l1.pages[0].blocks.length, 6);
});

test('migrateLayoutToV3 : depuis v2 -> starter (conserve theme)', () => {
  const v2 = {
    version: 2,
    zones: {
      header: { enabled: true, sections: ['identity'] },
      main: { enabled: true, sections: ['experiences'] },
      sidebar: { enabled: true, sections: [] },
    },
    sidebarRatio: 35,
    sidebarSide: 'right',
    theme: { color_accent: '#abcdef' },
  };
  const out = migrateLayoutToV3(v2, { idHelpers });
  assert.equal(out.version, 3);
  assert.equal(out.theme.color_accent, '#abcdef');
  assert.ok(out.pages[0].blocks.length > 0);
});

test('migrateLayoutToV3 : depuis v1 -> starter', () => {
  const v1 = { sectionsOrder: ['identity', 'experiences'], sidebarRatio: 30, theme: 'default' };
  const out = migrateLayoutToV3(v1, { idHelpers });
  assert.equal(out.version, 3);
});

test('migrateLayoutToV3 : input null/undefined -> starter', () => {
  const out = migrateLayoutToV3(null, { idHelpers });
  assert.equal(out.version, 3);
  assert.ok(out.pages[0].blocks.length > 0);
});

// ---------------------------------------------------------------------------
// isLayoutV3Shape
// ---------------------------------------------------------------------------

test('isLayoutV3Shape : detect via pages OU version OU grid', () => {
  assert.ok(isLayoutV3Shape({ version: 3 }));
  assert.ok(isLayoutV3Shape({ pages: [] }));
  assert.ok(isLayoutV3Shape({ grid: 'free' }));
  assert.ok(!isLayoutV3Shape(null));
  assert.ok(!isLayoutV3Shape({ zones: {} }));
});
