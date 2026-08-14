/**
 * Composer En-tête (AXE-334 P0) — variants design + champs → blocs canvas liés au CV.
 */

import { syncCvDualKeys } from './cvDualKey.js';
import {
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  addBlockToPage,
  listAllBlocks,
  removeBlocks,
} from './cvLayoutModelV3.js';

const W = PAGE_USABLE_WIDTH_MM;

/** @typedef {'prenom'|'nom'|'titre_professionnel'|'email'|'telephone'|'linkedin'} HeaderComposerFieldKey */

/** @type {ReadonlyArray<HeaderComposerFieldKey>} */
export const HEADER_COMPOSER_IDENTITY_FIELDS = Object.freeze([
  'prenom',
  'nom',
  'titre_professionnel',
]);

/** @type {ReadonlyArray<HeaderComposerFieldKey>} */
export const HEADER_COMPOSER_CONTACT_FIELDS = Object.freeze([
  'email',
  'telephone',
  'linkedin',
]);

/** @type {ReadonlyArray<HeaderComposerFieldKey>} */
export const HEADER_COMPOSER_FIELD_KEYS = Object.freeze([
  ...HEADER_COMPOSER_IDENTITY_FIELDS,
  ...HEADER_COMPOSER_CONTACT_FIELDS,
]);

export const HEADER_COMPOSER_FIELD_LABELS = Object.freeze({
  prenom: 'Prénom',
  nom: 'Nom',
  titre_professionnel: 'Titre professionnel',
  email: 'Email',
  telephone: 'Téléphone',
  linkedin: 'LinkedIn',
});

/** @type {ReadonlyArray<{ id: string, label: string, description: string }>} */
export const HEADER_COMPOSER_VARIANTS = Object.freeze([
  {
    id: 'stacked',
    label: 'Classique',
    description: 'Nom empilé, contact en dessous',
  },
  {
    id: 'inline_title',
    label: 'Titre inline',
    description: 'Nom et titre sur une ligne, accent',
  },
  {
    id: 'header_bar',
    label: 'Barre contact',
    description: 'Identité + bandeau contact horizontal',
  },
]);

/**
 * @param {string} variantId
 * @returns {{ id: string, label: string, description: string }}
 */
export function resolveHeaderComposerVariant(variantId) {
  return (
    HEADER_COMPOSER_VARIANTS.find((v) => v.id === variantId)
    || HEADER_COMPOSER_VARIANTS[0]
  );
}

/**
 * Prefill valeurs + cases depuis le CV (guider sans forcer).
 * @param {object|null|undefined} cv
 * @returns {{ values: Record<HeaderComposerFieldKey, string>, fields: Record<HeaderComposerFieldKey, boolean> }}
 */
export function defaultHeaderComposerState(cv) {
  /** @type {Record<HeaderComposerFieldKey, string>} */
  const values = {
    prenom: String(cv?.prenom || cv?.first_name || '').trim(),
    nom: String(cv?.nom || cv?.last_name || '').trim(),
    titre_professionnel: String(cv?.titre_professionnel || '').trim(),
    email: String(cv?.email || '').trim(),
    telephone: String(cv?.telephone || '').trim(),
    linkedin: String(cv?.linkedin || '').trim(),
  };

  /** @type {Record<HeaderComposerFieldKey, boolean>} */
  const fields = {
    prenom: true,
    nom: true,
    titre_professionnel: true,
    email: Boolean(values.email),
    telephone: Boolean(values.telephone),
    linkedin: Boolean(values.linkedin),
  };

  // Au moins un contact coché si des données existent ; sinon proposer email.
  if (!fields.email && !fields.telephone && !fields.linkedin) {
    fields.email = true;
  }

  return { values, fields };
}

/**
 * @param {Record<HeaderComposerFieldKey, boolean>} fields
 * @returns {HeaderComposerFieldKey[]}
 */
export function selectedIdentityBinds(fields) {
  return HEADER_COMPOSER_IDENTITY_FIELDS.filter((key) => fields?.[key]);
}

/**
 * @param {Record<HeaderComposerFieldKey, boolean>} fields
 * @returns {HeaderComposerFieldKey[]}
 */
