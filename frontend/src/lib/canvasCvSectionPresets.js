/**
 * Presets d'insertion des sections CV sémantiques (AXE-31).
 *
 * Distingués des décorations (formes, texte libre, icônes, images) :
 * chaque preset se lie au CV de base via `bind`.
 */

import { PAGE_USABLE_WIDTH_MM } from './cvLayoutModelV3.js';

const W = PAGE_USABLE_WIDTH_MM;

/** @type {ReadonlyArray<{ type: string, label: string, description: string }>} */
export const CV_SECTION_ITEMS = Object.freeze([
  {
    type: 'identity',
    label: 'Identité',
    description: 'Nom, prénom et titre professionnel',
  },
  {
    type: 'photo',
    label: 'Photo',
    description: 'Photo de profil du CV',
  },
  {
    type: 'contact',
    label: 'Contact',
    description: 'Email, téléphone, LinkedIn',
  },
  {
    type: 'resume',
    label: 'Profil',
    description: 'Résumé / accroche',
  },
  {
    type: 'experiences',
    label: 'Expériences',
    description: 'Expérience professionnelle',
  },
  {
    type: 'formations',
    label: 'Formations',
    description: 'Parcours de formation',
  },
  {
    type: 'skills',
    label: 'Compétences',
    description: 'Compétences techniques',
  },
  {
    type: 'languages',
    label: 'Langues',
    description: 'Langues parlées',
  },
  {
    type: 'certifications',
    label: 'Certifications',
    description: 'Certifications et diplômes',
  },
  {
    type: 'projets',
    label: 'Projets',
    description: 'Projets mis en avant',
  },
]);

const PRESETS_BY_TYPE = Object.freeze({
  identity: {
    type: 'identity',
    bind: ['prenom', 'nom', 'titre_professionnel'],
    w: W,
    h: 28,
    style: { align: 'left' },
  },
  photo: {
    type: 'photo',
    w: 28,
    h: 28,
    style: { shape: 'circle' },
  },
  contact: {
    type: 'contact',
    bind: ['email', 'telephone', 'linkedin'],
    w: W,
    h: 18,
    style: { contact_icons: false },
  },
  resume: {
    type: 'resume',
    bind: 'resume',
    w: W,
    h: 24,
    style: { section_label: 'PROFIL' },
  },
  experiences: {
    type: 'experiences',
    bind: 'experiences',
    w: W,
    h: 80,
    style: { section_label: 'EXPÉRIENCE PROFESSIONNELLE', format: 'compact' },
  },
  formations: {
    type: 'formations',
    bind: 'formations',
    w: W,
    h: 30,
    style: { section_label: 'FORMATION' },
  },
  skills: {
    type: 'skills',
    bind: 'competences.techniques',
    w: W,
    h: 22,
    style: { section_label: 'COMPÉTENCES', format: 'chips' },
  },
  languages: {
    type: 'languages',
    bind: 'langues',
    w: W,
    h: 18,
    style: { section_label: 'LANGUES' },
  },
  certifications: {
    type: 'certifications',
    bind: 'certifications',
    w: W,
    h: 24,
    style: { section_label: 'CERTIFICATIONS', list_format: 'list' },
  },
  projets: {
    type: 'projets',
    bind: 'projets',
    w: W,
    h: 28,
    style: { section_label: 'PROJETS' },
  },
});

/**
 * Fabrique un bloc partiel prêt pour placement (sans x/y/z).
 * @param {string} type
 * @returns {object|null}
 */
export function createCvSectionBlockPreset(type) {
  const preset = PRESETS_BY_TYPE[type];
  if (!preset) return null;
  return {
    ...preset,
    style: { ...(preset.style || {}) },
    ...(Array.isArray(preset.bind) ? { bind: [...preset.bind] } : {}),
  };
}
