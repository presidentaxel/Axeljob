import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import {
  MIN_SEMANTIC_CONFIDENCE,
  bindStructuralTextToSemanticBlocks,
  classifyStructuralTextBlock,
  decodeStructuralText,
} from '../../src/lib/structuralSemanticBind.js';

test('decodeStructuralText décode entités HTML', () => {
  assert.equal(decodeStructuralText('A &amp; B'), 'A & B');
  assert.equal(decodeStructuralText('  Exp&#233;rience  '), 'Expérience');
});

test('classifyStructuralTextBlock : titre expérience haute confiance', () => {
  const hit = classifyStructuralTextBlock({
    type: 'text',
    content: 'Expérience professionnelle',
    x: 20,
    y: 80,
    w: 100,
    h: 6,
    style: { bold: true, font_size: 12 },
  });
  assert.equal(hit?.type, 'experiences');
  assert.equal(hit?.kind, 'heading');
  assert.ok(hit.confidence >= MIN_SEMANTIC_CONFIDENCE);
});

test('classifyStructuralTextBlock : corps long → null (pas de faux positif)', () => {
  const hit = classifyStructuralTextBlock({
    type: 'text',
    content: 'J\'ai beaucoup d\'expérience professionnelle dans le secteur mais ce n\'est pas un titre de section.',
    x: 20,
    y: 100,
    w: 120,
    h: 10,
    style: {},
  });
  assert.equal(hit, null);
});

test('classifyStructuralTextBlock : identité si nom CV + haut de page', () => {
  const hit = classifyStructuralTextBlock(
    {
      type: 'text',
      content: 'Camille Durand',
      x: 20,
      y: 18,
      w: 80,
      h: 8,
      style: { bold: true, font_size: 18 },
    },
    { prenom: 'Camille', nom: 'Durand' },
  );
  assert.equal(hit?.type, 'identity');
  assert.ok(hit.confidence >= MIN_SEMANTIC_CONFIDENCE);
});

test('classifyStructuralTextBlock : identité faible confiance si bas de page', () => {
  const hit = classifyStructuralTextBlock(
    {
      type: 'text',
      content: 'Camille',
      x: 20,
      y: 250,
      w: 40,
      h: 5,
      style: { font_size: 10 },
    },
    { prenom: 'Camille', nom: 'Durand' },
  );
  assert.equal(hit, null);
});

test('classifyStructuralTextBlock : contact via email', () => {
  const hit = classifyStructuralTextBlock(
    {
      type: 'text',
      content: 'camille.durand@example.fr | +33 6 11 22 33 44',
      x: 20,
      y: 40,
      w: 120,
      h: 5,
      style: {},
    },
    { email: 'camille.durand@example.fr' },
  );
  assert.equal(hit?.type, 'contact');
  assert.ok(hit.confidence >= MIN_SEMANTIC_CONFIDENCE);
});

test('bindStructuralTextToSemanticBlocks : heading + corps → experiences, freeform conservé', () => {
  const layout = sanitizeLayoutV3({
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'shape', type: 'shape:rect', x: 0, y: 0, w: 10, h: 297, z: 0, style: { color: '#003c33' } },
        {
          id: 'h1',
          type: 'text',
          content: 'Expérience professionnelle',
          x: 20,
          y: 60,
          w: 100,
          h: 6,
          z: 2,
          style: { bold: true, font_size: 12 },
        },
        {
          id: 'b1',
          type: 'text',
          content: 'Product Manager — NovaSoft',
          x: 20,
          y: 70,
          w: 110,
          h: 5,
          z: 2,
          style: {},
        },
        {
          id: 'b2',
          type: 'text',
          content: 'Lancement de 3 features',
          x: 20,
          y: 78,
          w: 110,
          h: 5,
          z: 2,
          style: {},
        },
        {
          id: 'h2',
          type: 'text',
          content: 'Formation',
          x: 20,
          y: 120,
          w: 60,
          h: 6,
          z: 2,
          style: { bold: true, font_size: 12 },
        },
        {
          id: 'f1',
          type: 'text',
          content: 'Master Management',
          x: 20,
          y: 130,
          w: 90,
          h: 5,
          z: 2,
          style: {},
        },
      ],
    }],
  });

  const { layout: out, boundCount } = bindStructuralTextToSemanticBlocks(layout, {
    prenom: 'Camille',
    nom: 'Durand',
  });
  assert.equal(out.freeform, true);
  assert.equal(boundCount, 2);
  const blocks = out.pages[0].blocks;
  assert.ok(blocks.some((b) => b.type === 'shape:rect'));
  const exp = blocks.find((b) => b.type === 'experiences');
  const form = blocks.find((b) => b.type === 'formations');
  assert.ok(exp);
  assert.equal(exp.bind, 'experiences');
  assert.ok(exp.h >= 18);
  assert.ok(form);
  assert.equal(form.bind, 'formations');
  assert.equal(blocks.some((b) => b.id === 'b1'), false);
  assert.equal(blocks.some((b) => b.type === 'text' && b.content === 'Product Manager — NovaSoft'), false);
});

test('bindStructuralTextToSemanticBlocks : confiance basse → freeform inchangé', () => {
  const layout = sanitizeLayoutV3({
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    pages: [{
      id: 'p1',
      blocks: [
        {
          id: 't1',
          type: 'text',
          content: 'Note de bas de page sans signal',
          x: 20,
          y: 200,
          w: 80,
          h: 5,
          z: 1,
          style: {},
        },
      ],
    }],
  });
  const { layout: out, boundCount, skippedLowConfidence } = bindStructuralTextToSemanticBlocks(
    layout,
    {},
  );
  assert.equal(boundCount, 0);
  assert.equal(skippedLowConfidence, 0);
  assert.equal(out.pages[0].blocks[0].type, 'text');
  assert.equal(out.pages[0].blocks[0].content.includes('Note'), true);
});
