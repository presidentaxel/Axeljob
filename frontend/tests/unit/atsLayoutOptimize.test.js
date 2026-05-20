import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarterLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import { applyAtsLayoutOptimizations } from '../../src/lib/atsLayoutOptimize.js';

test('reordonne les blocs semantiques par type', () => {
  const layout = createStarterLayoutV3();
  const page = layout.pages[0];
  const blocks = page.blocks;
  if (blocks.length >= 2) {
    const swapped = [...blocks];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    layout.pages[0] = { ...page, blocks: swapped };
  }
  const next = applyAtsLayoutOptimizations(layout);
  const types = next.pages[0].blocks.map((b) => b.type);
  const identityIdx = types.indexOf('identity');
  const contactIdx = types.indexOf('contact');
  if (identityIdx >= 0 && contactIdx >= 0) {
    assert.ok(identityIdx < contactIdx);
  }
});
