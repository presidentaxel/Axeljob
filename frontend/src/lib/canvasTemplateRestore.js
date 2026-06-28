import { isVectorShapeType } from './canvasShapePresets.js';
import { sanitizeLayoutV3 } from './cvLayoutModelV3.js';

const SEMANTIC_TEMPLATE_TYPES = new Set([
  'identity',
  'photo',
  'contact',
  'resume',
  'experiences',
  'formations',
  'certifications',
  'projets',
  'skills',
  'languages',
]);

const GEOMETRY_TYPES = new Set(['shape:rect', 'shape:line', 'shape:frame']);

function cloneBlock(block) {
  return JSON.parse(JSON.stringify(block));
}

function isGeometryBlock(block) {
  if (!block?.type) return false;
  if (GEOMETRY_TYPES.has(block.type)) return true;
  return isVectorShapeType(block.type);
}

function isSemanticTemplateSlot(block) {
  return SEMANTIC_TEMPLATE_TYPES.has(block?.type);
}

/** Clé stable pour détecter si un bloc structurel du modèle est déjà présent. */
export function templateStructuralBlockKey(block) {
  if (!block?.type) return '';
  if (isGeometryBlock(block)) {
    const x = Math.round((Number(block.x) || 0) * 2) / 2;
    const y = Math.round((Number(block.y) || 0) * 2) / 2;
    const w = Math.round((Number(block.w) || 0) * 2) / 2;
    const h = Math.round((Number(block.h) || 0) * 2) / 2;
    const zone = block.style?.zone || '';
    const color = block.style?.color || block.style?.bg || '';
    return `geo:${block.type}:${x}:${y}:${w}:${h}:${zone}:${color}`;
  }
  if (isSemanticTemplateSlot(block)) {
    const bind = block.bind != null ? JSON.stringify(block.bind) : '';
    const zone = block.style?.zone || '';
    return `sem:${block.type}:${bind}:${zone}`;
  }
  return '';
}

function collectStructuralKeys(layout) {
  const keys = new Set();
  for (const page of layout?.pages || []) {
    for (const block of page?.blocks || []) {
      const key = templateStructuralBlockKey(block);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Réinjecte les bandeaux / formes / emplacements sémantiques du modèle de base
 * manquants dans un brouillon (suppression manuelle ou écrasement par import).
 */
export function mergeTemplateBaseWithDraft(baseLayout, draftLayout) {
  if (!baseLayout?.pages?.length) return sanitizeLayoutV3(draftLayout || baseLayout);
  if (!draftLayout?.pages?.length) return sanitizeLayoutV3(baseLayout);

  const draftKeys = collectStructuralKeys(draftLayout);
  const pageCount = Math.max(baseLayout.pages.length, draftLayout.pages.length);

  const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    const draftPage = draftLayout.pages[pageIndex] || draftLayout.pages[0];
    const basePage = baseLayout.pages[pageIndex] || baseLayout.pages[0];
    const draftBlocks = [...(draftPage?.blocks || [])];
    const missing = (basePage?.blocks || []).filter((block) => {
      const key = templateStructuralBlockKey(block);
      if (!key) return false;
      return !draftKeys.has(key);
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

export function resolveTemplateContextLayout(contextKey, baseLayout, draftLayout) {
  if (!draftLayout) return baseLayout;
  if (String(contextKey || '').startsWith('template:')) {
    return mergeTemplateBaseWithDraft(baseLayout, draftLayout);
  }
  return draftLayout;
}
