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
    .replace(/<[^>]+>/g, ' ')
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
    const headerIdentities = identities.filter((b) => !drop.has(b.id) && asBox(b).y < 28);
    if (headerIdentities.length >= 2) {
      const winner = headerIdentities.reduce((a, b) => (
        identityKeepScore(a) >= identityKeepScore(b) ? a : b
      ));
      headerIdentities.forEach((b) => {
        if (b.id !== winner.id) drop.add(b.id);
      });
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
      const inTitleBand = box.y < 24;
      const nearIdentity = identities.some((idb) => (
        overlapRatio(box, idb) >= 0.08
        || (sameHeaderRow(box, idb, 14) && overlapRatio(
          { ...box, h: Math.max(box.h, 8) },
          { ...idb, h: Math.max(idb.h, 10) },
        ) >= 0.01)
      ));
      if (!nearIdentity && !inTitleBand) return true;
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
    let contentBottom = headerBox.y;

    for (const block of blocks) {
      if (!block || block === header) continue;
      if (block.type === 'shape:rect' || block.type === 'shape:line' || block.type === 'title') continue;
      const box = asBox(block);
      const headerType = ['identity', 'photo', 'image', 'contact', 'resume'].includes(block.type);
      const headerText = block.type === 'text' && box.y < 40;
      const headerZone = block.style?.zone === 'header';
      if (!headerType && !headerText && !headerZone) continue;
      if (box.y > 42 && !headerZone) continue;
      contentBottom = Math.max(contentBottom, box.y + box.h);
    }

    if (contentBottom <= headerBox.y + 8) return page;
    const bodyTitleYs = blocks
      .filter((b) => b?.type === 'title' && (Number(b.y) || 0) > 36)
      .map((b) => Number(b.y) || 0);
    const titleCap = bodyTitleYs.length ? Math.min(...bodyTitleYs) - 1.4 : 88;
    const nextH = round1(Math.min(
      Math.max(18, titleCap - headerBox.y),
      Math.max(18, contentBottom - headerBox.y + 2.2),
    ));
    if (Math.abs(nextH - headerBox.h) < 0.6) return page;

    const nextBlocks = blocks.map((block, idx) => {
      if (idx === headerIdx) {
        return { ...block, h: nextH };
      }
      const box = asBox(block);
      const isAccent = (block.type === 'shape:rect' || block.type === 'shape:line')
        && box.w > PAGE_WIDTH_MM * 0.7
        && box.h < 3.2
        && Math.abs(box.y - headerBottom) < 2.5;
      if (isAccent) {
        return { ...block, y: round1(headerBox.y + nextH) };
      }
      const isSidebar = block.type === 'shape:rect'
        && box.x > PAGE_WIDTH_MM * 0.55
        && box.h > 80
        && box.y > 18
        && box.y < 70;
      if (isSidebar) {
        const bottom = box.y + box.h;
        const nextY = round1(headerBox.y + nextH);
        return { ...block, y: nextY, h: round1(Math.max(40, bottom - nextY)) };
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

/** Identité trop basse (bbox nom PDF) : le titre inline se clippe / se superpose. */
export function expandClippedIdentity(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const nextBlocks = blocks.map((block) => {
      if (block?.type !== 'identity') return block;
      const box = asBox(block);
      const bind = Array.isArray(block.bind) ? block.bind : [];
      const hasTitle = bind.includes('titre_professionnel')
        || block.style?.header_layout === 'inline-title';
      if (!hasTitle) return block;
      const below = blocks
        .filter((b) => b !== block && HEADER_CONTENT_TYPES.has(b.type) && (Number(b.y) || 0) > box.y + 2)
        .map((b) => Number(b.y) || 0);
      const cap = below.length ? Math.min(...below) - box.y - 0.8 : box.h + 10;
      const nextH = box.h >= 11
        ? box.h
        : Math.min(Math.max(box.h, 12.5), Math.max(box.h, cap));
      const rightNeighbors = blocks
        .filter((b) => b !== block)
        .map(asBox)
        .filter((bb) => (
          bb.x > box.x + 12
          && bb.y < box.y + Math.max(box.h, 12)
          && bb.y + bb.h > box.y
        ));
      const rightLimit = rightNeighbors.length
        ? Math.min(...rightNeighbors.map((bb) => bb.x)) - 1.5
        : PAGE_WIDTH_MM - 8;
      const nextW = Math.max(box.w, Math.min(rightLimit - box.x, 158));
      const taller = nextH > box.h + 0.4;
      const wider = nextW > box.w + 2;
      if (!taller && !wider) return block;
      return {
        ...block,
        ...(taller ? { h: round1(nextH) } : {}),
        ...(wider ? { w: round1(nextW) } : {}),
      };
    });
    return { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

/** Lignes PDF trop hautes qui se chevauchent (double texte / fausse cassure). */
export function shrinkOverlappingTextLines(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? [...page.blocks] : [];
    const texts = blocks
      .map((b, idx) => ({ b, idx, box: asBox(b) }))
      .filter(({ b }) => b?.type === 'text' || b?.type === 'resume');
    texts.sort((a, c) => a.box.y - c.box.y || a.box.x - c.box.x);
    const heightByIdx = new Map();
    for (let i = 0; i < texts.length - 1; i += 1) {
      const cur = texts[i];
      const nxt = texts[i + 1];
      const sameCol = Math.abs(cur.box.x - nxt.box.x) < 8 || (
        cur.box.x < nxt.box.x + nxt.box.w && nxt.box.x < cur.box.x + cur.box.w
      );
      if (!sameCol) continue;
      if (cur.box.h > 11) continue;
      const gap = nxt.box.y - cur.box.y;
      if (gap <= 0.4 || gap >= cur.box.h - 0.4) continue;
      if (gap > 12) continue;
      if (cur.box.y > 48 && nxt.box.y > 48) continue;
      heightByIdx.set(cur.idx, round1(Math.max(3.2, gap)));
    }
    if (!heightByIdx.size) return page;
    const nextBlocks = blocks.map((block, idx) => {
      if (!heightByIdx.has(idx)) return block;
      return {
        ...block,
        h: heightByIdx.get(idx),
        style: { ...(block.style || {}), lock_height: true },
      };
    });
    return { ...page, blocks: nextBlocks };
  });
  return { ...layout, pages };
}

/**
 * Fusionne les lignes PDF empilées du bandeau (même paragraphe) en un bloc
 * pour éviter le double paint / la couture une fois l’auto-height réappliqué.
 */
export function mergeStackedHeaderTextLines(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? [...page.blocks] : [];
    const texts = blocks
      .map((b, idx) => ({ b, idx, box: asBox(b) }))
      .filter(({ b, box }) => (
        b?.type === 'text'
        && box.y < 42
        && box.h <= 11
        && box.w > 70
      ));
    texts.sort((a, c) => a.box.y - c.box.y || a.box.x - c.box.x);
    const drop = new Set();
    const mergedByIdx = new Map();
    let i = 0;
    while (i < texts.length) {
      const run = [texts[i]];
      let j = i + 1;
      while (j < texts.length) {
        const prev = run[run.length - 1];
        const cur = texts[j];
        const sameCol = Math.abs(prev.box.x - cur.box.x) < 10 || (
          prev.box.x < cur.box.x + cur.box.w && cur.box.x < prev.box.x + prev.box.w
        );
        const gap = cur.box.y - prev.box.y;
        if (!sameCol || gap <= 0.4 || gap > 8 || gap >= prev.box.h - 0.15) break;
        run.push(cur);
        j += 1;
      }
      if (run.length >= 2) {
        const first = run[0];
        const last = run[run.length - 1];
        const runIdx = new Set(run.map((r) => r.idx));
        const afterYs = blocks
          .map((b, idx) => ({ b, idx, box: asBox(b) }))
          .filter(({ idx, box, b }) => (
            !runIdx.has(idx)
            && b?.type !== 'shape:rect'
            && b?.type !== 'shape:line'
            && box.y > first.box.y + 2
          ))
          .map(({ box }) => box.y);
        const cap = afterYs.length ? Math.min(...afterYs) - first.box.y - 0.8 : 24;
        const natural = last.box.y - first.box.y + Math.min(last.box.h, 5.2);
        const content = run
          .map((r) => decodeStructuralText(r.b.content))
          .filter(Boolean)
          .join(' ');
        mergedByIdx.set(first.idx, {
          ...first.b,
          content,
          w: round1(Math.max(...run.map((r) => r.box.w))),
          h: round1(Math.max(first.box.h, Math.min(cap, natural))),
          style: { ...(first.b.style || {}), italic: true, lock_height: true },
        });
        run.slice(1).forEach((r) => drop.add(r.idx));
      }
      i = j > i ? j : i + 1;
    }
    if (!drop.size) return page;
    return {
      ...page,
      blocks: blocks
        .map((block, idx) => (mergedByIdx.has(idx) ? mergedByIdx.get(idx) : block))
        .filter((_, idx) => !drop.has(idx)),
    };
  });
  return { ...layout, pages };
}

/** Marque zone=header sur les blocs qui recouvrent le bandeau sombre. */
export function tagBlocksOnHeaderBand(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const header = blocks.find(isFullWidthHeaderRect);
    if (!header) return page;
    const hb = asBox(header);
    const headerBottom = hb.y + hb.h;
    let changed = false;
    const nextBlocks = blocks.map((block) => {
      if (!block || block.type === 'shape:rect' || block.type === 'shape:line') return block;
      if (!HEADER_CONTENT_TYPES.has(block.type)) return block;
      if (block.type === 'title') return block;
      const box = asBox(block);
      if (box.y >= headerBottom - 0.5 || box.y + Math.min(box.h, 3) <= hb.y) return block;
      if (block.style?.zone === 'header') return block;
      changed = true;
      return { ...block, style: { ...(block.style || {}), zone: 'header' } };
    });
    return changed ? { ...page, blocks: nextBlocks } : page;
  });
  return { ...layout, pages };
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
  next = mergeStackedHeaderTextLines(next);
  next = shrinkOverlappingTextLines(next);
  next = expandClippedIdentity(next);
  next = stretchHeaderBandToContent(next);
  next = tagBlocksOnHeaderBand(next);
  return next;
}
