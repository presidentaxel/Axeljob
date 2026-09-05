import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupCanvasHeaderOverlays,
  dedupeOverlappingIdentities,
  expandClippedIdentity,
  expandClippedSectionHeadings,
  allowWrapOnParagraphText,
  insertMissingSpaceAfterColonLabels,
  isDarkCssColor,
  isFullWidthHeaderRect,
  isLockedReplicaLayout,
  looksLikeSectionHeading,
  mergeStackedHeaderTextLines,
  removeTextDuplicatingIdentity,
  shrinkOverlappingTextLines,
  stretchHeaderBandToContent,
  tagBlocksOnHeaderBand,
  textDuplicatesIdentityContent,
  wrapAtsColonLabels,
  repairExplodedFreeformSemanticOverlays,
  removeTextDuplicatingContact,
} from '../../src/lib/canvasHeaderOverlayCleanup.js';
import { sanitizeLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import { bindStructuralTextToSemanticBlocks } from '../../src/lib/structuralSemanticBind.js';

const CV = {
  prenom: 'Louis',
  nom: 'Vedovato',
  titre_professionnel: 'Étudiant ESSEC – Entrepreneuriat, Tech & Conseil',
};

function layoutWith(blocks) {
  return sanitizeLayoutV3({
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    pages: [{ id: 'p1', blocks }],
  });
}

test('textDuplicatesIdentityContent : titre PDF vs CV', () => {
  assert.equal(
    textDuplicatesIdentityContent('- Étudiant ESSEC -', CV),
    true,
  );
  assert.equal(
    textDuplicatesIdentityContent('Étudiant ESSEC – Entrepreneuriat, Tech & Conseil', CV),
    true,
  );
  assert.equal(
    textDuplicatesIdentityContent('Organisation : Loulitos', CV),
    false,
  );
  assert.equal(
    textDuplicatesIdentityContent(
      'Étudiant ESSEC, je recherche une alternance en Achats pour mettre à profit mes compétences.',
      CV,
    ),
    false,
  );
});

test('dedupeOverlappingIdentities garde le inline-title', () => {
  const layout = layoutWith([
    {
      id: 'id-stack',
      type: 'identity',
      bind: ['titre_professionnel'],
      x: 40,
      y: 8,
      w: 140,
      h: 16,
      z: 5,
      style: { align: 'left' },
    },
    {
      id: 'id-inline',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 42,
      y: 9,
      w: 130,
      h: 14,
      z: 5,
      style: { header_layout: 'inline-title' },
    },
  ]);
  const out = dedupeOverlappingIdentities(layout);
  const ids = out.pages[0].blocks.filter((b) => b.type === 'identity').map((b) => b.id);
  assert.deepEqual(ids, ['id-inline']);
});

test('dedupeOverlappingIdentities garde une seule identité dans le bandeau', () => {
  const layout = layoutWith([
    {
      id: 'id-title-only',
      type: 'identity',
      bind: ['titre_professionnel'],
      x: 18,
      y: 8,
      w: 150,
      h: 8,
      z: 4,
      style: { align: 'left' },
    },
    {
      id: 'id-inline',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 42,
      y: 5.6,
      w: 106,
      h: 6.3,
      z: 5,
      style: { header_layout: 'inline-title' },
    },
  ]);
  const out = dedupeOverlappingIdentities(layout);
  const ids = out.pages[0].blocks.filter((b) => b.type === 'identity').map((b) => b.id);
  assert.deepEqual(ids, ['id-inline']);
});

test('removeTextDuplicatingIdentity retire le titre PDF superposé', () => {
  const layout = layoutWith([
    {
      id: 'ident',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 40,
      y: 8,
      w: 140,
      h: 16,
      z: 5,
      style: { header_layout: 'inline-title' },
    },
    {
      id: 'ghost',
      type: 'text',
      content: '- Étudiant ESSEC -',
      x: 55,
      y: 10,
      w: 80,
      h: 6,
      z: 4,
      style: { align: 'center' },
    },
    {
      id: 'ghost-html',
      type: 'text',
      content: '<span>- Étudiant ESSEC -</span>',
      x: 70,
      y: 9,
      w: 60,
      h: 5,
      z: 4,
      style: { align: 'center' },
    },
    {
      id: 'ghost-band',
      type: 'text',
      content: 'Étudiant ESSEC – Entrepreneuriat, Tech & Conseil',
      x: 20,
      y: 12,
      w: 160,
      h: 6,
      z: 4,
      style: {},
    },
    {
      id: 'body',
      type: 'text',
      content: 'Organisation : Loulitos',
      x: 12,
      y: 90,
      w: 80,
      h: 4,
      z: 3,
      style: {},
    },
    {
      id: 'about',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance en Achats pour mettre à profit mes compétences.',
      x: 8,
      y: 18,
      w: 190,
      h: 12,
      z: 4,
      style: {},
    },
  ]);
  const out = removeTextDuplicatingIdentity(layout, CV);
  const ids = out.pages[0].blocks.map((b) => b.id);
  assert.equal(ids.includes('ghost'), false);
  assert.equal(ids.includes('ghost-html'), false);
  assert.equal(ids.includes('ghost-band'), false);
  assert.equal(ids.includes('body'), true);
  assert.equal(ids.includes('ident'), true);
  assert.equal(ids.includes('about'), true);
});

test('stretchHeaderBandToContent allonge le bandeau sous le résumé', () => {
  assert.equal(
    isFullWidthHeaderRect({ type: 'shape:rect', x: 0, y: 0, w: 210, h: 41.7 }),
    true,
  );
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 41.7,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'bar',
      type: 'shape:rect',
      x: 0,
      y: 41.7,
      w: 210,
      h: 1.1,
      z: 1,
      style: { color: '#dc2626' },
    },
    {
      id: 'resume',
      type: 'resume',
      bind: 'resume',
      x: 8,
      y: 28,
      w: 194,
      h: 22,
      z: 5,
      style: { zone: 'header' },
    },
  ]);
  const out = stretchHeaderBandToContent(layout);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  const bar = out.pages[0].blocks.find((b) => b.id === 'bar');
  assert.ok(bg.h > 50, `header h=${bg.h}`);
  assert.ok(Math.abs(bar.y - bg.h) < 0.2, `accent y=${bar.y} header h=${bg.h}`);
});

