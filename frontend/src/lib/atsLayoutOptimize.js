/**
 * Optimisations ATS 1-clic sur layout v3 (AXE-37).
 *
 * Important : le score free_canvas lit l'ordre **spatial** (y puis x).
 * Un simple tri z-index ne suffit pas — on repositionne les blocs de contenu.
 */

import {
  listAllBlocks,
  PAGE_HEIGHT_MM,
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  addBlockToPage,
  removeBlocks,
} from './cvLayoutModelV3.js';
import { isVectorShapeType } from './canvasShapePresets.js';
import { createCvSectionBlockPreset } from './canvasCvSectionPresets.js';
import { generateItemId } from './cvSectionOps.js';

/** Ordre aligné sur `free_canvas._CANONICAL_READ_ORDER` (scorer ATS). */
export const SEMANTIC_READ_ORDER = [
  'identity',
  'contact',
  'photo',
  'resume',
  'experiences',
  'formations',
  'certifications',
  'skills',
  'languages',
  'projets',
];

const CONTENT_GAP_MM = 6;
const CONTACT_TOP_Y_MM = 40;
const ATS_SAFE_FALLBACK_FONT = 'Arial';
const ATS_SAFE_BODY_FONT_SIZE = 10;

function semanticRank(type) {
  const i = SEMANTIC_READ_ORDER.indexOf(type);
  return i >= 0 ? i : 50;
}

