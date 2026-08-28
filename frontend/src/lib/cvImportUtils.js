/**
 * Utilitaires partagés pour l'import CV (fichier / texte).
 */
import { defaultCv } from '../data/cvDefault.js';
import { syncCvDualKeys } from './cvDualKey.js';

export const CV_IMPORT_SCALAR_KEYS = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom' },
  { key: 'email', label: 'Email' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'ville', label: 'Ville' },
  { key: 'titre_professionnel', label: 'Titre professionnel' },
  { key: 'resume', label: 'Résumé / Accroche' },
  { key: 'photo_url', label: 'Photo' },
];

export const CV_IMPORT_SECTION_KEYS = [
  { key: 'experiences', label: 'Expériences' },
  { key: 'formations', label: 'Formations' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'competences', label: 'Compétences' },
  { key: 'projets', label: 'Projets' },
];

export const CV_IMPORT_STEPS = [
  'Lecture du document',
  'Extraction du texte',
  'Analyse IA du contenu',
  'Analyse visuelle de la mise en page',
  'Placement des blocs et couleurs',
  'Finalisation du canvas',
];

/** Étapes affichées à la création de compte (pas de canvas / vision). */
export const ONBOARDING_IMPORT_STEPS = [
  'Lecture du document',
  'Extraction du texte',
  'Analyse IA du contenu',
  'Structuration du profil',
  'Finalisation',
];

export const CV_IMPORT_STEP_DURATION_MS = 1600;
/** Dernière étape animée avant confirmation API (reste sur « Placement… »). */
export const CV_IMPORT_ANIMATION_HOLD_STEP = CV_IMPORT_STEPS.length - 2;

export function formatScalarPreviewForPrivacy(fieldKey, value, maxLen) {
  if (fieldKey === 'photo_url') {
    const v = String(value ?? '').trim();
    return v ? '(photo)' : '-';
  }
  const s = (value ?? '').toString();
  return s.slice(0, maxLen) + (s.length > maxLen ? '…' : '');
}

function sectionHasImportedContent(imported, key) {
  if (Array.isArray(imported)) return imported.length > 0;
  if (!imported || typeof imported !== 'object') return false;
  if (key === 'competences') {
    const c = imported;
    return Boolean(
      (c.techniques || []).some(Boolean)
      || (c.logiciels || []).some(Boolean)
      || (c.langues || []).length
      || (c.autres || []).some(Boolean),
    );
  }
  return Object.keys(imported).length > 0;
}

function sectionHasCurrentContent(current, key) {
  if (Array.isArray(current)) {
    return current.some((e) => (
      (e?.poste || e?.entreprise || e?.diplome || e?.nom
        || (e?.bullet_points && e.bullet_points.some(Boolean)))
    ));
  }
  if (current && typeof current === 'object' && key === 'competences') {
    return Boolean(
      (current.techniques || []).some(Boolean)
      || (current.logiciels || []).some(Boolean),
    );
  }
  return false;
}

/** Construit les choix de fusion import / profil existant. */
export function buildImportMergeChoices(cv, parsed) {
  const choices = {};
  if (!parsed || typeof parsed !== 'object') return choices;
  const base = cv || {};

  CV_IMPORT_SCALAR_KEYS.forEach(({ key }) => {
    const importedVal = parsed[key];
    if (importedVal === undefined || importedVal === null || String(importedVal).trim() === '') return;
    const currentVal = (base[key] ?? '').toString().trim();
    const importedStr = String(importedVal).trim();
    if (currentVal === importedStr) return;
    choices[key] = currentVal === '' ? 'add' : 'keep';
  });

  CV_IMPORT_SECTION_KEYS.forEach(({ key }) => {
    const imported = parsed[key];
    if (!sectionHasImportedContent(imported, key)) return;
    const current = base[key];
    try {
      if (JSON.stringify(imported) === JSON.stringify(current)) return;
    } catch {
      /* fragment non sérialisable */
    }
    choices[key] = sectionHasCurrentContent(current, key) ? 'keep' : 'replace';
  });

  return choices;
}

/** Applique les choix de fusion sur le CV courant. */
export function applyImportMergeChoices(cv, parsed, choices) {
  const next = { ...defaultCv(), ...cv };
  if (!parsed) return next;

  CV_IMPORT_SCALAR_KEYS.forEach(({ key }) => {
    const choice = choices[key];
    if (choice === 'add' || choice === 'replace') next[key] = parsed[key] ?? next[key];
  });

  CV_IMPORT_SECTION_KEYS.forEach(({ key }) => {
    if (choices[key] === 'replace' && parsed[key] !== undefined) {
      next[key] = Array.isArray(parsed[key])
        ? [...parsed[key]]
        : (typeof parsed[key] === 'object' && parsed[key] !== null
          ? { ...parsed[key] }
          : parsed[key]);
    }
  });

  return next;
}