test('insertMissingSpaceAfterColonLabels', () => {
  const layout = layoutWith([
    {
      id: 'a',
      type: 'text',
      content: 'Organisation :Loulitos',
      x: 12,
      y: 90,
      w: 80,
      h: 4,
      z: 3,
      style: {},
    },
  ]);
  const out = insertMissingSpaceAfterColonLabels(layout);
  assert.equal(out.pages[0].blocks[0].content, 'Organisation : Loulitos');
});

test('wrapAtsColonLabels : libellé regular + nom gras, y compris si le PDF était tout gras', () => {
  const layout = layoutWith([
    {
      id: 'org-bold',
      type: 'text',
      content: 'Organisation : Louitos',
      x: 4,
      y: 50,
      w: 40,
      h: 4,
      z: 3,
      style: { bold: true, font_size: 9 },
    },
    {
      id: 'org-plain',
      type: 'text',
      content: 'Organisation : Another Co',
      x: 4,
      y: 70,
      w: 40,
      h: 4,
      z: 3,
      style: { font_size: 9 },
    },
    {
      id: 'body',
      type: 'text',
      content: 'Pilotage du projet et de la relation client.',
      x: 4,
      y: 80,
      w: 80,
      h: 8,
      z: 3,
      style: {},
    },
  ]);
  const out = wrapAtsColonLabels(layout);
  const bold = out.pages[0].blocks.find((b) => b.id === 'org-bold');
  const plain = out.pages[0].blocks.find((b) => b.id === 'org-plain');
  const body = out.pages[0].blocks.find((b) => b.id === 'body');
  assert.equal(bold.style?.bold, false);
  assert.match(bold.content, /<span style="font-weight:400">Organisation : <\/span><strong>Louitos<\/strong>/);
  assert.match(plain.content, /<strong>Another Co<\/strong>/);
  assert.equal(body.content, 'Pilotage du projet et de la relation client.');
  const again = wrapAtsColonLabels(out);
  assert.equal(again.pages[0].blocks.find((b) => b.id === 'org-bold').content, bold.content);
});

