/**
 * Pont design Stable ↔ Beta (AXE-335).
 *
 * Contenu sémantique (`cv`) est déjà partagé. Ce module ne force aucune
 * migration au toggle : il construit des **offres opt-in** pour appliquer
 * un design d’un mode vers l’autre, avec un diff explicite si besoin.
 */

import { buildAdaptedCanvasLayoutForCv } from './canvasCvImportAdapter.js';
import { buildTemplateBlocks, isStableCanvasTemplateId } from './canvasTemplateSpecs.js';
import { detectTransferCandidates } from './canvasLayoutTransfer.js';
import { createCanvasLayoutForTemplate } from './layoutTemplatePresets.js';
import { isEmptyLayoutV3 } from './cvLayoutModelV3.js';

export const DESIGN_BRIDGE_DISMISS_KEY = 'cv_bot_design_bridge_dismiss_v1';

/**
 * @param {unknown} templatesList
 * @param {string|null|undefined} templateId
 */
export function resolveTemplateFromList(templatesList, templateId) {
  const id = String(templateId || '').trim();
  if (!id || !Array.isArray(templatesList)) return null;
  return templatesList.find((t) => t && t.id === id) || null;
}

/**
 * Un template HTML a-t-il une projection canvas utilisable ?
 * @param {object|null|undefined} template
 */
export function canBuildCanvasForTemplate(template) {
  if (!template?.id || !isStableCanvasTemplateId(template.id)) return false;
  try {
    return buildTemplateBlocks(template).length > 0;
  } catch {
    return false;
  }
}

/**
 * Applique le design Stable (template HTML) sur un canvas Beta adapté au `cv`.
 * @param {object|null|undefined} cv
 * @param {object} template
 * @param {{ templatesList?: unknown[] }} [options]
 */
export function applyStableDesignToCanvas(cv, template, options = {}) {
  if (!template?.id) {
    return { ok: false, reason: 'missing_template', layout: null };
  }
  if (!canBuildCanvasForTemplate(template)) {
    return { ok: false, reason: 'no_canvas_spec', layout: null };
  }
  const result = buildAdaptedCanvasLayoutForCv(cv, template, {
    templatesList: options.templatesList,
    templateId: template.id,
  });
  return {
    ok: true,
    reason: null,
    layout: result.layout,
    templateId: template.id,
  };
}

/**
 * @param {object|null|undefined} layout
 * @returns {string}
 */
export function suggestStableTemplateIdFromLayout(layout) {
  const fromTheme = String(layout?.theme?.template_id || '').trim();
  if (fromTheme) return fromTheme;
  return '';
}

/**
 * Diff honnête avant application cross-mode.
 * @param {object|null|undefined} layout
 * @param {string} [targetTemplateId]
 */
export function assessCrossModeDiff(layout, targetTemplateId = '') {
  const warnings = [];
  if (!layout || isEmptyLayoutV3(layout)) {
    return { warnings, freeform: false, manualExtras: 0, blockMismatch: false };
  }
  const freeform = layout.freeform === true;
  if (freeform) {
    warnings.push(
      'La disposition libre ne sera pas reprise à l’identique.',
    );
  }
  const target = createCanvasLayoutForTemplate(
    targetTemplateId ? { id: targetTemplateId } : { id: suggestStableTemplateIdFromLayout(layout) || 'minimal' },
  );
  const candidates = detectTransferCandidates(layout, target);
  const manualExtras = candidates.length;
  if (manualExtras > 0) {
    warnings.push(
      `${manualExtras} élément(s) ajouté(s) à la main ne seront pas repris.`,
    );
  }
  const suggested = suggestStableTemplateIdFromLayout(layout);
  const targetId = String(targetTemplateId || '').trim();
  const templateMismatch = Boolean(suggested && targetId && suggested !== targetId);
  if (templateMismatch) {
    warnings.push(
      'Un autre modèle est déjà sélectionné.',
    );
  }
  return { warnings, freeform, manualExtras, templateMismatch };
}

/**
 * @param {Storage|null|undefined} storage
 */
function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * @param {'stable_to_beta'|'beta_to_stable'} direction
 * @param {string} templateId
 * @param {Storage|null} [storage]
 */
export function isDesignBridgeDismissed(direction, templateId, storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    const raw = s.getItem(DESIGN_BRIDGE_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const key = `${direction}:${String(templateId || '').trim()}`;
    return Boolean(parsed && parsed[key]);
  } catch {
    return false;
  }
}

/**
 * @param {'stable_to_beta'|'beta_to_stable'} direction
 * @param {string} templateId
 * @param {Storage|null} [storage]
 */
export function dismissDesignBridge(direction, templateId, storage) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    const raw = s.getItem(DESIGN_BRIDGE_DISMISS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === 'object' ? { ...parsed } : {};
    next[`${direction}:${String(templateId || '').trim()}`] = true;
    s.setItem(DESIGN_BRIDGE_DISMISS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * Offre Stable → Beta : canvas vide + template Stable projetable.
 * @param {object|null|undefined} layout
 * @param {string} templateId
 * @param {unknown[]} templatesList
 * @param {{ storage?: Storage|null, force?: boolean }} [options]
 */
export function buildStableToBetaOffer(layout, templateId, templatesList, options = {}) {
  const template = resolveTemplateFromList(templatesList, templateId);
  if (!template || !canBuildCanvasForTemplate(template)) return null;
  if (!isEmptyLayoutV3(layout)) return null;
  if (!options.force && isDesignBridgeDismissed('stable_to_beta', template.id, options.storage)) {
    return null;
  }
  return {
    direction: 'stable_to_beta',
    templateId: template.id,
    templateLabel: template.name || template.label || template.id,
    title: 'Appliquer ce design ?',
    copy: 'On pose ton modèle sur le canvas. Ton contenu reste.',
    warnings: [],
  };
}

/**
 * Offre Beta → Stable : layout présent avec template_id différent ou libre.
 * @param {object|null|undefined} layout
 * @param {string} currentTemplateId
 * @param {{ storage?: Storage|null }} [options]
 */
export function buildBetaToStableOffer(layout, currentTemplateId, options = {}) {
  if (!layout || isEmptyLayoutV3(layout)) return null;
  const suggested = suggestStableTemplateIdFromLayout(layout);
  if (!suggested) return null;
  const current = String(currentTemplateId || '').trim();
  const diff = assessCrossModeDiff(layout, current);
  const shouldOffer =
    suggested !== current
    || diff.freeform
    || diff.manualExtras > 0;
  if (!shouldOffer) return null;
  if (isDesignBridgeDismissed('beta_to_stable', suggested, options.storage)) return null;
  return {
    direction: 'beta_to_stable',
    templateId: suggested,
    templateLabel: suggested,
    title: 'Utiliser ce design ?',
    copy: 'On applique ce modèle. Ton contenu reste.',
    warnings: diff.warnings,
  };
}
