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

test('garde les bandeaux decoratifs derriere le contenu', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'title', type: 'title', content: 'Titre', x: 10, y: 10, w: 80, h: 10, z: 1, style: {} },
        { id: 'banner', type: 'shape:rect', x: 0, y: 0, w: 210, h: 40, z: 99, style: { color: '#1e293b' } },
        { id: 'resume', type: 'resume', bind: 'resume', x: 10, y: 24, w: 180, h: 20, z: 2, style: {} },
      ],
    }],
  };

  const next = applyAtsLayoutOptimizations(layout);
  const blocks = next.pages[0].blocks;
  const banner = blocks.find((b) => b.id === 'banner');
  const title = blocks.find((b) => b.id === 'title');
  const resume = blocks.find((b) => b.id === 'resume');

  assert.ok(banner.z < title.z);
  assert.ok(banner.z < resume.z);
});