test('expandClippedSectionHeadings agrandit un titre PDF trop bas', () => {
  assert.equal(
    looksLikeSectionHeading({
      type: 'title',
      content: 'EXPÉRIENCE PROFESSIONNELLE',
    }),
    true,
  );
  const layout = layoutWith([
    {
      id: 'exp-title',
      type: 'title',
      content: 'EXPÉRIENCE PROFESSIONNELLE',
      x: 4,
      y: 43.54,
      w: 60,
      h: 4.06,
      z: 3,
      style: { bold: true, font_size: 10 },
    },
    {
      id: 'org',
      type: 'text',
      content: 'Organisation : Louitos',
      x: 4,
      y: 49.83,
      w: 40,
      h: 4,
      z: 3,
      style: {},
    },
    {
      id: 'skills-title',
      type: 'text',
      content: 'COMPÉTENCES',
      x: 162,
      y: 47.25,
      w: 30,
      h: 4.06,
      z: 3,
      style: { bold: true, font_size: 10 },
    },
  ]);
  const out = expandClippedSectionHeadings(layout);
  const title = out.pages[0].blocks.find((b) => b.id === 'exp-title');
  const org = out.pages[0].blocks.find((b) => b.id === 'org');
  const skills = out.pages[0].blocks.find((b) => b.id === 'skills-title');
  assert.ok(title.h > 4.06, `title h=${title.h}`);
  assert.ok(title.y + title.h <= org.y - 0.2, 'ne recouvre pas Organisation');
  assert.equal(title.style?.role, 'heading');
  assert.equal(title.style?.lock_height, true);
  assert.ok(skills.h > 4.06, `skills h=${skills.h}`);
  assert.equal(skills.style?.role, 'heading');
  assert.equal(skills.style?.lock_height, true);
});

test('expandClippedSectionHeadings ne gèle pas un titre déjà assez haut', () => {
  const layout = layoutWith([
    {
      id: 'exp-title',
      type: 'title',
      content: 'EXPÉRIENCE PROFESSIONNELLE',
      x: 4,
      y: 50,
      w: 80,
      h: 12,
      z: 3,
      style: { bold: true, font_size: 10 },
    },
  ]);
  const out = expandClippedSectionHeadings(layout);
  const title = out.pages[0].blocks.find((b) => b.id === 'exp-title');
  assert.equal(title.h, 12);
  assert.equal(title.style?.lock_height, undefined);
});

test('stretchHeaderBandToContent n’avale pas les titres de section du corps', () => {
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 41.7,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'resume',
      type: 'text',
      content: 'Résumé dans le bandeau',
      x: 8,
      y: 28,
      w: 194,
      h: 8,
      z: 5,
      style: {},
    },
    {
      id: 'exp-title',
      type: 'title',
      content: 'EXPÉRIENCE PROFESSIONNELLE',
      x: 4,
      y: 43.5,
      w: 60,
      h: 4,
      z: 3,
      style: {},
    },
  ]);
  const out = stretchHeaderBandToContent(layout);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  assert.ok(bg.h < 43, `header ne doit pas avaler le corps, h=${bg.h}`);
});

