import {
  createBlankLayoutV3,
  listAllBlocks,
  sanitizeBlock,
  sanitizeLayoutV3,
} from './cvLayoutModelV3.js';

const TRANSFERABLE_MANUAL_TYPES = new Set([
  'text',
  'title',
  'image',
  'icon',
  'shape:line',
  'shape:rect',
  'qrcode',
]);

const TYPE_LABELS = {
  text: 'Texte',
  title: 'Titre',
  image: 'Image',
  icon: 'Icône',
  'shape:line': 'Trait',
  'shape:rect': 'Bandeau',
  qrcode: 'QR code',
  identity: 'Identité',
  photo: 'Photo',
  contact: 'Contact',
  resume: 'Résumé',
  experiences: 'Expériences',
  formations: 'Formations',
  certifications: 'Certifications',
  projets: 'Projets',
  skills: 'Compétences',
  languages: 'Langues',
};

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

function semanticSignature(block) {
  if (!block || TRANSFERABLE_MANUAL_TYPES.has(block.type)) return null;
  return JSON.stringify({
    type: block.type,
    bind: block.bind ?? null,
  });
}

function blockLabel(block) {
  const base = TYPE_LABELS[block?.type] || block?.type || 'Bloc';
  const content = typeof block?.content === 'string' ? block.content.trim() : '';
  if (content) return `${base} · ${content.slice(0, 36)}`;
  if (block?.icon_name) return `${base} · ${block.icon_name.replace(/^Hi/, '')}`;
  return base;
}

export function detectTransferCandidates(sourceLayout, targetTemplateLayout) {
  const sourcePages = Array.isArray(sourceLayout?.pages) ? sourceLayout.pages : [];
  const targetSemantic = new Set(
    listAllBlocks(targetTemplateLayout)
      .map(semanticSignature)
      .filter(Boolean),
  );
  const candidates = [];
  sourcePages.forEach((page, pageIndex) => {
    (page?.blocks || []).forEach((block) => {
      if (!block?.id) return;
      const isManual = TRANSFERABLE_MANUAL_TYPES.has(block.type);
      const signature = semanticSignature(block);
      const isExtraSemantic = signature && !targetSemantic.has(signature);
      if (!isManual && !isExtraSemantic) return;
      candidates.push({
        id: block.id,
        blockId: block.id,
        pageIndex,
        label: blockLabel(block),
        type: block.type,
        block: clone(block),
      });
    });
  });
  return candidates;
}

export function cloneBlocksForTransfer(candidates, options = {}) {
  const now = options.now ?? Date.now();
  const idPrefix = options.idPrefix || 'transfer';
  return (candidates || [])
    .map((candidate, index) => {
      const block = candidate?.block || candidate;
      if (!block || typeof block !== 'object') return null;
      return sanitizeBlock({
        ...clone(block),
        id: `${idPrefix}_${now}_${index}`,
        locked: false,
        z: Number(block.z || 0) + 1000 + index,
      });
    })
    .filter(Boolean);
}

export function mergeTransferredBlocks(targetLayout, candidates, options = {}) {
  const safeTarget = sanitizeLayoutV3(targetLayout || createBlankLayoutV3());
  const clonedBlocks = cloneBlocksForTransfer(candidates, options);
  if (!clonedBlocks.length) return safeTarget;
  const byOriginalPage = new Map();
  clonedBlocks.forEach((block, index) => {
    const originalPage = candidates[index]?.pageIndex || 0;
    const pageIndex = Math.max(0, Math.min(originalPage, safeTarget.pages.length - 1));
    if (!byOriginalPage.has(pageIndex)) byOriginalPage.set(pageIndex, []);
    byOriginalPage.get(pageIndex).push(block);
  });
  return {
    ...safeTarget,
    pages: safeTarget.pages.map((page, pageIndex) => ({
      ...page,
      blocks: [
        ...(page.blocks || []),
        ...(byOriginalPage.get(pageIndex) || []),
      ],
    })),
  };
}

export function summarizeTransferCandidates(candidates) {
  const count = (candidates || []).length;
  if (count === 0) return 'Aucun élément transférable';
  if (count === 1) return '1 élément transférable';
  return `${count} éléments transférables`;
}
