/**
 * Schema des champs de l inspecteur de bloc canvas (P3.6).
 * Pur : definit quels champs afficher selon le type de bloc.
 */

import { isNonSemanticBlockType, isSemanticBlockType } from './cvLayoutModelV3.js';

const TYPE_LABELS = Object.freeze({
  identity: 'Identité',
  photo: 'Photo',
  contact: 'Contact',
  resume: 'Profil',
  experiences: 'Expériences',
  formations: 'Formations',
  certifications: 'Certifications',
  projets: 'Projets',
  skills: 'Compétences',
  languages: 'Langues',
  text: 'Texte libre',
  title: 'Titre',
  image: 'Image',
  'shape:line': 'Trait',
  'shape:rect': 'Rectangle',
  'shape:frame': 'Cadre',
  'shape:circle': 'Cercle',
  'shape:ellipse': 'Ellipse',
  'shape:triangle': 'Triangle',
  'shape:diamond': 'Losange',
  'shape:star': 'Étoile',
  'shape:hexagon': 'Hexagone',
  'shape:arrow-right': 'Flèche',
  'shape:arrow-left': 'Flèche',
  'shape:arrow-up': 'Flèche',
  'shape:arrow-down': 'Flèche',
  'shape:cross': 'Croix',
  'shape:heart': 'Cœur',
  icon: 'Icône',
  qrcode: 'QR code',
});

export function getBlockTypeLabel(type) {
  return TYPE_LABELS[type] || type || 'Bloc';
}

/**
 * Nom affiché dans le panneau calques (label custom ou type).
 * @param {object|null|undefined} block
 * @returns {string}
 */
export function getBlockDisplayName(block) {
  if (!block || typeof block !== 'object') return 'Bloc';
  const custom = block.style?.layer_label;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return getBlockTypeLabel(block.type);
}

/** Champs position / taille (tous les blocs). */
export const BLOCK_GEOMETRY_FIELDS = Object.freeze([
  { key: 'x', label: 'X (mm)', min: 0, max: 210, step: 0.5 },
  { key: 'y', label: 'Y (mm)', min: 0, max: 297, step: 0.5 },
  { key: 'w', label: 'Largeur (mm)', min: 5, max: 210, step: 0.5 },
  { key: 'h', label: 'Hauteur (mm)', min: 3, max: 297, step: 0.5 },
  { key: 'z', label: 'Plan (z-index)', min: 0, max: 999, step: 1 },
]);

/**
 * Champs de contenu editable (non semantique principalement).
 */
export function getBlockContentFields(block) {
  if (!block || typeof block !== 'object') return [];
  const fields = [];
  if (typeof block.content === 'string' || isNonSemanticBlockType(block.type)) {
    if (block.type === 'text' || block.type === 'title') {
      fields.push({ key: 'content', label: 'Texte', input: 'textarea' });
    }
  }
  if (block.type === 'icon') {
    fields.push({
      key: 'icon_name',
      label: 'Nom icône (react-icons/hi2)',
      input: 'text',
      placeholder: 'HiPhone',
    });
  }
  if (block.type === 'qrcode') {
    fields.push({
      key: 'target_url',
      label: 'URL cible',
      input: 'text',
      placeholder: 'https://',
    });
  }
  if (block.type === 'experiences' || block.type === 'formations' || block.type === 'certifications' || block.type === 'projets') {
    fields.push({
      key: 'limit',
      label: 'Nombre max d’éléments',
      input: 'number',
      min: 1,
      max: 30,
      step: 1,
    });
  }
  return fields;
}

/**
 * Champs de style (cle dans block.style).
 */
export function getBlockStyleFields(block) {
  if (!block || typeof block !== 'object') return [];
  const { type } = block;
  const fields = [];

  if (type === 'text' || type === 'title' || type === 'identity') {
    fields.push({
      styleKey: 'align',
      label: 'Alignement',
      input: 'select',
      choices: [
        { value: 'left', label: 'Gauche' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Droite' },
      ],
    });
  }
  if (type === 'text') {
    fields.push({
      styleKey: 'font_size',
      label: 'Taille (pt)',
      input: 'number',
      min: 6,
      max: 24,
      step: 0.5,
    });
    fields.push({
      styleKey: 'italic',
      label: 'Italique',
      input: 'boolean',
    });
  }
  if (type === 'title' || type === 'shape:line' || type === 'shape:rect') {
    fields.push({
      styleKey: 'color',
      label: 'Couleur',
      input: 'color',
    });
  }
  if (type === 'shape:rect') {
    fields.push({
      styleKey: 'bg',
      label: 'Fond',
      input: 'color',
    });
  }
  if (type === 'photo') {
    fields.push({
      styleKey: 'shape',
      label: 'Forme',
      input: 'select',
      choices: [
        { value: 'square', label: 'Carré' },
        { value: 'circle', label: 'Cercle' },
      ],
    });
  }
  if (type === 'experiences') {
    fields.push({
      styleKey: 'format',
      label: 'Format',
      input: 'select',
      choices: [
        { value: 'default', label: 'Détaillé' },
        { value: 'compact', label: 'Compact' },
      ],
    });
  }
  if (type === 'skills') {
    fields.push({
      styleKey: 'format',
      label: 'Format',
      input: 'select',
      choices: [
        { value: 'default', label: 'Liste' },
        { value: 'chips', label: 'Pastilles' },
      ],
    });
  }

  return fields;
}

export function blockHasEditableContent(block) {
  return getBlockContentFields(block).length > 0;
}

export function blockHasStyleFields(block) {
  return getBlockStyleFields(block).length > 0;
}

/** True si le bloc lie des donnees CV (bind) - contenu edite via onglet Contenu / guidé. */
export function blockIsSemanticBound(block) {
  return block && isSemanticBlockType(block.type);
}