test('expandClippedIdentity agrandit une identité trop basse', () => {
  const layout = layoutWith([
    {
      id: 'ident',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 19,
      y: 5.6,
      w: 106,
      h: 6.3,
      z: 3,
      style: { header_layout: 'inline-title' },
    },
    {
      id: 'resume',
      type: 'text',
      content: 'Résumé',
      x: 2,
      y: 16.2,
      w: 200,
      h: 8,
      z: 3,
      style: {},
    },
  ]);
  const out = expandClippedIdentity(layout);
  const ident = out.pages[0].blocks.find((b) => b.id === 'ident');
  assert.ok(ident.h > 8, `identity h=${ident.h}`);
  assert.ok(ident.h < 16.2 - 5.6, 'ne doit pas recouvrir le résumé');
});

test('shrinkOverlappingTextLines réduit les hauteurs empilées', () => {
  const layout = layoutWith([
    {
      id: 'l1',
      type: 'text',
      content: 'ligne un',
      x: 2,
      y: 16.25,
      w: 200,
      h: 7.85,
      z: 3,
      style: {},
    },
    {
      id: 'l2',
      type: 'text',
      content: 'ligne deux',
      x: 2,
      y: 20.53,
      w: 200,
      h: 7.85,
      z: 3,
      style: {},
    },
  ]);
  const out = shrinkOverlappingTextLines(layout);
  const l1 = out.pages[0].blocks.find((b) => b.id === 'l1');
  assert.ok(l1.h < 5, `l1 h=${l1.h}`);
  assert.equal(l1.style?.lock_height, true);
});

test('mergeStackedHeaderTextLines fusionne le paragraphe du bandeau', () => {
  const layout = layoutWith([
    {
      id: 'l1',
      type: 'text',
      content: 'ligne un du résumé',
      x: 2,
      y: 16.25,
      w: 200,
      h: 7.85,
      z: 3,
      style: { italic: true, nowrap: true },
    },
    {
      id: 'l2',
      type: 'text',
      content: 'ligne deux du résumé',
      x: 2,
      y: 20.53,
      w: 200,
      h: 7.85,
      z: 3,
      style: { italic: true, nowrap: true },
    },
    {
      id: 'contact',
      type: 'contact',
      x: 8,
      y: 34.3,
      w: 190,
      h: 4,
      z: 3,
      style: {},
    },
  ]);
  const out = mergeStackedHeaderTextLines(layout);
  const texts = out.pages[0].blocks.filter((b) => b.type === 'text');
  assert.equal(texts.length, 1);
  assert.ok(texts[0].content.includes('ligne deux'));
  assert.ok(texts[0].y + texts[0].h <= 34.3, 'ne recouvre pas le contact');
  assert.equal(texts[0].style?.nowrap, undefined);
});

test('allowWrapOnParagraphText retire nowrap sur un à-propos, pas sur Organisation', () => {
  const layout = layoutWith([
    {
      id: 'resume',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance en Achats pour mettre à profit mes compétences en résolution de problèmes, automatisation et gestion de projet.',
      x: 2,
      y: 16,
      w: 200,
      h: 17,
      z: 3,
      style: { italic: true, nowrap: true },
    },
    {
      id: 'org',
      type: 'text',
      content: 'Organisation : Louitos',
      x: 4,
      y: 50,
      w: 40,
      h: 4,
      z: 3,
      style: { nowrap: true },
    },
  ]);
  const out = allowWrapOnParagraphText(layout);
  const resume = out.pages[0].blocks.find((b) => b.id === 'resume');
  const org = out.pages[0].blocks.find((b) => b.id === 'org');
  assert.equal(resume.style?.nowrap, undefined);
  assert.equal(org.style?.nowrap, true);
});

test('allowWrapOnParagraphText conserve nowrap sur une ligne PDF unique', () => {
  const layout = layoutWith([
    {
      id: 'line',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance en Achats pour mettre à profit mes compétences en résolution de problèmes.',
      x: 2,
      y: 16,
      w: 200,
      h: 4,
      z: 3,
      style: { nowrap: true },
    },
  ]);
  const out = allowWrapOnParagraphText(layout);
  assert.equal(out.pages[0].blocks[0].style?.nowrap, true);
});

