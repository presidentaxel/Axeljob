import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getBlockPdfFidelity,
  layoutHasNonFaithfulBlocks,
  listNonFaithfulBlocks,
  summarizeNonFaithfulBlocks,
} from '../../src/lib/canvasPdfFidelity.js';

test('getBlockPdfFidelity : blocs principaux standards = ok', () => {
  for (const type of ['identity', 'contact', 'resume', 'experiences', 'skills']) {
    assert.equal(getBlockPdfFidelity({ id: '1', type }).level, 'ok');
  }
});

test('getBlockPdfFidelity : qrcode et formes vectorielles = unsupported', () => {
  assert.equal(getBlockPdfFidelity({ id: 'q', type: 'qrcode' }).level, 'unsupported');
  assert.equal(getBlockPdfFidelity({ id: 'c', type: 'shape:circle' }).level, 'unsupported');
});

test('getBlockPdfFidelity : icône hors whitelist = partial', () => {
  assert.equal(
    getBlockPdfFidelity({ id: 'i', type: 'icon', icon_name: 'HiSparkles' }).level,
    'partial',
  );
  assert.equal(
    getBlockPdfFidelity({ id: 'i', type: 'icon', icon_name: 'HiPhone' }).level,
    'ok',
  );
});

test('listNonFaithfulBlocks et résumé', () => {
  const layout = {
    pages: [{
      blocks: [
        { id: 'a', type: 'identity' },
        { id: 'b', type: 'qrcode' },
        { id: 'c', type: 'experiences', style: { exp_style: 'bold' } },
      ],
    }],
  };
  const issues = listNonFaithfulBlocks(layout, {});
  assert.equal(issues.length, 2);
  assert.equal(layoutHasNonFaithfulBlocks(layout, {}), true);
  assert.match(summarizeNonFaithfulBlocks(issues), /qrcode/);
});
