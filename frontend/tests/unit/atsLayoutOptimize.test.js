import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarterLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  applyAtsLayoutOptimizations,
  describeAtsOptimizationChanges,
  optimizeLayoutSpatialOrder,
} from '../../src/lib/atsLayoutOptimize.js';

test('reordonne les blocs semantiques par type (z)', () => {
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

test('optimisation spatiale empile identity avant experiences (y)', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'exp', type: 'experiences', x: 10, y: 10, w: 180, h: 40, z: 2, style: {} },
        { id: 'id', type: 'identity', x: 10, y: 80, w: 180, h: 20, z: 1, style: {} },
        { id: 'banner', type: 'shape:rect', x: 0, y: 0, w: 210, h: 12, z: 99, style: {} },
      ],
    }],
  };
  const next = optimizeLayoutSpatialOrder(layout);
  const identity = next.pages[0].blocks.find((b) => b.id === 'id');
  const experiences = next.pages[0].blocks.find((b) => b.id === 'exp');
  const banner = next.pages[0].blocks.find((b) => b.id === 'banner');
  assert.ok(identity.y < experiences.y);
  assert.equal(banner.y, 0);
});

test('applyAtsLayoutOptimizations remonte contact + ordre spatial', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'page-1',
      blocks: [
        { id: 'exp', type: 'experiences', x: 10, y: 20, w: 180, h: 50, z: 1, style: {} },
        { id: 'contact', type: 'contact', x: 10, y: 200, w: 180, h: 10, z: 2, style: {} },
        { id: 'id', type: 'identity', x: 10, y: 120, w: 180, h: 20, z: 3, style: {} },
      ],
    }],
  };
  const next = applyAtsLayoutOptimizations(layout);
  const byType = Object.fromEntries(next.pages[0].blocks.map((b) => [b.type, b]));
  assert.ok(byType.identity.y < byType.contact.y);
  assert.ok(byType.contact.y < byType.experiences.y);
});

test('describeAtsOptimizationChanges liste les deplacements y', () => {
  const before = {
    version: 3,
    grid: 'free',
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'identity', x: 10, y: 80, w: 100, h: 20, z: 1 },
        { id: 'b', type: 'contact', x: 10, y: 10, w: 100, h: 10, z: 2 },
      ],
    }],
  };
  const after = optimizeLayoutSpatialOrder(before);
  const changes = describeAtsOptimizationChanges(before, after);
  assert.ok(changes.length >= 1);
  assert.ok(changes.some((c) => c.id === 'a' || c.id === 'b'));
});