test('cleanupCanvasHeaderOverlays combine les passes', () => {
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 30,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'id1',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 40,
      y: 8,
      w: 140,
      h: 16,
      z: 5,
      style: { header_layout: 'inline-title' },
    },
    {
      id: 'ghost',
      type: 'text',
      content: '- Étudiant ESSEC -',
      x: 50,
      y: 10,
      w: 90,
      h: 6,
      z: 4,
      style: {},
    },
    {
      id: 'resume',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance',
      x: 8,
      y: 26,
      w: 190,
      h: 12,
      z: 4,
      style: { italic: true },
    },
  ]);
  const out = cleanupCanvasHeaderOverlays(layout, CV);
  const ids = out.pages[0].blocks.map((b) => b.id);
  assert.equal(ids.includes('ghost'), false);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  assert.ok(bg.h >= 38, `header h=${bg.h}`);
});

test('cleanupCanvasHeaderOverlays répare un bandeau Beta trop haut + titre fantôme', () => {
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 53.8,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'ident',
      type: 'identity',
      bind: ['prenom', 'nom', 'titre_professionnel'],
      x: 19,
      y: 5.62,
      w: 106.39,
      h: 6.32,
      z: 3,
      style: { header_layout: 'inline-title' },
    },
    {
      id: 'ghost',
      type: 'text',
      content: '- Étudiant ESSEC -',
      x: 65,
      y: 8.1,
      w: 80,
      h: 6,
      z: 4,
      style: { align: 'center' },
    },
    {
      id: 'r1',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance',
      x: 2,
      y: 16.25,
      w: 200,
      h: 7.85,
      z: 3,
      style: { italic: true },
    },
    {
      id: 'r2',
      type: 'text',
      content: 'en Achats pour mettre à profit mes compétences',
      x: 2,
      y: 20.53,
      w: 200,
      h: 7.85,
      z: 3,
      style: { italic: true },
    },
    {
      id: 'sidebar',
      type: 'shape:rect',
      x: 159.73,
      y: 41.73,
      w: 50.27,
      h: 255.27,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'contact',
      type: 'contact',
      x: 8,
      y: 34.3,
      w: 194,
      h: 4.1,
      z: 3,
      style: {},
    },
    {
      id: 'exp-title',
      type: 'title',
      content: 'EXPÉRIENCE PROFESSIONNELLE',
      x: 4,
      y: 43.54,
      w: 80,
      h: 4,
      z: 3,
      style: {},
    },
  ]);
  const out = cleanupCanvasHeaderOverlays(layout, CV);
  const ids = out.pages[0].blocks.map((b) => b.id);
  assert.equal(ids.includes('ghost'), false);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  assert.ok(bg.h < 43, `header ne doit pas avaler EXPÉRIENCE, h=${bg.h}`);
  assert.ok(bg.h >= 36, `header doit couvrir le contact, h=${bg.h}`);
  const ident = out.pages[0].blocks.find((b) => b.id === 'ident');
  assert.ok(ident.h > 8, `identity h=${ident.h}`);
  assert.ok(ident.w > 120, `identity w=${ident.w}`);
  assert.equal(ident.style?.zone, 'header');
  const r1 = out.pages[0].blocks.find((b) => b.id === 'r1');
  assert.equal(ids.includes('r2'), false, 'lignes de résumé fusionnées');
  assert.ok(r1.content.includes('Achats'), r1.content);
  assert.equal(r1.style?.lock_height, true);
  assert.ok(r1.h > 6, `résumé fusionné h=${r1.h}`);
  const sidebar = out.pages[0].blocks.find((b) => b.id === 'sidebar');
  assert.ok(Math.abs(sidebar.y - bg.h) < 0.3, `sidebar y=${sidebar.y} header h=${bg.h}`);
});

