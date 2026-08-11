import { isVectorShapeType } from './canvasShapePresets.js';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, sanitizeLayoutV3 } from './cvLayoutModelV3.js';

const GEOMETRY_TYPES = new Set(['shape:rect', 'shape:line', 'shape:frame']);

function cloneBlock(block) {
  return JSON.parse(JSON.stringify(block));
}

function isGeometryBlock(block) {
  if (!block?.type) return false;
  if (GEOMETRY_TYPES.has(block.type)) return true;
  return isVectorShapeType(block.type);
}

/** Clé géométrique sans couleur (évite les doublons import / modèle). */
export function templateGeometryBlockKey(block) {
  if (!isGeometryBlock(block)) return '';
  const x = Math.round((Number(block.x) || 0) * 2) / 2;
  const y = Math.round((Number(block.y) || 0) * 2) / 2;
  const w = Math.round((Number(block.w) || 0) * 2) / 2;
  const h = Math.round((Number(block.h) || 0) * 2) / 2;
  const zone = block.style?.zone || '';
  const side = x + w / 2 < PAGE_WIDTH_MM / 2 ? 'L' : 'R';
  if (block.type === 'shape:rect' && h > PAGE_HEIGHT_MM * 0.45 && w < PAGE_WIDTH_MM * 0.5) {
    return `role:sidebar:${side}`;
  }
  if (block.type === 'shape:rect' && y < 18 && h < 90 && w > PAGE_WIDTH_MM * 0.35) {
    return `role:header:${zone}`;
  }
  return `geo:${block.type}:${x}:${y}:${w}:${h}:${zone}`;
}

/** @deprecated Utiliser templateGeometryBlockKey. */
export function templateStructuralBlockKey(block) {
  return templateGeometryBlockKey(block);
}

function collectGeometryKeys(layout) {
  const keys = new Set();
  for (const page of layout?.pages || []) {
    for (const block of page?.blocks || []) {
      const key = templateGeometryBlockKey(block);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Réinjecte bandeaux / formes du modèle de base absents du brouillon.
 * Ne touche pas aux blocs sémantiques (évite le texte en double).
 */
export function mergeTemplateBaseWithDraft(baseLayout, draftLayout) {
  if (!baseLayout?.pages?.length) return sanitizeLayoutV3(draftLayout || baseLayout);
  if (!draftLayout?.pages?.length) return sanitizeLayoutV3(baseLayout);

  const draftKeys = collectGeometryKeys(draftLayout);
  const pageCount = Math.max(baseLayout.pages.length, draftLayout.pages.length);

  const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    const draftPage = draftLayout.pages[pageIndex] || draftLayout.pages[0];
    const basePage = baseLayout.pages[pageIndex] || baseLayout.pages[0];
    const draftBlocks = [...(draftPage?.blocks || [])];
    const missing = (basePage?.blocks || []).filter((block) => {
      if (!isGeometryBlock(block)) return false;
      const key = templateGeometryBlockKey(block);
      return key && !draftKeys.has(key);
    }).map(cloneBlock).sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));

    return {
      ...(draftPage || { id: `page_${pageIndex + 1}`, blocks: [] }),
      blocks: [...missing, ...draftBlocks],
    };
  });

  return sanitizeLayoutV3({
    ...draftLayout,
    theme: { ...baseLayout.theme, ...draftLayout.theme },
    pages,
  });
}

export function resolveTemplateContextLayout(contextKey, baseLayout, draftLayout, options = {}) {
  const { forceBase = false } = options;
  if (forceBase || !draftLayout) return baseLayout;
  if (String(contextKey || '').startsWith('template:')) {
    return mergeTemplateBaseWithDraft(baseLayout, draftLayout);
  }
  return draftLayout;
}