export function selectedContactBinds(fields) {
  return HEADER_COMPOSER_CONTACT_FIELDS.filter((key) => fields?.[key]);
}

/**
 * Écrit uniquement les champs cochés dans le CV (masquer ≠ supprimer).
 * @param {object|null|undefined} cv
 * @param {Record<string, string>} values
 * @param {Record<string, boolean>} fields
 * @returns {object}
 */
export function mergeHeaderComposerCv(cv, values, fields) {
  const next = cv && typeof cv === 'object' ? { ...cv } : {};
  for (const key of HEADER_COMPOSER_FIELD_KEYS) {
    if (!fields?.[key]) continue;
    const val = String(values?.[key] ?? '').trim();
    next[key] = val;
    // Écrire les miroirs EN en même temps pour que syncCvDualKeys
    // ne ressuscite pas un ancien first_name/last_name après clear FR.
    if (key === 'prenom') next.first_name = val;
    if (key === 'nom') next.last_name = val;
  }
  return syncCvDualKeys(next);
}

/**
 * @param {object|null|undefined} layout
 * @returns {string[]}
 */
export function collectHeaderBlockIds(layout) {
  return listAllBlocks(layout)
    .filter((b) => b?.type === 'identity' || b?.type === 'contact')
    .map((b) => b.id)
    .filter(Boolean);
}

/**
 * Construit les blocs partiels (avec x/y) pour une variante.
 * @param {{ variantId?: string, fields?: Record<string, boolean> }} options
 * @returns {object[]}
 */
export function buildHeaderComposerBlocks({ variantId = 'stacked', fields = {} } = {}) {
  const variant = resolveHeaderComposerVariant(variantId);
  const identityBind = selectedIdentityBinds(fields);
  const contactBind = selectedContactBinds(fields);
  const blocks = [];

  if (!identityBind.length && !contactBind.length) {
    return blocks;
  }

  let y = PAGE_MARGIN_MM;

  if (identityBind.length) {
    /** @type {Record<string, unknown>} */
    const style = { align: 'left' };
    if (variant.id === 'inline_title') {
      style.header_layout = 'inline-title';
      style.title_accent = true;
      style.identity_divider = true;
    } else if (variant.id === 'header_bar') {
      style.identity_divider = true;
    } else {
      style.identity_divider = false;
    }

    blocks.push({
      type: 'identity',
      bind: [...identityBind],
      x: PAGE_MARGIN_MM,
      y,
      w: W,
      h: 28,
      style,
    });
    y += 28 + 4;
  }

  if (contactBind.length) {
    /** @type {Record<string, unknown>} */
    const style = {
      contact_icons: variant.id === 'header_bar',
      contact_uppercase: false,
    };
    if (variant.id === 'header_bar') {
      style.contact_layout = 'header-bar';
      style.contact_divider = true;
    }

    blocks.push({
      type: 'contact',
      bind: [...contactBind],
      x: PAGE_MARGIN_MM,
      y,
      w: W,
      h: variant.id === 'header_bar' ? 14 : 18,
      style,
    });
  }

  return blocks;
}

/**
 * Remplace l’en-tête existant (1 instance) et place les nouveaux blocs.
 * @param {object} layout
 * @param {number} pageIndex
 * @param {{ variantId?: string, fields?: Record<string, boolean> }} options
 * @returns {{ layout: object, placedIds: string[] }}
 */
export function applyHeaderComposerToLayout(layout, pageIndex, options = {}) {
  const blocks = buildHeaderComposerBlocks(options);
  let next = removeBlocks(layout, collectHeaderBlockIds(layout));
  const placedIds = [];

  if (!blocks.length) {
    return { layout: next, placedIds };
  }

  const safePage =
    typeof pageIndex === 'number' && pageIndex >= 0 && pageIndex < (next?.pages?.length || 0)
      ? pageIndex
      : 0;

  for (const partial of blocks) {
    next = addBlockToPage(next, safePage, partial);
    const page = next.pages?.[safePage];
    const last = page?.blocks?.[page.blocks.length - 1];
    if (last?.id) placedIds.push(last.id);
  }

  return { layout: next, placedIds };
}
