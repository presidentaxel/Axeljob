/**
 * Optimisations ATS 1-clic sur layout v3 (P4.4).
 */

import { listAllBlocks } from './cvLayoutModelV3.js';

/** Ordre de lecture sémantique recommandé (haut → bas, même page). */
const SEMANTIC_READ_ORDER = [
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

function semanticRank(type) {
  const i = SEMANTIC_READ_ORDER.indexOf(type);
  return i >= 0 ? i : 50;
}

/**
 * Réordonne les blocs par page : identité/contact en tête, puis ordre canonique.
 * Conserve x/y/w/h ; ajuste z pour l empilement visuel.
 */
export function optimizeLayoutReadingOrder(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = [...(page.blocks || [])];
    const sorted = [...blocks].sort((a, b) => {
      const ra = semanticRank(a.type);
      const rb = semanticRank(b.type);
      if (ra !== rb) return ra - rb;
      return (a.y || 0) - (b.y || 0);
    });
    let z = 1;
    const nextBlocks = sorted.map((b) => ({ ...b, z: z++ }));
    return { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

/**
 * Remonte le bloc contact sous 25 % de la hauteur de page si trop bas.
 */
export function optimizeContactVerticalPosition(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = (page.blocks || []).map((b) => {
      if (b.type !== 'contact') return b;
      if ((b.y || 0) > 297 * 0.3) {
        return { ...b, y: Math.min(b.y, 40) };
      }
      return b;
    });
    return { ...page, blocks };
  });
  return { ...layout, pages };
}

/** Applique toutes les optimisations ATS disponibles côté client. */
export function applyAtsLayoutOptimizations(layout) {
  let next = layout;
  next = optimizeLayoutReadingOrder(next);
  next = optimizeContactVerticalPosition(next);
  return next;
}

/** Liste d actions proposées pour l UI (P4.4). */
export function listAtsLayoutOptimizationActions(layout) {
  if (!layout) return [];
  const blocks = listAllBlocks(layout);
  const actions = [];
  const identity = blocks.find((b) => b.type === 'identity');
  const first = blocks[0];
  if (identity && first && first.id !== identity.id) {
    actions.push({
      id: 'reading-order',
      label: 'Réordonner pour la lecture ATS',
      description: 'Identité et sections clés en tête de page.',
    });
  }
  const contact = blocks.find((b) => b.type === 'contact');
  if (contact && (contact.y || 0) > 297 * 0.3) {
    actions.push({
      id: 'contact-up',
      label: 'Remonter le contact',
      description: 'Le contact est trop bas sur la page.',
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: 'reading-order',
      label: 'Réordonner pour la lecture ATS',
      description: 'Aligner l ordre des blocs sur les bonnes pratiques ATS.',
    });
  }
  return actions;
}
