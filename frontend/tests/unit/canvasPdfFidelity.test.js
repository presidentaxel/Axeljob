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

test('getBlockPdfFidelity : qrcode = unsupported ; formes exportées = ok', () => {
  assert.equal(getBlockPdfFidelity({ id: 'q', type: 'qrcode' }).level, 'unsupported');
  assert.equal(getBlockPdfFidelity({ id: 'c', type: 'shape:circle' }).level, 'ok');
  assert.equal(getBlockPdfFidelity({ id: 'l', type: 'shape:line' }).level, 'ok');
  assert.equal(getBlockPdfFidelity({ id: 'r', type: 'shape:rect' }).level, 'ok');
});

test('getBlockPdfFidelity : identity divider / photo border = ok (AXE-38)', () => {
  assert.equal(
    getBlockPdfFidelity({ id: '1', type: 'identity', style: { identity_divider: true } }).level,
    'ok',
  );
  assert.equal(
    getBlockPdfFidelity({
      id: '2',
      type: 'photo',
      style: { photo_border: 0.4, image_border_color: '#111' },
    }).level,
    'ok',
  );
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
