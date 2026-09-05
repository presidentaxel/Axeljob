/**
 * AXE-332 — dual-key FR/EN
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncCvDualKeys } from '../../src/lib/cvDualKey.js';
import { bindStructuralTextToSemanticBlocks } from '../../src/lib/structuralSemanticBind.js';
import { cvFromImportPayload, extractImportApiResponse } from '../../src/lib/cvImportUtils.js';

describe('cvDualKey', () => {
  it('sync FR → EN', () => {
    const out = syncCvDualKeys({ prenom: 'Ada', nom: 'Lovelace' });
    assert.equal(out.first_name, 'Ada');
    assert.equal(out.last_name, 'Lovelace');
  });

  it('FR wins on conflict', () => {
    const out = syncCvDualKeys({ prenom: 'Ada', first_name: 'Other', nom: 'Lovelace', last_name: 'X' });
    assert.equal(out.first_name, 'Ada');
    assert.equal(out.last_name, 'Lovelace');
  });
});

describe('cvImportUtils dual-key', () => {
  it('cvFromImportPayload syncs dual keys', () => {
    const cv = cvFromImportPayload({ first_name: 'Grace', last_name: 'Hopper', email: 'g@navy.mil' });
    assert.equal(cv.prenom, 'Grace');
    assert.equal(cv.nom, 'Hopper');
    assert.equal(cv.first_name, 'Grace');
  });

  it('extractImportApiResponse exposes semantic_meta + annotations', () => {
    const extracted = extractImportApiResponse({
      cv: { prenom: 'Ada' },
      layout_hints: {},
      layout: { pages: [] },
      semantic_meta: { schema_version: 1 },
      block_annotations: [{ block_id: 'b1', type: 'identity', confidence: 0.9 }],
    });
    assert.equal(extracted.semanticMeta.schema_version, 1);
    assert.equal(extracted.blockAnnotations.length, 1);
  });
});

describe('structuralSemanticBind annotations', () => {
  it('prefer API annotations over heuristics', () => {
    const layout = {
      version: 3,
      pages: [{
        blocks: [
          {
            id: 't1',
            type: 'text',
            x: 10,
            y: 10,
            w: 40,
            h: 8,
            content: 'Something odd',
            style: { font_size: 11, bold: true },
          },
        ],
      }],
    };
    const { layout: bound, boundCount } = bindStructuralTextToSemanticBlocks(
      layout,
      {},
      {
        annotations: [{
          block_id: 't1',
          type: 'experiences',
          kind: 'heading',
          confidence: 0.95,
          section_label: 'EXPERIENCES',
        }],
      },
    );
    assert.equal(boundCount, 1);
    const block = bound.pages[0].blocks[0];
    // Titre seul (pas de corps dans la région) : title verrouillé, pas un
    // widget experiences qui s’auto-agrandit. L’annotation API a quand même
    // primé : sans elle « Something odd » resterait du texte.
    assert.equal(block.type, 'title');
    assert.equal(block.content, 'EXPERIENCES');
    assert.equal(block.style?.lock_height, true);
  });

  it('API heading + corps même colonne → widget experiences', () => {
    const layout = {
      version: 3,
      pages: [{
        blocks: [
          {
            id: 't1',
            type: 'text',
            x: 10,
            y: 10,
            w: 40,
            h: 8,
            content: 'Something odd',
            style: { font_size: 11, bold: true },
          },
          {
            id: 'b1',
            type: 'text',
            x: 10,
            y: 20,
            w: 80,
            h: 6,
            content: 'Product Manager — NovaSoft',
            style: {},
          },
        ],
      }],
    };
    const { layout: bound } = bindStructuralTextToSemanticBlocks(
      layout,
      {},
      {
        annotations: [{
          block_id: 't1',
          type: 'experiences',
          kind: 'heading',
          confidence: 0.95,
          section_label: 'EXPERIENCES',
        }],
      },
    );
    const exp = bound.pages[0].blocks.find((b) => b.type === 'experiences');
    assert.ok(exp);
    assert.equal(exp.style?.lock_height, true);
    assert.equal(bound.pages[0].blocks.some((b) => b.id === 'b1'), false);
  });
});
