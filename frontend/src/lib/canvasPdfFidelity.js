/**
 * Fidélité aperçu canvas ↔ export PDF (AXE-30, P0).
 * `ok` = aligné pour les blocs principaux ; `partial` / `unsupported` = à signaler.
 */

import { isVectorShapeType } from './canvasShapePresets.js';

/** Blocs principaux ciblés par le P0. */
export const PDF_MAIN_BLOCK_TYPES = Object.freeze([
  'identity',
  'contact',
  'resume',
  'experiences',
  'skills',
]);

/** Icônes SVG réellement exportées par layout_renderer. */
export const PDF_EXPORTED_ICON_NAMES = Object.freeze([
  'HiPhone',
  'HiDevicePhoneMobile',
  'HiEnvelope',
  'HiLink',
  'HiMapPin',
]);

const PDF_EXPORTED_ICON_SET = new Set(PDF_EXPORTED_ICON_NAMES);

/**
 * @typedef {'ok' | 'partial' | 'unsupported'} PdfFidelityLevel
 * @typedef {{ level: PdfFidelityLevel, reason: string }} PdfFidelityResult
 */

/**
 * @param {object|null|undefined} block
 * @param {object|null|undefined} [_cv]
 * @returns {PdfFidelityResult}
 */
export function getBlockPdfFidelity(block, _cv) {
  if (!block || typeof block !== 'object') {
    return { level: 'ok', reason: '' };
  }
  const type = String(block.type || '');
  const style = block.style && typeof block.style === 'object' ? block.style : {};

  if (type === 'qrcode') {
    return {
      level: 'unsupported',
      reason: 'Le QR code n’est pas encore généré dans le PDF (placeholder).',
    };
  }
  if (isVectorShapeType(type) || type === 'shape:frame') {
    return {
      level: 'unsupported',
      reason: 'Cette forme vectorielle n’est pas encore exportée fidèlement en PDF.',
    };
  }

  if (type === 'icon') {
    const name = String(block.icon_name || '').trim();
    if (name && !PDF_EXPORTED_ICON_SET.has(name)) {
      return {
        level: 'partial',
        reason: `Icône « ${name} » remplacée par un pictogramme générique à l’export.`,
      };
    }
  }

  if (style.effect && String(style.effect).trim() && style.effect !== 'none') {
    return {
      level: 'partial',
      reason: 'Les effets décoratifs du bloc ne sont pas exportés dans le PDF.',
    };
  }

  if (
    (type === 'image' || type === 'photo')
    && (style.photo_border || style.image_border_mm || style.image_border_color)
  ) {
    return {
      level: 'partial',
      reason: 'Bordure photo / image non reprise à l’identique dans le PDF.',
    };
  }

  if (type === 'identity' && (style.identity_divider || style.title_accent)) {
    return {
      level: 'partial',
      reason: 'Séparateur / accent titre identité : rendu PDF simplifié.',
    };
  }

  if (type === 'contact' && (style.contact_divider || style.contact_uppercase)) {
    return {
      level: 'partial',
      reason: 'Séparateurs / casse contact : rendu PDF simplifié.',
    };
  }

  if (type === 'experiences' && style.exp_style === 'bold') {
    return {
      level: 'partial',
      reason: 'Style expériences « bold » / labels ATS non reproduits dans le PDF.',
    };
  }

  if (style.title_style && ['underline-accent', 'pill', 'sidebar-bar'].includes(style.title_style)) {
    return {
      level: 'partial',
      reason: 'Style de titre de section simplifié dans le PDF.',
    };
  }

  return { level: 'ok', reason: '' };
}

/**
 * @param {object|null|undefined} layout
 * @param {object|null|undefined} cv
 * @returns {{ blockId: string, type: string, level: PdfFidelityLevel, reason: string }[]}
 */
export function listNonFaithfulBlocks(layout, cv) {
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  const out = [];
  for (const page of pages) {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    for (const block of blocks) {
      if (!block?.id) continue;
      const result = getBlockPdfFidelity(block, cv);
      if (result.level === 'ok') continue;
      out.push({
        blockId: String(block.id),
        type: String(block.type || ''),
        level: result.level,
        reason: result.reason,
      });
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} layout
 * @param {object|null|undefined} cv
 */
export function layoutHasNonFaithfulBlocks(layout, cv) {
  return listNonFaithfulBlocks(layout, cv).length > 0;
}

/**
 * Libellés courts pour le bandeau d’export.
 * @param {{ type: string, level: PdfFidelityLevel }[]} items
 */
export function summarizeNonFaithfulBlocks(items) {
  if (!items?.length) return '';
  const labels = [...new Set(items.map((i) => i.type).filter(Boolean))];
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')}… (+${labels.length - 3})`;
}