/** Timers d'animation des étapes d'import (retourne une fonction cleanup). */
/** Extrait CV + layout + hints depuis la réponse API import. */
export function extractImportApiResponse(result) {
  if (!result || typeof result !== 'object') {
    return {
      cv: null,
      layoutHints: {},
      visionLayout: null,
      visionMeta: {},
      importPolicy: null,
      semanticMeta: null,
      blockAnnotations: [],
    };
  }
  const cv = result.cv && typeof result.cv === 'object' ? result.cv : result;
  const layoutHints = result.layout_hints && typeof result.layout_hints === 'object'
    ? result.layout_hints
    : {};
  const visionLayout = result.layout && typeof result.layout === 'object'
    ? result.layout
    : null;
  const visionMeta = result.vision && typeof result.vision === 'object'
    ? result.vision
    : {};
  const importPolicy = result.import_policy && typeof result.import_policy === 'object'
    ? result.import_policy
    : null;
  const semanticMeta = result.semantic_meta && typeof result.semantic_meta === 'object'
    ? result.semantic_meta
    : null;
  const blockAnnotations = Array.isArray(result.block_annotations)
    ? result.block_annotations
    : (Array.isArray(visionLayout?.semantic_annotations)
      ? visionLayout.semantic_annotations
      : []);
  return {
    cv,
    layoutHints,
    visionLayout,
    visionMeta,
    importPolicy,
    semanticMeta,
    blockAnnotations,
  };
}

/**
 * Normalise un CV importé : remplacement intégral (pas de fusion champ par champ).
 * Les champs absents du parse sont vidés ; la structure reste valide.
 */
export function cvFromImportPayload(parsed) {
  const base = defaultCv();
  const src = parsed?.cv && typeof parsed.cv === 'object' ? parsed.cv : parsed;
  if (!src || typeof src !== 'object') return { ...base };

  // Certains parsers renvoient identity/contact imbriqués (dual-key / schema API).
  const identity = src.identity && typeof src.identity === 'object' ? src.identity : {};
  const contact = src.contact && typeof src.contact === 'object' ? src.contact : {};

  const competences = src.competences && typeof src.competences === 'object'
    ? src.competences
    : {};

  const prenom = String(
    src.prenom ?? src.first_name ?? identity.prenom ?? identity.first_name ?? '',
  ).trim();
  const nom = String(
    src.nom ?? src.last_name ?? identity.nom ?? identity.last_name ?? '',
  ).trim();

  return syncCvDualKeys({
    ...base,
    prenom,
    nom,
    first_name: String(src.first_name ?? identity.first_name ?? prenom).trim() || prenom,
    last_name: String(src.last_name ?? identity.last_name ?? nom).trim() || nom,
    email: String(src.email ?? contact.email ?? '').trim(),
    telephone: String(src.telephone ?? contact.telephone ?? contact.phone ?? '').trim(),
    linkedin: String(src.linkedin ?? contact.linkedin ?? '').trim(),
    ville: String(src.ville ?? contact.ville ?? contact.city ?? '').trim(),
    titre_professionnel: String(
      src.titre_professionnel ?? identity.titre_professionnel ?? identity.title ?? '',
    ).trim(),
    resume: String(src.resume ?? '').trim(),
    photo_url: String(src.photo_url ?? identity.photo_url ?? '').trim(),
    experiences: Array.isArray(src.experiences) ? src.experiences : [],
    formations: Array.isArray(src.formations) ? src.formations : [],
    certifications: Array.isArray(src.certifications) ? src.certifications : [],
    projets: Array.isArray(src.projets) ? src.projets : [],
    competences: {
      techniques: Array.isArray(competences.techniques) ? competences.techniques : [],
      logiciels: Array.isArray(competences.logiciels) ? competences.logiciels : [],
      langues: Array.isArray(competences.langues) ? competences.langues : [],
      autres: Array.isArray(competences.autres) ? competences.autres : [],
    },
  });
}

export function startImportLoadingAnimation(setImportStepIndex, options = {}) {
  const steps = Array.isArray(options.steps) && options.steps.length
    ? options.steps
    : CV_IMPORT_STEPS;
  const holdStep = typeof options.holdStep === 'number'
    ? options.holdStep
    : Math.max(0, steps.length - 2);
  setImportStepIndex(0);
  const stepTimer = setInterval(() => {
    setImportStepIndex((i) => (i >= holdStep ? i : i + 1));
  }, CV_IMPORT_STEP_DURATION_MS);
  return () => clearInterval(stepTimer);
}

/** Passe à l'étape « Finalisation » une fois l'import API terminé. */
export function finishImportLoadingAnimation(setImportStepIndex, options = {}) {
  const steps = Array.isArray(options.steps) && options.steps.length
    ? options.steps
    : CV_IMPORT_STEPS;
  setImportStepIndex(Math.max(0, steps.length - 1));
}

/** True si l’import n’a presque rien extrait (identité / exp / formation vides). */
export function isSparseImportedCv(cv) {
  if (!cv || typeof cv !== 'object') return true;
  const hasIdentity = Boolean(
    String(cv.prenom || '').trim()
    || String(cv.nom || '').trim()
    || String(cv.titre_professionnel || '').trim(),
  );
  const hasExp = (cv.experiences || []).some((row) => (
    String(row?.poste || '').trim() || String(row?.entreprise || '').trim()
  ));
  const hasForm = (cv.formations || []).some((row) => (
    String(row?.diplome || row?.intitule || '').trim()
  ));
  return !hasIdentity && !hasExp && !hasForm;
}

export function onboardingImportErrorMessage(err) {
  const status = err?.status;
  const fallback = String(err?.message || '').trim();
  if (status === 429) {
    return fallback || 'Quota temporairement atteint. Réessaie dans un instant.';
  }
  if (status === 502) {
    return fallback || 'L’analyse n’a pas abouti. Réessaie, ou colle le texte de ton CV.';
  }
  if (status === 400) {
    return fallback || 'Impossible de lire ce fichier. Essaie un PDF texte, un Word, ou le copier-coller.';
  }
  return fallback || 'Impossible d’analyser le CV. Réessaie ou saisis ton profil à la main.';
}
