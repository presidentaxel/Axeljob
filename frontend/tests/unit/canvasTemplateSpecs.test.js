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
  assert.equal(
    blocks.some((b) => b.type === 'photo'),
    false,
    'minimal Stable force show_photo=false : pas de bloc photo',
  );
  assert.ok(blocks.some((b) => b.style?.title_style === 'minimal-section'));
});

test('minimal réplique Stable : contact inline ·, titres Title Case, exp ATS', () => {
  const blocks = buildTemplateBlocks({ id: 'minimal' });
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const resume = blocks.find((b) => b.type === 'resume');
  const skills = blocks.filter((b) => b.type === 'skills');

  assert.ok(identity);
  assert.equal(identity.x, contact.x, 'identity et contact alignés (pas de décalage photo)');
  assert.equal(identity.style?.lock_geometry, true);
  assert.equal(contact.style?.lock_geometry, true);
  assert.equal(contact.style?.contact_layout, 'header-bar');
  assert.equal(contact.style?.contact_separator, ' · ');
  assert.equal(contact.style?.contact_icons, false);
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);
  assert.ok(contact.y >= identity.y + identity.h - 0.01, 'contact sous identity sans overlap');

  assert.equal(resume.style?.section_label, 'Profil');
  assert.equal(experiences.style?.section_label, 'Expérience professionnelle');
  assert.equal(experiences.style?.exp_style, 'minimal');
  assert.equal(formations.style?.formation_style, 'minimal');
  assert.equal(skills.length, 1, 'un seul bloc Compétences (Outils nestés)');
  assert.equal(skills[0].style?.skills_nested_outils, true);
  assert.equal(skills[0].style?.list_format, 'inline');

  const uppercaseTitles = blocks.filter(
    (b) => typeof b.style?.section_label === 'string' && b.style.section_label === b.style.section_label.toUpperCase()
      && /[A-ZÀ-Ü]/.test(b.style.section_label),
  );
  assert.equal(uppercaseTitles.length, 0, 'titres Title Case comme Stable HTML, pas UPPERCASE');

  const layout = createCanvasLayoutForTemplate({ id: 'minimal' });
  assert.equal(layout.freeform, true, 'minimal freeform pour préserver la géométrie Stable');
});

test('bold reste le plus proche d’une réplique (near-replica)', () => {
  assert.equal(getTemplateCanvasFidelity('bold')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('bold')?.fidelityCss, 'rich');
  const summary = summarizeTemplateCanvasLayout({ id: 'bold' });
  assert.ok(summary.blockCount >= 10);
  assert.ok(summary.zones.includes('header') || summary.zones.includes('sidebar-light'));
});

test('minimal fidelity CSS marquée rich (twin page 1)', () => {
  assert.equal(getTemplateCanvasFidelity('minimal')?.fidelityCss, 'rich');
});
