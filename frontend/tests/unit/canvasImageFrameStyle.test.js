import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  imageBorderRadiusCss,
  imageFrameBorderStyle,
  imageFrameLayout,
  isCircleImageShape,
} from '../../src/lib/canvasImageFrameStyle.js';

test('imageBorderRadiusCss', () => {
  assert.equal(imageBorderRadiusCss({ shape: 'circle' }), '50%');
  assert.equal(imageBorderRadiusCss({ border_radius_mm: 4 }), '4mm');
  assert.equal(imageBorderRadiusCss({ shape: 'rect' }), '0');
});

test('imageFrameBorderStyle', () => {
  assert.deepEqual(imageFrameBorderStyle({}), {});
  assert.deepEqual(imageFrameBorderStyle({ image_border_width_mm: 0 }), {});
  assert.equal(
    imageFrameBorderStyle({ image_border_width_mm: 1.2, image_border_color: '#ff0000' }).border,
    '1.2mm solid #ff0000',
  );
});

test('imageFrameLayout : cercle centré sur bloc non carré', () => {
  assert.equal(isCircleImageShape({ shape: 'circle' }), true);
  const layout = imageFrameLayout(40, 28, { shape: 'circle' });
  assert.equal(layout.mode, 'circle');
  assert.equal(layout.frameStyle.left, '6mm');
  assert.equal(layout.frameStyle.top, '0mm');
  assert.equal(layout.frameStyle.width, '28mm');
  assert.equal(layout.frameStyle.height, '28mm');
  assert.equal(layout.frameStyle.borderRadius, '50%');
});

test('imageFrameLayout : rectangle inchangé', () => {
  const layout = imageFrameLayout(40, 28, { shape: 'rect', border_radius_mm: 2 });
  assert.equal(layout.mode, 'rect');
  assert.equal(layout.frameStyle, null);
  assert.equal(layout.outerStyle.borderRadius, '2mm');
});
