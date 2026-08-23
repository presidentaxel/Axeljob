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
  assert.equal(contact.style?.align, 'left', 'Minimal : contact à gauche (pas center Élégant)');
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

test('bold réplique Stable : header Impact + freeform + cascade', () => {
  const blocks = buildTemplateBlocks({ id: 'bold' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const resume = blocks.find((b) => b.type === 'resume');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const shapes = blocks.filter((b) => b.type === 'shape:rect');

  assert.ok(photo && identity && contact && resume);
  assert.equal(photo.style?.photo_border, 'accent-thick');
  assert.equal(photo.style?.lock_geometry, true);
  assert.equal(identity.style?.header_layout, 'inline-title');
  assert.equal(identity.style?.title_accent, true);
  assert.equal(identity.style?.lock_geometry, true);
  assert.notEqual(identity.style?.bold, true, 'pas de bold inline 700 (twin CSS 800)');
  assert.equal(resume.style?.show_section_title, false, 'pas de titre Profil dans le header');
  assert.equal(resume.style?.lock_geometry, true);
  assert.equal(contact.style?.contact_layout, 'header-bar');
  assert.equal(contact.style?.align, 'center');
  assert.equal(contact.style?.contact_uppercase, true);
  assert.equal(contact.style?.lock_geometry, true);
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);
  assert.ok(resume.y > identity.y, 'résumé sous identity');
  assert.ok(contact.y > resume.y, 'contact sous résumé');
  assert.equal(experiences.style?.exp_style, 'bold');
  assert.equal(experiences.style?.title_style, 'bold-main');
  assert.equal(formations.style?.formation_style, 'minimal');
  assert.ok(shapes.length >= 3, 'header + barre accent + sidebar');

  const theme = parseCanvasTheme({ id: 'bold' });
  assert.match(theme.font_heading, /Plus Jakarta Sans/);
  assert.equal(theme.color_section_title, '#1e293b');
  assert.equal(theme.color_accent, '#dc2626');

  const layout = createCanvasLayoutForTemplate({ id: 'bold' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('bold')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('bold')?.fidelityCss, 'rich');
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

test('elegant réplique Stable : header centré + photo, chips, freeform', () => {
  const blocks = buildTemplateBlocks({ id: 'elegant' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const skills = blocks.filter((b) => b.type === 'skills');
  const shapes = blocks.filter((b) => b.type === 'shape:rect');

  assert.ok(photo, 'elegant Stable show_photo=true : bloc photo');
  assert.equal(photo.style?.lock_geometry, true);
  assert.equal(photo.style?.photo_border, 'accent-thin');
  assert.ok(Math.abs(photo.x + photo.w / 2 - 105) < 0.5, 'photo centrée A4');

  assert.equal(identity.style?.align, 'center');
  assert.equal(identity.style?.identity_layout, 'elegant-header');
  assert.ok(identity.y >= photo.y + photo.h - 0.01, 'identity sous photo');

  assert.equal(contact.style?.contact_layout, 'header-bar');
  assert.equal(contact.style?.contact_separator, '·');
  assert.equal(contact.style?.align, 'center');
  assert.ok(contact.y >= identity.y + identity.h - 0.01, 'contact sous identity');
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);

  assert.equal(experiences.style?.exp_style, 'elegant');
  assert.equal(experiences.style?.section_label, 'Expérience professionnelle');
  assert.equal(formations.style?.formation_style, 'minimal');

  assert.equal(skills.length, 1, 'un seul bloc Compétences (outils nestés en chips)');
  assert.equal(skills[0].style?.format, 'chips');
  assert.equal(skills[0].style?.skills_nested_outils, true);

  assert.equal(shapes.length, 1, 'filet header uniquement');
  assert.ok(blocks.every((b) => b.type !== 'skills' || b.style?.section_label !== 'OUTILS'));

  const layout = createCanvasLayoutForTemplate({ id: 'elegant' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('elegant')?.fidelityCss, 'rich');
  assert.equal(getTemplateCanvasFidelity('elegant')?.readiness, 'near-replica');
});

test('modern réplique Stable : sidebar gauche + main PROFIL/EXP/FORMATION', () => {
  const blocks = buildTemplateBlocks({ id: 'modern' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const resume = blocks.find((b) => b.type === 'resume');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const projets = blocks.find((b) => b.type === 'projets');
  const sidebarSkills = blocks.filter((b) => b.type === 'skills' && b.style?.zone === 'sidebar');
  const shapes = blocks.filter((b) => b.type === 'shape:rect');

  assert.ok(photo && identity && contact && resume && experiences);
  assert.equal(photo.style?.zone, 'sidebar');
  assert.equal(photo.style?.photo_border, 'light');
  assert.equal(photo.style?.lock_geometry, true);
  assert.ok(photo.w > 18 && photo.w < 24, 'photo ~80px');
  assert.ok(photo.x > 0, 'photo centrée dans la sidebar');

  assert.equal(identity.style?.zone, 'sidebar');
  assert.equal(identity.style?.align, 'center');
  assert.equal(identity.style?.identity_layout, 'modern-sidebar');
  assert.equal(identity.style?.identity_divider, true);
  assert.equal(identity.style?.lock_geometry, true);
  assert.ok(identity.y > photo.y, 'identity sous photo');

  assert.equal(contact.style?.section_label, 'CONTACT');
  assert.equal(contact.style?.title_style, 'modern-sidebar');
  assert.equal(contact.style?.align, 'left');
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);
  assert.ok(contact.y > identity.y, 'contact sous identity');
  assert.ok(contact.x < 60, 'contact en sidebar gauche');

  assert.equal(resume.style?.zone, 'main');
  assert.equal(resume.style?.section_label, 'PROFIL');
  assert.equal(resume.style?.title_style, 'modern-main');
  assert.equal(resume.style?.font_style, 'italic');
  assert.equal(resume.style?.align, 'justify');
  assert.ok(resume.x > 50, 'profil en main (droite)');

  assert.equal(experiences.style?.exp_style, 'modern');
  assert.equal(experiences.style?.title_style, 'modern-main');
  assert.equal(experiences.style?.section_label, 'EXPÉRIENCE PROFESSIONNELLE');
  assert.equal(formations.style?.formation_style, 'minimal');
  assert.equal(formations.style?.section_label, 'FORMATION');
  assert.ok(projets, 'projets en main');
  assert.equal(projets.style?.section_label, 'PROJETS');

  assert.ok(sidebarSkills.length >= 3, 'COMPÉTENCES / OUTILS / AUTRES');
  assert.ok(sidebarSkills.every((b) => b.x < 60), 'skills sidebar gauche');
  assert.ok(
    sidebarSkills.some((b) => b.style?.section_label === 'COMPÉTENCES'),
    'label COMPÉTENCES',
  );
  assert.ok(sidebarSkills.some((b) => b.style?.section_label === 'OUTILS'), 'label OUTILS');
  assert.equal(shapes.length, 1, 'bandeau sidebar uniquement');

  const theme = parseCanvasTheme({ id: 'modern' });
  assert.match(theme.font_heading, /Inter/);
  assert.equal(theme.color_sidebar, '#2d3748');
  assert.equal(theme.color_accent, '#3182ce');
  assert.equal(theme.color_section_title, '#3182ce');

  const layout = createCanvasLayoutForTemplate({ id: 'modern' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('modern')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('modern')?.fidelityCss, 'rich');
});

test('creative réplique Stable : sidebar indigo + accent ambre + freeform', () => {
  const blocks = buildTemplateBlocks({ id: 'creative' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const resume = blocks.find((b) => b.type === 'resume');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const projets = blocks.find((b) => b.type === 'projets');
  const sidebarSkills = blocks.filter((b) => b.type === 'skills' && b.style?.zone === 'sidebar');
  const shapes = blocks.filter((b) => b.type === 'shape:rect');

  assert.ok(photo && identity && contact && resume && experiences);
  assert.equal(photo.style?.zone, 'sidebar');
  assert.equal(photo.style?.photo_border, 'accent');
  assert.equal(photo.style?.lock_geometry, true);
  assert.ok(photo.w > 18 && photo.w < 24, 'photo ~80px');

  assert.equal(identity.style?.zone, 'sidebar');
  assert.equal(identity.style?.align, 'center');
  assert.equal(identity.style?.identity_layout, 'creative-sidebar');
  assert.equal(identity.style?.identity_divider, true);
  assert.equal(identity.style?.lock_geometry, true);

  assert.equal(contact.style?.section_label, 'CONTACT');
  assert.equal(contact.style?.title_style, 'creative-sidebar');
  assert.equal(contact.style?.contact_divider, true);
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);
  assert.ok(contact.x < 60, 'contact en sidebar gauche');

  assert.equal(resume.style?.zone, 'main');
  assert.equal(resume.style?.section_label, 'PROFIL');
  assert.equal(resume.style?.title_style, 'creative-main');
  assert.equal(resume.style?.font_style, 'italic');
  assert.ok(resume.x > 50, 'profil en main');

  assert.equal(experiences.style?.exp_style, 'creative');
  assert.equal(experiences.style?.title_style, 'creative-main');
  assert.equal(formations.style?.formation_style, 'minimal');
  assert.ok(projets, 'projets en main');
  assert.ok(sidebarSkills.length >= 3, 'COMPÉTENCES / OUTILS / AUTRES');
  assert.ok(sidebarSkills.every((b) => b.x < 60), 'skills sidebar gauche');
  assert.equal(shapes.length, 1, 'bandeau sidebar uniquement');

  const theme = parseCanvasTheme({ id: 'creative' });
  assert.match(theme.font_heading, /Plus Jakarta Sans/);
  assert.equal(theme.color_sidebar, '#6366f1');
  assert.equal(theme.color_accent, '#f59e0b');
  assert.equal(theme.color_section_title, '#f59e0b', 'titres = accent Stable');

  const live = parseCanvasTheme(
    {
      id: 'creative',
      options: [
        { key: 'sidebar_color', type: 'color', default: '#6366f1' },
        { key: 'accent_color', type: 'color', default: '#f59e0b' },
      ],
    },
    { accent_color: '#e11d48' },
  );
  assert.equal(live.color_accent, '#e11d48');
  assert.equal(live.color_section_title, '#e11d48', 'titres suivent accent live');

  const layout = createCanvasLayoutForTemplate({ id: 'creative' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('creative')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('creative')?.fidelityCss, 'rich');
});

test('parseCanvasTheme applique template_options live (Modern)', () => {
  const template = {
    id: 'modern',
    options: [
      { key: 'sidebar_color', type: 'color', default: '#2d3748' },
      { key: 'accent_color', type: 'color', default: '#3182ce' },
    ],
  };
  const theme = parseCanvasTheme(template, {
    sidebar_color: '#1a365d',
    accent_color: '#e53e3e',
  });
  assert.equal(theme.color_sidebar, '#1a365d');
  assert.equal(theme.color_accent, '#e53e3e');
  assert.equal(theme.color_section_title, '#e53e3e');
  const blocks = buildTemplateBlocks(template, { sidebar_color: '#1a365d' });
  const sidebarBg = blocks.find((b) => b.type === 'shape:rect');
  assert.equal(sidebarBg?.style?.color, '#1a365d');
});

test('executive réplique Stable : header band + sidebar droite + freeform', () => {
  const blocks = buildTemplateBlocks({ id: 'executive' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const resume = blocks.find((b) => b.type === 'resume');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  const projets = blocks.find((b) => b.type === 'projets');
  const shapes = blocks.filter((b) => b.type === 'shape:rect');
  const sidebarSkills = blocks.filter((b) => b.type === 'skills' && b.style?.zone === 'sidebar-light');

  assert.ok(photo && identity && contact && resume && experiences);
  assert.equal(photo.style?.zone, 'header');
  assert.equal(photo.style?.photo_border, 'accent');
  assert.equal(photo.style?.lock_geometry, true);
  assert.ok(photo.w > 14 && photo.w < 18, 'photo ~60px');

  assert.equal(identity.style?.header_layout, 'inline-title');
  assert.equal(identity.style?.lock_geometry, true);
  assert.equal(resume.style?.show_section_title, false);
  assert.equal(resume.style?.lock_geometry, true);
  assert.ok(resume.y > identity.y, 'résumé sous identity');

  assert.equal(contact.style?.contact_layout, 'header-bar');
  assert.equal(contact.style?.align, 'center');
  assert.equal(contact.style?.contact_icons, true);
  assert.deepEqual(contact.bind, ['telephone', 'email', 'linkedin']);
  assert.ok(contact.y > resume.y, 'contact sous résumé');

  assert.equal(experiences.style?.exp_style, 'executive');
  assert.equal(experiences.style?.title_style, 'executive-main');
  assert.equal(formations.style?.formation_style, 'minimal');
  assert.ok(projets, 'projets en main');
  assert.equal(projets.style?.section_label, 'PROJETS');
  assert.ok(sidebarSkills.length >= 2, 'compétences sidebar');
  assert.ok(sidebarSkills.every((b) => b.x > 100), 'sidebar à droite');
  assert.ok(shapes.length >= 3, 'header + barre accent + sidebar');

  const theme = parseCanvasTheme({ id: 'executive' });
  assert.match(theme.font_heading, /Georgia/);
  assert.match(theme.font_body, /Inter/);
  assert.equal(theme.color_header, '#0f172a');
  assert.equal(theme.color_sidebar, '#f8f6f0');
  assert.equal(theme.color_accent, '#b8860b');
  assert.equal(theme.color_section_title, '#0f172a');

  const layout = createCanvasLayoutForTemplate({ id: 'executive' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('executive')?.readiness, 'near-replica');
  assert.equal(getTemplateCanvasFidelity('executive')?.fidelityCss, 'rich');
});

test('executive : accent or ne remplace pas les titres slate', () => {
  const template = {
    id: 'executive',
    options: [
      { key: 'header_color', type: 'color', default: '#0f172a' },
      { key: 'accent_color', type: 'color', default: '#b8860b' },
      { key: 'sidebar_color', type: 'color', default: '#f8f6f0' },
    ],
  };
  const theme = parseCanvasTheme(template);
  assert.equal(theme.color_accent, '#b8860b');
  assert.equal(theme.color_section_title, '#0f172a', 'titres ≠ accent (Stable --cv-color-section-title)');
  const live = parseCanvasTheme(template, { accent_color: '#d4a017', header_color: '#0f172a' });
  assert.equal(live.color_accent, '#d4a017');
  assert.equal(live.color_section_title, '#0f172a');
});

test('classic réplique Stable : header sombre + résumé + sidebar droite', () => {
  const blocks = buildTemplateBlocks({ id: 'classic' });
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const resume = blocks.find((b) => b.type === 'resume');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const projets = blocks.find((b) => b.type === 'projets');
  const sidebarSkills = blocks.filter((b) => b.type === 'skills' && b.style?.zone === 'sidebar-light');

  assert.ok(photo && identity && contact && resume);
  assert.equal(photo.style?.zone, 'header');
  assert.equal(identity.style?.header_layout, 'inline-title');
  assert.equal(identity.style?.zone, 'header');
  assert.equal(identity.y, photo.y, 'identity alignée verticalement avec la photo');
  assert.equal(identity.h, photo.h, 'identity même hauteur que la photo (centrage flex)');
  assert.equal(resume.style?.zone, 'header');
  assert.equal(resume.style?.show_section_title, false);
  assert.ok(resume.y > identity.y, 'résumé sous identity dans le header');
  assert.equal(contact.style?.align, 'center');
  assert.equal(contact.style?.contact_icons, true);
  assert.ok(contact.y > resume.y, 'contact sous résumé');

  assert.equal(experiences.style?.exp_style, 'classic');
  assert.equal(experiences.style?.title_style, 'classic-main');
  assert.ok(projets, 'projets en main (pas profil)');
  assert.ok(!blocks.some((b) => b.type === 'resume' && b.style?.zone === 'main'), 'pas de Profil en main');
  assert.ok(sidebarSkills.length >= 1, 'compétences en sidebar');
  assert.ok(sidebarSkills.every((b) => b.x > 100), 'sidebar à droite');

  const layout = createCanvasLayoutForTemplate({ id: 'classic' });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  assert.equal(getTemplateCanvasFidelity('classic')?.fidelityCss, 'rich');
  assert.equal(getTemplateCanvasFidelity('classic')?.readiness, 'near-replica');
});
