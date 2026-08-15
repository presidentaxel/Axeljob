/**
 * Composers guidés pour sections CV hors en-tête (AXE-340).
 * Pattern : design variants + prefill `cv` → place 1 instance → free-edit.
 */

import { syncCvDualKeys } from './cvDualKey.js';
import { generateItemId, findSectionSchema } from './cvSectionOps.js';
import {
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  addBlockToPage,
  listAllBlocks,
  removeBlocks,
} from './cvLayoutModelV3.js';

const W = PAGE_USABLE_WIDTH_MM;

/** @typedef {'contact'|'resume'|'experiences'|'formations'|'skills'|'languages'|'certifications'|'projets'|'photo'} SectionComposerType */

/** @type {ReadonlyArray<SectionComposerType>} */
export const SECTION_COMPOSER_TYPES = Object.freeze([
  'contact',
  'resume',
  'experiences',
  'formations',
  'skills',
  'languages',
  'certifications',
  'projets',
  'photo',
]);

export const SECTION_COMPOSER_META = Object.freeze({
  contact: {
    label: 'Contact',
    title: 'Bloc contact',
    hint: 'Email, téléphone, LinkedIn — design + champs, puis free-edit.',
    kind: 'fields',
  },
  resume: {
    label: 'Profil',
    title: 'Profil / accroche',
    hint: 'Rédige ton résumé, choisis un style, place le bloc.',
    kind: 'text',
  },
  experiences: {
    label: 'Expériences',
    title: 'Expériences professionnelles',
    hint: 'Renseigne tes postes, choisis un format, place la section.',
    kind: 'list',
  },
  formations: {
    label: 'Formations',
    title: 'Formations',
    hint: 'Diplômes et établissements — design + contenu.',
    kind: 'list',
  },
  skills: {
    label: 'Compétences',
    title: 'Compétences techniques',
    hint: 'Une compétence par ligne — chips ou liste.',
    kind: 'skills',
  },
  languages: {
    label: 'Langues',
    title: 'Langues',
    hint: 'Langue + niveau — place la section.',
    kind: 'languages',
  },
  certifications: {
    label: 'Certifications',
    title: 'Certifications',
    hint: 'Nom, organisme, date.',
    kind: 'list',
  },
  projets: {
    label: 'Projets',
    title: 'Projets',
    hint: 'Nom et description des projets mis en avant.',
    kind: 'list',
  },
  photo: {
    label: 'Photo',
    title: 'Photo de profil',
    hint: 'Place le cadre photo (upload ensuite sur le canvas).',
    kind: 'photo',
  },
});

/** @type {ReadonlyArray<'email'|'telephone'|'linkedin'>} */
export const CONTACT_COMPOSER_FIELDS = Object.freeze(['email', 'telephone', 'linkedin']);

export const CONTACT_COMPOSER_FIELD_LABELS = Object.freeze({
  email: 'Email',
  telephone: 'Téléphone',
  linkedin: 'LinkedIn',
});

const LIST_ITEM_FIELDS = Object.freeze({
  experiences: Object.freeze([
    { key: 'poste', label: 'Poste' },
    { key: 'entreprise', label: 'Entreprise' },
    { key: 'date_debut', label: 'Début' },
    { key: 'date_fin', label: 'Fin' },
    { key: 'lieu', label: 'Lieu' },
  ]),
  formations: Object.freeze([
    { key: 'diplome', label: 'Diplôme' },
    { key: 'etablissement', label: 'Établissement' },
    { key: 'date', label: 'Date' },
  ]),
  certifications: Object.freeze([
    { key: 'nom', label: 'Nom' },
    { key: 'organisme', label: 'Organisme' },
    { key: 'date', label: 'Date' },
  ]),
  projets: Object.freeze([
    { key: 'nom', label: 'Nom' },
    { key: 'description', label: 'Description', multiline: true },
  ]),
});

