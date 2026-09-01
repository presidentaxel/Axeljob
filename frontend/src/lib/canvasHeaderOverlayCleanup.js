/**
 * Nettoyage des en-têtes canvas : titre identitaire doublé (identité sémantique
 * + texte PDF restant) et bandeau sombre trop court (cassure horizontale).
 */

import { PAGE_WIDTH_MM } from './cvLayoutModelV3.js';
import { decodeStructuralText } from './structuralSemanticBind.js';

const HEADER_CONTENT_TYPES = new Set([
  'identity',
  'photo',
  'image',
  'contact',
  'resume',
  'text',
  'title',
]);

function asBox(block) {
  return {
    x: Number(block?.x) || 0,
    y: Number(block?.y) || 0,
    w: Number(block?.w) || 0,
    h: Number(block?.h) || 0,
  };
}

function overlapRatio(a, b) {
  const ax1 = a.x + a.w;
  const ay1 = a.y + a.h;
  const bx1 = b.x + b.w;
  const by1 = b.y + b.h;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(ax1, bx1);
  const y1 = Math.min(ay1, by1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 ? inter / smaller : 0;
}

function sameHeaderRow(a, b, maxDy = 8) {
  return Math.abs(a.y - b.y) <= maxDy;
}

function normalizeIdentityText(value) {
  return decodeStructuralText(value)
    .toLowerCase()
    .replace(/[\s|/·•\-–—_.,;:!?«»"'()]+/g, ' ')
    .trim();
}

function identityKeepScore(block) {
  const style = block?.style && typeof block.style === 'object' ? block.style : {};
  let score = Number(block.w) * Number(block.h) || 0;
  if (style.header_layout === 'inline-title') score += 10_000;
  const bind = Array.isArray(block.bind) ? block.bind : [];
  score += bind.length * 100;
  return score;
}

/** Rectangle de bandeau : large, en haut de page. */
export function isFullWidthHeaderRect(block) {
  if (!block || block.type !== 'shape:rect') return false;
  const { x, y, w, h } = asBox(block);
  return y < 18 && x < 12 && w > PAGE_WIDTH_MM * 0.7 && h > 8 && h < 95;
}

export function textDuplicatesIdentityContent(content, cv = {}) {
  const text = normalizeIdentityText(content);
  if (!text || text.length < 4) return false;
  const titre = normalizeIdentityText(cv.titre_professionnel);
  const name = normalizeIdentityText(
    `${cv.prenom || cv.first_name || ''} ${cv.nom || cv.last_name || ''}`,
  );
  if (name && (text === name || text.includes(name) || name.includes(text))) return true;
  if (!titre) return false;
  if (text === titre || titre.includes(text) || text.includes(titre)) return true;
  const titreHead = titre.split(' ').slice(0, 3).join(' ');
  return Boolean(titreHead && titreHead.length >= 8 && text.includes(titreHead));
}

/**
 * Une identité par cluster qui se chevauche (garde inline-title / plus de binds).
 * @param {object} layout
 * @returns {object}
 */
export function dedupeOverlappingIdentities(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const identities = blocks.filter((b) => b?.type === 'identity');
    if (identities.length < 2) return page;

    const drop = new Set();
    for (let i = 0; i < identities.length; i += 1) {
      if (drop.has(identities[i].id)) continue;
      const a = asBox(identities[i]);
      for (let j = i + 1; j < identities.length; j += 1) {
        if (drop.has(identities[j].id)) continue;
        const b = asBox(identities[j]);
        const close = overlapRatio(a, b) >= 0.18 || sameHeaderRow(a, b, 10);
        if (!close) continue;
        const loser = identityKeepScore(identities[i]) >= identityKeepScore(identities[j])
          ? identities[j]
          : identities[i];
        drop.add(loser.id);
      }
    }
    if (!drop.size) return page;
    return { ...page, blocks: blocks.filter((b) => !drop.has(b.id)) };
  });
  return { ...layout, pages };
}

/**
 * Retire le texte PDF qui redessine prénom/nom/titre déjà portés par identity.
 * @param {object} layout
 * @param {object} cv
 * @returns {object}
 */
export function removeTextDuplicatingIdentity(layout, cv = {}) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const identities = blocks.filter((b) => b?.type === 'identity').map(asBox);
    if (!identities.length) return page;

    const nextBlocks = blocks.filter((block) => {
      if (block?.type !== 'text' && block?.type !== 'title') return true;
      const box = asBox(block);
      if (box.y > 72) return true;
      const nearIdentity = identities.some((idb) => (
        overlapRatio(box, idb) >= 0.08
        || (sameHeaderRow(box, idb, 12) && overlapRatio(
          { ...box, h: Math.max(box.h, 8) },
          { ...idb, h: Math.max(idb.h, 8) },
        ) >= 0.02)
      ));
      if (!nearIdentity) return true;
      return !textDuplicatesIdentityContent(block.content, cv);
    });
    return nextBlocks.length === blocks.length ? page : { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

/**
 * Allonge le bandeau sombre jusqu’au bas du contenu d’en-tête (évite la cassure).
 * @param {object} layout
 * @returns {object}
 */
export function stretchHeaderBandToContent(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? [...page.blocks] : [];
    const headerIdx = blocks.findIndex(isFullWidthHeaderRect);
    if (headerIdx < 0) return page;
    const header = blocks[headerIdx];
    const headerBox = asBox(header);
    const headerBottom = headerBox.y + headerBox.h;
    let maxBottom = headerBottom;

    for (const block of blocks) {
      if (!block || block === header) continue;
      if (block.type === 'shape:rect' || block.type === 'shape:line') continue;
      if (!HEADER_CONTENT_TYPES.has(block.type) && block.style?.zone !== 'header') continue;
      const box = asBox(block);
      const inBand = box.y < headerBottom + 8 && box.y >= headerBox.y - 2;
      const headerZone = block.style?.zone === 'header';
      if (!inBand && !headerZone) continue;
      maxBottom = Math.max(maxBottom, box.y + box.h);
    }

    const nextH = Math.max(headerBox.h, (maxBottom - headerBox.y) + 2.5);
    const delta = nextH - headerBox.h;
    if (delta < 0.6) return page;

    const nextBlocks = blocks.map((block, idx) => {
      if (idx === headerIdx) {
        return { ...block, h: round1(nextH) };
      }
      const box = asBox(block);
      const isAccent = (block.type === 'shape:rect' || block.type === 'shape:line')
        && box.w > PAGE_WIDTH_MM * 0.7
        && box.h < 3.2
        && Math.abs(box.y - headerBottom) < 2.5;
      if (isAccent) {
        return { ...block, y: round1(headerBox.y + nextH) };
      }
      return block;
    });
    return { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

export function insertMissingSpaceAfterColonLabels(layout) {
  if (!layout?.pages?.length) return layout;
  const re = /\b(Organisation|Organization|Fonction|Function|Poste|Clients?)\s*:(\S)/gi;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    let changed = false;
    const nextBlocks = blocks.map((block) => {
      if (block?.type !== 'text' && block?.type !== 'title') return block;
      const content = String(block.content || '');
      const next = content.replace(re, '$1 : $2');
      if (next === content) return block;
      changed = true;
      return { ...block, content: next };
    });
    return changed ? { ...page, blocks: nextBlocks } : page;
  });
  return { ...layout, pages };
}

/**
 * @param {object} layout
 * @param {object} [cv]
 * @returns {object}
 */
export function cleanupCanvasHeaderOverlays(layout, cv = {}) {
  if (!layout?.pages?.length) return layout;
  let next = dedupeOverlappingIdentities(layout);
  next = removeTextDuplicatingIdentity(next, cv);
  next = insertMissingSpaceAfterColonLabels(next);
  next = stretchHeaderBandToContent(next);
  return next;
}