test('bindStructuralTextToSemanticBlocks absorbe le titre PDF voisin', () => {
  const layout = layoutWith([
    {
      id: 'name',
      type: 'text',
      content: 'Louis Vedovato',
      x: 40,
      y: 10,
      w: 90,
      h: 8,
      z: 3,
      style: { bold: true, font_size: 18 },
    },
    {
      id: 'title',
      type: 'text',
      content: '- Étudiant ESSEC -',
      x: 50,
      y: 12,
      w: 80,
      h: 6,
      z: 3,
      style: {},
    },
  ]);
  const { layout: out } = bindStructuralTextToSemanticBlocks(layout, CV);
  const types = out.pages[0].blocks.map((b) => b.type);
  assert.ok(types.includes('identity'));
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'title'), false);
});

test('isDarkCssColor : navy vs crème', () => {
  assert.equal(isDarkCssColor('#1e293b'), true);
  assert.equal(isDarkCssColor('#f5f0e8'), false);
  assert.equal(isDarkCssColor('rgb(255, 255, 255)'), false);
  assert.equal(isDarkCssColor(''), false);
});

test('stretchHeaderBandToContent ignore une zone=header périmée sous le bandeau', () => {
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 41.7,
      z: 0,
      style: { color: '#1e293b' },
    },
    {
      id: 'stale',
      type: 'text',
      content: 'Compétence hors bandeau',
      x: 12,
      y: 55,
      w: 80,
      h: 8,
      z: 3,
      style: { zone: 'header' },
    },
  ]);
  const out = stretchHeaderBandToContent(layout);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  assert.equal(bg.h, 41.7);
});

test('tagBlocksOnHeaderBand ne blanchit pas un bandeau clair', () => {
  const layout = layoutWith([
    {
      id: 'bg',
      type: 'shape:rect',
      x: 0,
      y: 0,
      w: 210,
      h: 36,
      z: 0,
      style: { color: '#f5f0e8' },
    },
    {
      id: 'ident',
      type: 'identity',
      bind: ['prenom', 'nom'],
      x: 12,
      y: 8,
      w: 140,
      h: 14,
      z: 3,
      style: { zone: 'header' },
    },
  ]);
  const out = tagBlocksOnHeaderBand(layout);
  const ident = out.pages[0].blocks.find((b) => b.id === 'ident');
  assert.notEqual(ident.style?.zone, 'header');
});

test('cleanupCanvasHeaderOverlays ne réécrit pas la géométrie d’une réplique', () => {
  const layout = sanitizeLayoutV3({
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    replica_cascade: true,
    pages: [{
      id: 'p1',
      blocks: [
        {
          id: 'bg',
          type: 'shape:rect',
          x: 0,
          y: 0,
          w: 210,
          h: 48,
          z: 0,
          style: { color: '#1e293b' },
        },
        {
          id: 'ident',
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: 40,
          y: 8,
          w: 120,
          h: 10,
          z: 5,
          style: { header_layout: 'inline-title', lock_geometry: true, zone: 'header' },
        },
        {
          id: 'exp-title',
          type: 'title',
          content: 'EXPÉRIENCE PROFESSIONNELLE',
          x: 8,
          y: 56,
          w: 80,
          h: 6,
          z: 3,
          style: { bold: true, font_size: 11 },
        },
        {
          id: 'sidebar',
          type: 'shape:rect',
          x: 160,
          y: 52,
          w: 50,
          h: 240,
          z: 0,
          style: { color: '#1e293b' },
        },
      ],
    }],
  });
  assert.equal(isLockedReplicaLayout(layout), true);
  const out = cleanupCanvasHeaderOverlays(layout, CV);
  const bg = out.pages[0].blocks.find((b) => b.id === 'bg');
  const ident = out.pages[0].blocks.find((b) => b.id === 'ident');
  const sidebar = out.pages[0].blocks.find((b) => b.id === 'sidebar');
  const title = out.pages[0].blocks.find((b) => b.id === 'exp-title');
  assert.equal(bg.h, 48);
  assert.equal(ident.h, 10);
  assert.equal(ident.w, 120);
  assert.equal(sidebar.y, 52);
  assert.equal(ident.style?.zone, 'header');
  assert.equal(title.h, 6);
  assert.equal(title.style?.lock_height, undefined);
});