function visualLayerRank(type) {
  if (type === 'shape:rect' || isVectorShapeType(type)) return 0;
  if (type === 'shape:line') return 1;
  return 2;
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Blocs dont la position y impacte la lecture ATS. */
export function isAtsReadingContentBlock(block) {
  if (!block || typeof block !== 'object') return false;
  const type = block.type;
  if (typeof type !== 'string') return false;
  if (SEMANTIC_READ_ORDER.includes(type)) return true;
  return type === 'title' || type === 'text';
}

function isDecorativeBlock(block) {
  return !isAtsReadingContentBlock(block);
}

/**
 * Réordonne les calques (z) : décor derrière, contenu devant, ordre sémantique.
 * Ne touche pas x/y/w/h.
 */
export function optimizeLayoutReadingOrder(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = [...(page.blocks || [])];
    const sorted = [...blocks].sort((a, b) => {
      const la = visualLayerRank(a.type);
      const lb = visualLayerRank(b.type);
      if (la !== lb) return la - lb;
      const ra = semanticRank(a.type);
      const rb = semanticRank(b.type);
      if (ra !== rb) return ra - rb;
      return asNumber(a.y) - asNumber(b.y);
    });
    let z = 1;
    const nextBlocks = sorted.map((b) => ({ ...b, z: z++ }));
    return { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

/**
 * Remonte le bloc contact sous ~13 % de la hauteur A4 si trop bas.
 */
export function optimizeContactVerticalPosition(layout) {
  if (!layout?.pages?.length) return layout;
  const threshold = PAGE_HEIGHT_MM * 0.3;
  const pages = layout.pages.map((page) => {
    const blocks = (page.blocks || []).map((b) => {
      if (b.type !== 'contact') return b;
      if (asNumber(b.y) > threshold) {
        return { ...b, y: Math.min(asNumber(b.y), CONTACT_TOP_Y_MM) };
      }
      return b;
    });
    return { ...page, blocks };
  });
  return { ...layout, pages };
}

/**
 * Vraie réorganisation spatiale : empile le contenu en ordre ATS (y croissant).
 * Conserve x/w/h ; laisse les formes décoratives à leur place.
 */
export function optimizeLayoutSpatialOrder(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    const content = blocks.filter(isAtsReadingContentBlock);
    const decor = blocks.filter(isDecorativeBlock);
    if (content.length === 0) {
      return { ...page, blocks: [...blocks] };
    }

    const sorted = [...content].sort((a, b) => {
      const ra = semanticRank(a.type);
      const rb = semanticRank(b.type);
      if (ra !== rb) return ra - rb;
      return asNumber(a.y) - asNumber(b.y);
    });

    let cursorY = PAGE_MARGIN_MM;
    const relocated = sorted.map((block) => {
      const h = Math.max(asNumber(block.h, 10), 3);
      const next = { ...block, y: cursorY };
      cursorY += h + CONTENT_GAP_MM;
      return next;
    });

    return { ...page, blocks: [...decor, ...relocated] };
  });
  return { ...layout, pages };
}

/** Applique spatial + calques (pipeline ATS 1-clic).
 *
 * Pas de `optimizeContactVerticalPosition` ici : le stack spatial place déjà
 * le contact juste sous l'identité. Un yank à y=40 après coup chevaucherait
 * identity/photo et casserait l'ordre que le scorer attend.
 */
export function applyAtsLayoutOptimizations(layout) {
  let next = layout;
  next = optimizeLayoutSpatialOrder(next);
  next = optimizeLayoutReadingOrder(next);
  return next;
}

function cvText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function cvHasIdentity(cv) {
  return Boolean(
    cvText(cv?.prenom) || cvText(cv?.first_name) || cvText(cv?.nom) || cvText(cv?.last_name),
  );
}

function cvHasContact(cv) {
  return Boolean(cvText(cv?.email) || cvText(cv?.telephone) || cvText(cv?.phone));
}

function cvHasExperiences(cv) {
  for (const exp of cv?.experiences || []) {
    if (!exp || typeof exp !== 'object') continue;
    if (cvText(exp.poste) || cvText(exp.title) || cvText(exp.entreprise) || cvText(exp.company)) {
      return true;
    }
    if ((exp.bullet_points || []).some((b) => cvText(b))) return true;
  }
  return false;
}

function cvHasFormations(cv) {
  for (const form of cv?.formations || []) {
    if (!form || typeof form !== 'object') continue;
    if (cvText(form.diplome) || cvText(form.degree) || cvText(form.etablissement) || cvText(form.school)) {
      return true;
    }
  }
  return false;
}

function cvHasSkills(cv) {
  const competences = cv?.competences;
  if (!competences || typeof competences !== 'object') return false;
  for (const key of ['techniques', 'logiciels', 'autres']) {
    if ((competences[key] || []).some((x) => cvText(x))) return true;
  }
  return false;
}

function cvHasLanguages(cv) {
  const langues = cv?.competences?.langues || [];
  return langues.some((item) => {
    if (item && typeof item === 'object') return Boolean(cvText(item.langue));
    return Boolean(cvText(item));
  });
}

/** Types de sections attendus sur le canvas d’après le JSON sémantique (miroir backend). */
export function expectedProfileSectionTypesFromCv(cv) {
  const expected = [];
  if (cvHasIdentity(cv)) expected.push('identity');
  if (cvHasContact(cv)) expected.push('contact');
  if (cvHasExperiences(cv)) expected.push('experiences');
  if (cvHasFormations(cv)) expected.push('formations');
  if (cvHasSkills(cv)) expected.push('skills');
  if (cvHasLanguages(cv)) expected.push('languages');
  return expected;
}

/**
 * Ajoute les blocs sémantiques manquants (profil non affiché) puis restacke.
 * Free canvas uniquement.
 *
 * Si le CV n’a rien à afficher mais le canvas n’a aucun bloc sémantique
 * (`malus_free_canvas_no_semantic_blocks`), on pose un starter identity+contact
 * pour que « Corriger » change vraiment le layout (Bugbot AXE-333).
 */
export function optimizeAddMissingProfileSections(layout, cv) {
  if (!layout?.pages?.length || layout.grid !== 'free') return layout;
  const displayed = new Set(
    listAllBlocks(layout).map((b) => b?.type).filter(Boolean),
  );
  const hasSemantic = [...displayed].some((type) => SEMANTIC_READ_ORDER.includes(type));
  let expected = expectedProfileSectionTypesFromCv(cv || {});
  if (expected.length === 0) {
    if (hasSemantic) return layout;
    expected = ['identity', 'contact'];
  }
  const missing = expected.filter((type) => !displayed.has(type));
  if (missing.length === 0) return layout;

  let next = layout;
  const pageIndex = 0;
  const existing = listAllBlocks(next);
  let maxY = PAGE_MARGIN_MM;
  for (const block of existing) {
    const bottom = asNumber(block.y) + Math.max(asNumber(block.h, 10), 3);
    if (bottom > maxY) maxY = bottom;
  }
  let cursorY = maxY + CONTENT_GAP_MM;

  for (const type of missing) {
    const preset = createCvSectionBlockPreset(type);
    if (!preset) continue;
    const partial = {
      ...preset,
      id: generateItemId(`ats_${type}`),
      x: PAGE_MARGIN_MM,
      y: cursorY,
      w: preset.w || PAGE_USABLE_WIDTH_MM,
      h: preset.h || 20,
      z: existing.length + missing.indexOf(type) + 1,
    };
    next = addBlockToPage(next, pageIndex, partial);
    cursorY += asNumber(partial.h, 20) + CONTENT_GAP_MM;
  }

  return applyAtsLayoutOptimizations(next);
}

/** Masque la photo (theme + retire les blocs photo). */
export function optimizeHidePhoto(layout) {
  if (!layout) return layout;
  const photoIds = listAllBlocks(layout)
    .filter((b) => b?.type === 'photo')
    .map((b) => b.id)
    .filter(Boolean);
  let next = {
    ...layout,
    theme: { ...(layout.theme || {}), show_photo: false },
  };
  if (photoIds.length) {
    next = removeBlocks(next, photoIds);
  }
  return next;
}

/** Remplace les polices exotiques par une police ATS-safe. */
export function optimizeSafeFonts(layout) {
  if (!layout) return layout;
  return {
    ...layout,
    theme: {
      ...(layout.theme || {}),
      font_heading: ATS_SAFE_FALLBACK_FONT,
      font_body: ATS_SAFE_FALLBACK_FONT,
    },
  };
}

/** Ramène la taille de corps dans la plage ATS (10 pt). */
export function optimizeBodyFontSize(layout) {
  if (!layout) return layout;
  return {
    ...layout,
    theme: {
      ...(layout.theme || {}),
      font_size_body: ATS_SAFE_BODY_FONT_SIZE,
    },
  };
}

/** Force une seule colonne sur free canvas (même x) puis restacke. */
export function optimizeSingleColumnFreeCanvas(layout) {
  if (!layout?.pages?.length || layout.grid !== 'free') return layout;
  const pages = layout.pages.map((page) => {
    const blocks = (page.blocks || []).map((block) => {
      if (!isAtsReadingContentBlock(block)) return block;
      return {
        ...block,
        x: PAGE_MARGIN_MM,
        w: Math.min(asNumber(block.w, PAGE_USABLE_WIDTH_MM), PAGE_USABLE_WIDTH_MM),
      };
    });
    return { ...page, blocks };
  });
  return applyAtsLayoutOptimizations({ ...layout, pages });
}

/** Désactive la sidebar (templates figés) pour une lecture ATS linéaire. */
export function optimizeRemoveSidebar(layout) {
  if (!layout) return layout;
  const ratio = Number(layout.sidebar_ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return layout;
  return { ...layout, sidebar_ratio: 0 };
}

/**
 * Décrit les déplacements de blocs (pour le panneau avant/après).
 * @returns {Array<{ id: string, type: string, label: string, fromY: number, toY: number }>}
 */
export function describeAtsOptimizationChanges(beforeLayout, afterLayout) {
  if (!beforeLayout || !afterLayout) return [];
  const beforeById = new Map(
    listAllBlocks(beforeLayout).map((b) => [b.id, b]),
  );
  const changes = [];
  for (const after of listAllBlocks(afterLayout)) {
    if (!after?.id) continue;
    const before = beforeById.get(after.id);
    if (!before) continue;
    const fromY = Math.round(asNumber(before.y) * 10) / 10;
    const toY = Math.round(asNumber(after.y) * 10) / 10;
    const fromZ = asNumber(before.z, 1);
    const toZ = asNumber(after.z, 1);
    if (fromY === toY && fromZ === toZ) continue;
    const typeLabel = typeof after.type === 'string' ? after.type : 'bloc';
    let label = `${typeLabel} : ${fromY} → ${toY} mm`;
    if (fromY === toY && fromZ !== toZ) {
      label = `${typeLabel} : calque ${fromZ} → ${toZ}`;
    }
    changes.push({
      id: after.id,
      type: typeLabel,
      label,
      fromY,
      toY,
    });
  }
  return changes;
}

/** Liste d actions proposées pour l UI (coach / legacy). */
export function listAtsLayoutOptimizationActions(layout) {
  if (!layout) return [];
  const blocks = listAllBlocks(layout);
  const actions = [];
  const identity = blocks.find((b) => b.type === 'identity');
  const sortedByY = [...blocks]
    .filter(isAtsReadingContentBlock)
    .sort((a, b) => asNumber(a.y) - asNumber(b.y));
  const firstContent = sortedByY[0];
  if (identity && firstContent && firstContent.id !== identity.id) {
    actions.push({
      id: 'reading-order',
      label: 'Réorganiser spatialement pour la lecture ATS',
      description: 'Identité et sections clés empilées de haut en bas.',
    });
  }
  const contact = blocks.find((b) => b.type === 'contact');
  if (contact && asNumber(contact.y) > PAGE_HEIGHT_MM * 0.3) {
    actions.push({
      id: 'contact-up',
      label: 'Remonter le contact',
      description: 'Le contact est trop bas sur la page.',
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: 'reading-order',
      label: 'Réorganiser spatialement pour la lecture ATS',
      description: 'Empiler les blocs selon l’ordre de lecture machine.',
    });
  }
  return actions;
}