/** @type {Record<SectionComposerType, ReadonlyArray<{ id: string, label: string, description: string }>>} */
export const SECTION_COMPOSER_VARIANTS = Object.freeze({
  contact: Object.freeze([
    { id: 'stacked', label: 'Empilé', description: 'Lignes contact classiques' },
    { id: 'header_bar', label: 'Barre', description: 'Bandeau horizontal + icônes' },
  ]),
  resume: Object.freeze([
    { id: 'classic', label: 'Classique', description: 'Titre + paragraphe' },
    { id: 'italic', label: 'Italique', description: 'Accroche en italique' },
  ]),
  experiences: Object.freeze([
    { id: 'compact', label: 'Compact', description: 'Format dense ATS-friendly' },
    { id: 'detailed', label: 'Détaillé', description: 'Plus d’air, labels nets' },
  ]),
  formations: Object.freeze([
    { id: 'classic', label: 'Classique', description: 'Liste standard' },
    { id: 'compact', label: 'Compact', description: 'Hauteur réduite' },
  ]),
  skills: Object.freeze([
    { id: 'chips', label: 'Chips', description: 'Puces / tags' },
    { id: 'list', label: 'Liste', description: 'Une ligne par compétence' },
  ]),
  languages: Object.freeze([
    { id: 'classic', label: 'Classique', description: 'Langue — niveau' },
    { id: 'compact', label: 'Compact', description: 'Bloc court' },
  ]),
  certifications: Object.freeze([
    { id: 'classic', label: 'Classique', description: 'Titre standard, bloc aéré' },
    { id: 'underline', label: 'Souligné', description: 'Titre accent + hauteur compacte' },
  ]),
  projets: Object.freeze([
    { id: 'classic', label: 'Classique', description: 'Nom + description' },
    { id: 'compact', label: 'Compact', description: 'Hauteur réduite' },
  ]),
  photo: Object.freeze([
    { id: 'circle', label: 'Ronde', description: 'Cadre circulaire' },
    { id: 'square', label: 'Carrée', description: 'Cadre carré' },
  ]),
});

/**
 * @param {SectionComposerType} type
 * @param {string} variantId
 */
export function resolveSectionComposerVariant(type, variantId) {
  const list = SECTION_COMPOSER_VARIANTS[type] || [];
  return list.find((v) => v.id === variantId) || list[0] || { id: 'classic', label: 'Classique', description: '' };
}

/**
 * @param {SectionComposerType} type
 */
