import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cloneBlocksForTransfer,
  detectTransferCandidates,
  mergeTransferredBlocks,
  summarizeTransferCandidates,
} from '../../src/lib/canvasLayoutTransfer.js';

const sourceLayout = {
  version: 3,
  grid: 'free',
  pages: [{
    id: 'p1',
    blocks: [
      { id: 'identity', type: 'identity', bind: ['prenom', 'nom'], x: 10, y: 10, w: 80, h: 12, z: 1 },
      { id: 'title-custom', type: 'title', content: 'Portfolio', x: 10, y: 30, w: 80, h: 10, z: 2 },
      { id: 'image-custom', type: 'image', image_src: 'assets/uploads/u/canvas_x.jpg', x: 20, y: 50, w: 30, h: 30, z: 3 },
    ],
  }],
};

const targetTemplateLayout = {
  version: 3,
  grid: 'free',
  pages: [{
    id: 'p1',
    blocks: [
      { id: 'tpl-identity', type: 'identity', bind: ['prenom', 'nom'], x: 20, y: 10, w: 80, h: 12, z: 1 },
    ],
  }],
};

test('detectTransferCandidates garde les elements manuels et ignore les sections deja presentes', () => {
  const candidates = detectTransferCandidates(sourceLayout, targetTemplateLayout);
  assert.deepEqual(candidates.map((item) => item.blockId), ['title-custom', 'image-custom']);
  assert.equal(candidates[0].label, 'Titre · Portfolio');
});

test('cloneBlocksForTransfer regenere les ids et conserve les styles importants', () => {
  const candidates = detectTransferCandidates(sourceLayout, targetTemplateLayout);
  const clones = cloneBlocksForTransfer(candidates, { now: 123, idPrefix: 'test' });
  assert.equal(clones[0].id, 'test_123_0');
  assert.equal(clones[0].content, 'Portfolio');
  assert.equal(clones[1].image_src, 'assets/uploads/u/canvas_x.jpg');
  assert.notEqual(clones[0].id, candidates[0].blockId);
});

test('mergeTransferredBlocks ajoute les clones au layout cible', () => {
  const candidates = detectTransferCandidates(sourceLayout, targetTemplateLayout);
  const merged = mergeTransferredBlocks(targetTemplateLayout, candidates, { now: 456, idPrefix: 'merge' });
  const blocks = merged.pages[0].blocks;
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].id, 'merge_456_0');
  assert.equal(blocks[2].type, 'image');
});

test('summarizeTransferCandidates resume le nombre d elements', () => {
  assert.equal(summarizeTransferCandidates([]), 'Aucun élément transférable');
  assert.equal(summarizeTransferCandidates([{}]), '1 élément transférable');
  assert.equal(summarizeTransferCandidates([{}, {}]), '2 éléments transférables');
});
