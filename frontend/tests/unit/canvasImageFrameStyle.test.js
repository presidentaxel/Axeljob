import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  imageBorderRadiusCss,
  imageFrameBorderStyle,
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
