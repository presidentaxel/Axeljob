/**
 * AXE-398 — Persistance du layout « Design proche » à l’inscription.
 *
 * Réutilise le même pipeline que le chooser Beta (AXE-324) : variante `design`.
 * On ne sauve un canvas que si la copie est réelle (structurel / vision).
 * Un preset n’est jamais présenté comme le design du document.
 */

import {
  countContentBlocks,
  resolveImportPersistTemplateId,
} from './canvasCvImportAdapter.js';
import { cvFromImportPayload, extractImportApiResponse } from './cvImportUtils.js';
import { buildImportLayoutVariants } from './importLayoutVariants.js';
import { resetTemplateOptionsToDefaults } from './templateOptionsSchema.js';

export const ONBOARDING_LAYOUT_COPIED_SOURCES = Object.freeze([
  'structural',
  'vision-guided',
]);

export const ONBOARDING_LAYOUT_COPIED_HINT =
  'Mise en page du PDF conservée. Tu la retrouveras dans l’éditeur.';

export const ONBOARDING_LAYOUT_TEXT_HINT =
  'Le contenu a été lu. La mise en page d’origine n’est disponible que depuis un PDF texte — pas le copier-coller.';

export const ONBOARDING_LAYOUT_MISSING_HINT =
  'Le contenu a été lu, mais la mise en page du document n’a pas pu être copiée (Word, PDF image, ou analyse visuelle insuffisante). Tu pourras choisir un modèle ensuite.';

/**
 * @param {string} importSource
 */
export function onboardingLayoutWasCopied(importSource) {
  return ONBOARDING_LAYOUT_COPIED_SOURCES.includes(String(importSource || ''));
}

/**
 * @param {{ method?: string, layoutCopied?: boolean, importPolicy?: object|null }} [options]
 */
export function onboardingLayoutHint({
  method = '',
  layoutCopied = false,
  importPolicy = null,
} = {}) {
  if (layoutCopied) return ONBOARDING_LAYOUT_COPIED_HINT;
  const policyMsg = String(importPolicy?.message || '').trim();
  if (policyMsg) return policyMsg;
  if (method === 'text') return ONBOARDING_LAYOUT_TEXT_HINT;
  return ONBOARDING_LAYOUT_MISSING_HINT;
}

function templateOptionsForId(templatesList, templateId) {
  const rec = (Array.isArray(templatesList) ? templatesList : []).find(
    (t) => t?.id === templateId,
  );
  return rec ? resetTemplateOptionsToDefaults(rec) : {};
}

/**
 * Construit le CV de revue + le body PUT onboarding.
 *
 * @param {object} apiResult réponse POST /api/cv/import ou import-text
 * @param {Array<object>} [templatesList]
 * @param {{ method?: string, templateId?: string }} [options]
 */
export function buildOnboardingImportPersist(apiResult, templatesList = [], options = {}) {
  const extracted = extractImportApiResponse(apiResult);
  const cv = cvFromImportPayload(extracted.cv);
  let variants = [];
  try {
    const built = buildImportLayoutVariants(cv, templatesList, {
      templateId: options.templateId || '',
      layoutHints: extracted.layoutHints,
      visionLayout: extracted.visionLayout,
      visionMeta: extracted.visionMeta,
      annotations: extracted.blockAnnotations,
    });
    variants = Array.isArray(built?.variants) ? built.variants : [];
  } catch {
    /* keep [] */
  }

  const design = (Array.isArray(variants) ? variants : []).find((v) => v?.id === 'design')
    || null;
  const importSource = design?.importSource || 'preset';
  const layout = design?.layout && countContentBlocks(design.layout) > 0
    ? design.layout
    : null;
  const layoutCopied = Boolean(layout && onboardingLayoutWasCopied(importSource));
  const templateId = layoutCopied
    ? resolveImportPersistTemplateId(
      design?.recommendedTemplateId,
      options.templateId || 'minimal',
    )
    : '';

  const persistBody = layoutCopied
    ? {
      ...cv,
      layout,
      template_id: templateId,
      template_options: templateOptionsForId(templatesList, templateId),
    }
    : { ...cv };

  return {
    cv,
    persistBody,
    layoutCopied,
    layoutHint: onboardingLayoutHint({
      method: options.method,
      layoutCopied,
      importPolicy: extracted.importPolicy,
    }),
    importSource,
    templateId,
  };
}