test('bindStructuralTextToSemanticBlocks ne consomme pas un à-propos qui cite le titre', () => {
  const layout = layoutWith([
    {
      id: 'name',
      type: 'text',
      content: 'Louis Vedovato',
      x: 40,
      y: 10,
      w: 90,
      h: 8,
      z: 3,
      style: { bold: true, font_size: 18 },
    },
    {
      id: 'about',
      type: 'text',
      content: 'Étudiant ESSEC, je recherche une alternance en Achats pour mettre à profit mes compétences.',
      x: 8,
      y: 20,
      w: 190,
      h: 12,
      z: 3,
      style: {},
    },
  ]);
  const { layout: out } = bindStructuralTextToSemanticBlocks(layout, CV);
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'about'), true);
});

test('bindStructuralTextToSemanticBlocks ne consomme pas un filet de ponctuation', () => {
  const layout = layoutWith([
    {
      id: 'name',
      type: 'text',
      content: 'Louis Vedovato',
      x: 40,
      y: 10,
      w: 90,
      h: 8,
      z: 3,
      style: { bold: true, font_size: 18 },
    },
    {
      id: 'rule',
      type: 'text',
      content: '--------',
      x: 40,
      y: 20,
      w: 90,
      h: 3,
      z: 3,
      style: {},
    },
    {
      id: 'dots',
      type: 'text',
      content: '···· ····',
      x: 40,
      y: 24,
      w: 90,
      h: 3,
      z: 3,
      style: {},
    },
  ]);
  const { layout: out } = bindStructuralTextToSemanticBlocks(layout, CV);
  const ids = out.pages[0].blocks.map((b) => b.id);
  assert.equal(ids.includes('rule'), true);
  assert.equal(ids.includes('dots'), true);
});

test('repairExplodedFreeformSemanticOverlays : experiences géant à côté du PDF → title', () => {
  const layout = layoutWith([
    {
      id: 'exp',
      type: 'experiences',
      x: 8,
      y: 82,
      w: 48,
      h: 210,
      z: 4,
      bind: 'experiences',
      style: { section_label: 'EXPÉRIENCE PROFESSIONNELLE' },
    },
    {
      id: 'job1',
      type: 'text',
      content: 'Conseillère de vente - Bonpoint',
      x: 54,
      y: 79,
      w: 100,
      h: 9,
      z: 2,
    },
    {
      id: 'job2',
      type: 'text',
      content: 'Co-Présidente - Association HeForShe',
      x: 54,
      y: 132,
      w: 90,
      h: 9,
      z: 2,
    },
  ]);
  const out = cleanupCanvasHeaderOverlays(layout, {
    prenom: 'Enée',
    nom: 'Candiolo',
  });
  const exp = out.pages[0].blocks.find((b) => b.id === 'exp');
  assert.equal(exp.type, 'title');
  assert.ok(exp.h <= 10);
  assert.equal(exp.style?.lock_height, true);
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'job1'), true);
  assert.equal(repairExplodedFreeformSemanticOverlays(layout).pages[0].blocks.find((b) => b.id === 'exp').type, 'title');
});

test('removeTextDuplicatingContact retire le téléphone PDF à côté du contact', () => {
  const layout = layoutWith([
    {
      id: 'ct',
      type: 'contact',
      x: 155,
      y: 18,
      w: 43,
      h: 19,
      z: 3,
      bind: ['email', 'telephone'],
    },
    {
      id: 'phone',
      type: 'text',
      content: '+33 7 68 56 32 11',
      x: 168,
      y: 14,
      w: 31,
      h: 8,
      z: 2,
    },
  ]);
  const out = removeTextDuplicatingContact(layout, { telephone: '+33 7 68 56 32 11' });
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'phone'), false);
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'ct'), true);
});
