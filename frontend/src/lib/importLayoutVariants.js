/**
 * AXE-324 — Trois variantes de layout à partir d'un import CV réussi.
 *
 * Entrée typique : réponse de POST /api/cv/import
 *   `{ cv, layout_hints, layout (structurel), vision }`
 *
 * Sortie :
 *   `{ variants: [{ id, label, layout, recommendedTemplateId, importSource, blockCount }] }`
 *
 * Pas d'UI (AXE-326) ni de scoring (AXE-325) ici.
 */

import { applyAtsLayoutOptimizations } from './atsLayoutOptimize.js';
import {
  buildAdaptedCanvasLayoutForCv,
  buildFullCanvasImportLayout,
  buildStructuralImportLayout,
  isStructuralLayout,
} from './canvasCvImportAdapter.js';

export const IMPORT_VARIANT_IDS = Object.freeze(['ats-safe', 'design', 'mix']);

export const IMPORT_VARIANT_LABELS = Object.freeze({
  'ats-safe': 'ATS-safe',
  design: 'Design proche',
  mix: 'Mix design + ATS',
});

function countBlocks(layout) {
  if (!layout?.pages?.length) return 0;
  return layout.pages.reduce((n, page) => n + (page?.blocks?.length || 0), 0);
}

function cloneLayout(layout) {
  if (!layout || typeof layout !== 'object') return layout;
  return structuredClone(layout);
}

/**
 * Choisit le template ATS-safe (minimal / tags ats-safe|single-column).
 * @param {Array<object>} templatesList
 */
export function pickAtsSafeTemplate(templatesList = []) {
  const list = Array.isArray(templatesList) ? templatesList : [];
  const byTag = list.find(
    (t) => Array.isArray(t?.tags)
      && (t.tags.includes('ats-safe') || t.tags.includes('single-column')),
  );
  if (byTag) return byTag;
  const minimal = list.find((t) => t?.id === 'minimal');
  if (minimal) return minimal;
  return { id: 'minimal', name: 'Minimal', tags: ['ats-safe', 'single-column', 'no-sidebar'] };
}

function toVariant(id, result, overrides = {}) {
  const layout = overrides.layout ?? result?.layout ?? null;
  return {
    id,
    label: IMPORT_VARIANT_LABELS[id] || id,
    layout,
    recommendedTemplateId:
      overrides.recommendedTemplateId
      ?? result?.recommendedTemplateId
      ?? layout?.theme?.template_id
      ?? '',
    importSource: overrides.importSource ?? result?.importSource ?? 'preset',
    blockCount: overrides.blockCount ?? result?.blockCount ?? countBlocks(layout),
  };
}

/**
 * Produit les 3 variantes layout pour un import.
 *
 * @param {object} cv
 * @param {Array<object>} templatesList
 * @param {object} [options]
 * @param {string} [options.templateId]
 * @param {object} [options.layoutHints]
 * @param {object|null} [options.visionLayout] layout structurel ou vision (comme buildFullCanvasImportLayout)
 * @param {object} [options.visionMeta]
 */
export function buildImportLayoutVariants(cv, templatesList = [], options = {}) {
  const {
    templateId = '',
    layoutHints = {},
    visionLayout = null,
    visionMeta = {},
  } = options;

  const atsTemplate = pickAtsSafeTemplate(templatesList);
  const atsSafeResult = buildAdaptedCanvasLayoutForCv(cv, atsTemplate, {
    templatesList,
    templateId: atsTemplate.id || 'minimal',
    // Pas de hints vision : on force le chemin ATS-safe.
    layoutHints: {},
    forImport: true,
  });

  const designResult = buildFullCanvasImportLayout(cv, templatesList, {
    templateId,
    layoutHints,
    visionLayout,
    visionMeta,
  });

  let mixVariant;
  if (isStructuralLayout(visionLayout)) {
    const structural = buildStructuralImportLayout(cv, visionLayout, { templateId });
    const mixLayout = applyAtsLayoutOptimizations(cloneLayout(structural.layout));
    mixVariant = toVariant('mix', structural, {
      layout: mixLayout,
      importSource: 'mix',
      blockCount: countBlocks(mixLayout),
    });
  } else {
    const mixLayout = applyAtsLayoutOptimizations(cloneLayout(designResult.layout));
    mixVariant = toVariant('mix', designResult, {
      layout: mixLayout,
      importSource: 'mix',
      blockCount: countBlocks(mixLayout),
    });
  }

  return {
    variants: [
      toVariant('ats-safe', atsSafeResult, {
        recommendedTemplateId: atsTemplate.id || 'minimal',
        importSource: 'ats-safe',
      }),
      toVariant('design', designResult),
      mixVariant,
    ],
  };
}
