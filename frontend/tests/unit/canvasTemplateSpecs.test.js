/**
 * Contrat projection Stable → canvas (AXE-346).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STABLE_CANVAS_TEMPLATE_IDS,
  TEMPLATE_CANVAS_FIDELITY,
  buildTemplateBlocks,
  getTemplateCanvasFidelity,
  isStableCanvasTemplateId,
  parseCanvasTheme,
  summarizeTemplateCanvasLayout,
} from '../../src/lib/canvasTemplateSpecs.js';
import { createCanvasLayoutForTemplate } from '../../src/lib/layoutTemplatePresets.js';
import { canBuildCanvasForTemplate } from '../../src/lib/designModeBridge.js';

test('STABLE_CANVAS_TEMPLATE_IDS couvre la matrice de fidélité', () => {
  assert.equal(STABLE_CANVAS_TEMPLATE_IDS.length, 7);
  for (const id of STABLE_CANVAS_TEMPLATE_IDS) {
    assert.ok(TEMPLATE_CANVAS_FIDELITY[id], `fidélité manquante pour ${id}`);
    assert.equal(isStableCanvasTemplateId(id), true);
  }
  assert.equal(isStableCanvasTemplateId('custom_foo'), false);
  assert.equal(isStableCanvasTemplateId('beta'), false);
});

test('chaque template catalogue produit des blocs + theme.template_id', () => {
  for (const id of STABLE_CANVAS_TEMPLATE_IDS) {
    const template = { id, name: id };
    const blocks = buildTemplateBlocks(template);
    const theme = parseCanvasTheme(template);
    assert.ok(blocks.length > 0, `${id}: blocs vides`);
    assert.equal(theme.template_id, id);
    assert.equal(canBuildCanvasForTemplate(template), true);

    const layout = createCanvasLayoutForTemplate(template);
    assert.ok(layout.pages?.[0]?.blocks?.length > 0, `${id}: layout vide`);
    assert.equal(layout.theme?.template_id, id);
  }
});

test('ids inconnus / custom → pas de projection', () => {
  assert.deepEqual(buildTemplateBlocks({ id: 'custom_x' }), []);
  assert.deepEqual(buildTemplateBlocks({ id: 'unknown' }), []);
  assert.equal(canBuildCanvasForTemplate({ id: 'custom_x' }), false);
  assert.equal(getTemplateCanvasFidelity('nope'), null);
});

test('summarizeTemplateCanvasLayout expose readiness + types', () => {
  const summary = summarizeTemplateCanvasLayout({ id: 'minimal' });
  assert.equal(summary.templateId, 'minimal');
  assert.ok(summary.blockCount >= 8);
  assert.ok(summary.blockTypes.identity >= 1);
  assert.ok(summary.blockTypes.experiences >= 1);
  assert.equal(summary.layoutFamily, 'single-column');
  assert.ok(['thin', 'projection', 'near-replica'].includes(summary.readiness));
});

test('minimal n’ajoute plus de barre accent décorative sous le header', () => {
  const blocks = buildTemplateBlocks({ id: 'minimal' });
  const shapes = blocks.filter((b) => b.type === 'shape:rect');
  assert.equal(shapes.length, 0, 'minimal mono-colonne : pas de shape:rect de chrome');
  assert.ok(blocks.some((b) => b.type === 'photo'));
  assert.ok(blocks.some((b) => b.style?.title_style === 'minimal-section'));
});

test('bold reste le plus proche d’une réplique (near-replica)', () => {
  assert.equal(getTemplateCanvasFidelity('bold')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('bold')?.fidelityCss, 'rich');
  const summary = summarizeTemplateCanvasLayout({ id: 'bold' });
  assert.ok(summary.blockCount >= 10);
  assert.ok(summary.zones.includes('header') || summary.zones.includes('sidebar-light'));
});