export function getListItemFields(type) {
  return LIST_ITEM_FIELDS[type] || [];
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.name || item.label || item.value || item.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * Prefill state for a section composer.
 * @param {SectionComposerType} type
 * @param {object|null|undefined} cv
 */
export function defaultSectionComposerState(type, cv) {
  const variantId = (SECTION_COMPOSER_VARIANTS[type] || [])[0]?.id || 'classic';

  if (type === 'contact') {
    const values = {
      email: String(cv?.email || '').trim(),
      telephone: String(cv?.telephone || '').trim(),
      linkedin: String(cv?.linkedin || '').trim(),
    };
    const fields = {
      email: Boolean(values.email),
      telephone: Boolean(values.telephone),
      linkedin: Boolean(values.linkedin),
    };
    if (!fields.email && !fields.telephone && !fields.linkedin) {
      fields.email = true;
    }
    return { variantId, values, fields, items: [], skillsText: '', text: '' };
  }

  if (type === 'resume') {
    return {
      variantId,
      text: String(cv?.resume || '').trim(),
      values: {},
      fields: {},
      items: [],
      skillsText: '',
    };
  }

  if (type === 'skills') {
    const skills = asStringList(cv?.competences?.techniques);
    return {
      variantId,
      skillsText: skills.join('\n'),
      text: '',
      values: {},
      fields: {},
      items: [],
    };
  }

  if (type === 'languages') {
    const raw = Array.isArray(cv?.competences?.langues) ? cv.competences.langues : [];
    const items = raw.length
      ? raw.map((row) => ({
        id: row?.id || generateItemId('lang'),
        langue: String(row?.langue || '').trim(),
        niveau: String(row?.niveau || '').trim(),
      }))
      : [{ id: generateItemId('lang'), langue: '', niveau: '' }];
    return { variantId, items, text: '', values: {}, fields: {}, skillsText: '' };
  }

  if (type === 'photo') {
    return { variantId, text: '', values: {}, fields: {}, items: [], skillsText: '' };
  }

  const schema = findSectionSchema(type);
  const raw = Array.isArray(cv?.[type]) ? cv[type] : [];
  const items = raw.length
    ? raw.map((row) => ({ ...(row && typeof row === 'object' ? row : {}), id: row?.id || generateItemId(schema?.idPrefix || 'item') }))
    : schema
      ? [schema.createItem(generateItemId(schema.idPrefix))]
      : [];

  return { variantId, items, text: '', values: {}, fields: {}, skillsText: '' };
}

/**
 * @param {SectionComposerType} type
 * @param {object|null|undefined} cv
 * @param {object} state
 */
export function mergeSectionComposerCv(type, cv, state) {
  const next = cv && typeof cv === 'object' ? { ...cv } : {};

  if (type === 'contact') {
    for (const key of CONTACT_COMPOSER_FIELDS) {
      if (!state?.fields?.[key]) continue;
      next[key] = String(state?.values?.[key] ?? '').trim();
    }
    return syncCvDualKeys(next);
  }

  if (type === 'resume') {
    next.resume = String(state?.text ?? '').trim();
    return syncCvDualKeys(next);
  }

  if (type === 'skills') {
    const lines = String(state?.skillsText || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    next.competences = {
      ...(next.competences && typeof next.competences === 'object' ? next.competences : {}),
      techniques: lines.length ? lines : [''],
    };
    return syncCvDualKeys(next);
  }

  if (type === 'languages') {
    const items = Array.isArray(state?.items) ? state.items : [];
    next.competences = {
      ...(next.competences && typeof next.competences === 'object' ? next.competences : {}),
      langues: items.map((row) => ({
        langue: String(row?.langue || '').trim(),
        niveau: String(row?.niveau || '').trim(),
      })),
    };
    return syncCvDualKeys(next);
  }

  if (type === 'photo') {
    return syncCvDualKeys(next);
  }

  const schema = findSectionSchema(type);
  if (!schema) return syncCvDualKeys(next);
  const items = Array.isArray(state?.items) ? state.items : [];
  next[type] = items.map((row) => {
    const base = schema.createItem(row?.id || generateItemId(schema.idPrefix));
    return { ...base, ...(row && typeof row === 'object' ? row : {}) };
  });
  return syncCvDualKeys(next);
}

/**
 * @param {object|null|undefined} layout
 * @param {string} blockType
 */
export function collectSectionBlockIds(layout, blockType) {
  return listAllBlocks(layout)
    .filter((b) => b?.type === blockType)
    .map((b) => b.id)
    .filter(Boolean);
}

/**
 * @param {object|null|undefined} layout
 * @param {string} blockType
 * @returns {{ pageIndex: number, x: number, y: number, w?: number }|null}
 */
function findExistingSectionPlacement(layout, blockType) {
  if (!layout || !Array.isArray(layout.pages)) return null;
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const blocks = layout.pages[pageIndex]?.blocks || [];
    for (const block of blocks) {
      if (block?.type !== blockType) continue;
      return {
        pageIndex,
        x: typeof block.x === 'number' ? block.x : PAGE_MARGIN_MM,
        y: typeof block.y === 'number' ? block.y : PAGE_MARGIN_MM,
        w: typeof block.w === 'number' ? block.w : undefined,
      };
    }
  }
  return null;
}

/**
 * @param {object|null|undefined} layout
 * @param {number} fallbackH
 */
function resolveAppendPlacementY(layout, fallbackH = 24) {
  const all = listAllBlocks(layout);
  if (!all.length) return PAGE_MARGIN_MM;
  const maxBottom = Math.max(
    ...all.map((b) => (typeof b.y === 'number' ? b.y : 0) + (typeof b.h === 'number' ? b.h : fallbackH)),
  );
  return maxBottom + 4;
}

/**
 * @param {SectionComposerType} type
 * @param {{ variantId?: string, fields?: Record<string, boolean> }} options
 */
export function buildSectionComposerBlock(type, options = {}) {
  const variant = resolveSectionComposerVariant(type, options.variantId);

  if (type === 'contact') {
    const bind = CONTACT_COMPOSER_FIELDS.filter((key) => options.fields?.[key]);
    if (!bind.length) return null;
    /** @type {Record<string, unknown>} */
    const style = {
      contact_icons: variant.id === 'header_bar',
      contact_uppercase: false,
      section_label: 'CONTACT',
    };
    if (variant.id === 'header_bar') {
      style.contact_layout = 'header-bar';
      style.contact_divider = true;
    }
    return {
      type: 'contact',
      bind: [...bind],
      w: W,
      h: variant.id === 'header_bar' ? 14 : 18,
      style,
    };
  }

  if (type === 'resume') {
    return {
      type: 'resume',
      bind: 'resume',
      w: W,
      h: 28,
      style: {
        section_label: 'PROFIL',
        font_style: variant.id === 'italic' ? 'italic' : undefined,
        italic: variant.id === 'italic',
      },
    };
  }

  if (type === 'experiences') {
    return {
      type: 'experiences',
      bind: 'experiences',
      w: W,
      h: variant.id === 'detailed' ? 96 : 80,
      style: {
        section_label: 'EXPÉRIENCE PROFESSIONNELLE',
        format: 'compact',
        exp_style: variant.id === 'detailed' ? 'bold' : undefined,
      },
    };
  }

  if (type === 'formations') {
    return {
      type: 'formations',
      bind: 'formations',
      w: W,
      h: variant.id === 'compact' ? 24 : 30,
      style: { section_label: 'FORMATION' },
    };
  }

  if (type === 'skills') {
    return {
      type: 'skills',
      bind: 'competences.techniques',
      w: W,
      h: 22,
      style: {
        section_label: 'COMPÉTENCES',
        format: variant.id === 'list' ? 'list' : 'chips',
        list_format: variant.id === 'list' ? 'list' : undefined,
      },
    };
  }

  if (type === 'languages') {
    return {
      type: 'languages',
      bind: 'langues',
      w: W,
      h: variant.id === 'compact' ? 14 : 18,
      style: { section_label: 'LANGUES' },
    };
  }

  if (type === 'certifications') {
    const compact = variant.id === 'underline';
    return {
      type: 'certifications',
      bind: 'certifications',
      w: W,
      h: compact ? 18 : 28,
      style: {
        section_label: 'CERTIFICATIONS',
        title_style: compact ? 'underline-accent' : 'classic-main',
      },
    };
  }

  if (type === 'projets') {
    return {
      type: 'projets',
      bind: 'projets',
      w: W,
      h: variant.id === 'compact' ? 22 : 28,
      style: { section_label: 'PROJETS' },
    };
  }

  if (type === 'photo') {
    return {
      type: 'photo',
      w: 28,
      h: 28,
      style: { shape: variant.id === 'square' ? 'square' : 'circle' },
    };
  }

  return null;
}

/**
 * @param {SectionComposerType} type
 * @param {object} state
 */
export function canPlaceSectionComposer(type, state) {
  if (type === 'contact') {
    return CONTACT_COMPOSER_FIELDS.some((key) => state?.fields?.[key]);
  }
  if (type === 'photo') return true;
  if (type === 'resume') return true;
  if (type === 'skills') return true;
  if (type === 'languages') return Array.isArray(state?.items) && state.items.length > 0;
  return Array.isArray(state?.items) && state.items.length > 0;
}

/**
 * Remplace l’instance existante du type et place le nouveau bloc.
 * Conserve x/y/page de l’instance précédente (1 instance, pas de jump).
 * @param {object} layout
 * @param {number} pageIndex
 * @param {SectionComposerType} type
 * @param {{ variantId?: string, fields?: Record<string, boolean> }} options
 */
export function applySectionComposerToLayout(layout, pageIndex, type, options = {}) {
  const partial = buildSectionComposerBlock(type, options);
  const placedIds = [];
  if (!partial) return { layout, placedIds };

  // Capturer la position AVANT remove — sinon resolvePlacementY ne voit plus le bloc.
  const previous = findExistingSectionPlacement(layout, type);
  let next = removeBlocks(layout, collectSectionBlockIds(layout, type));

  const y = previous ? previous.y : resolveAppendPlacementY(next, partial.h || 24);
  const x = previous ? previous.x : PAGE_MARGIN_MM;
  const pageCount = next?.pages?.length || 0;
  let safePage = previous ? previous.pageIndex : pageIndex;
  if (typeof safePage !== 'number' || safePage < 0 || safePage >= pageCount) {
    safePage = 0;
  }

  next = addBlockToPage(next, safePage, {
    ...partial,
    x,
    y,
    ...(typeof previous?.w === 'number' ? { w: previous.w } : {}),
  });
  const page = next.pages?.[safePage];
  const last = page?.blocks?.[page.blocks.length - 1];
  if (last?.id) placedIds.push(last.id);
  return { layout: next, placedIds };
}

/**
 * @param {SectionComposerType} type
 */
export function createEmptyComposerItem(type) {
  if (type === 'languages') {
    return { id: generateItemId('lang'), langue: '', niveau: '' };
  }
  const schema = findSectionSchema(type);
  if (!schema) return { id: generateItemId('item') };
  return schema.createItem(generateItemId(schema.idPrefix));
}
