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
} from './cvLayoutModelV3.js';
import { isVectorShapeType } from './canvasShapePresets.js';

/** Ordre de lecture sémantique recommandé (haut → bas, même page). */
export const SEMANTIC_READ_ORDER = [
  'identity',
  'photo',
  'contact',
  'resume',
  'experiences',
  'formations',
  'skills',
  'languages',
  'certifications',
  'projets',
];

const CONTENT_GAP_MM = 6;
const CONTACT_TOP_Y_MM = 40;

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

/** Applique spatial + contact + calques (pipeline ATS 1-clic). */
export function applyAtsLayoutOptimizations(layout) {
  let next = layout;
  next = optimizeLayoutSpatialOrder(next);
  next = optimizeContactVerticalPosition(next);
  next = optimizeLayoutReadingOrder(next);
  return next;
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
