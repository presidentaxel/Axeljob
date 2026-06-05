/**
 * Adaptation intelligente d'un CV importé vers une mise en page canvas Canva.
 *
 * Pipeline : analyse profil → template + couleurs → blocs dimensionnés →
 * reflow → pagination → ordre ATS.
 */
import { applyAtsLayoutOptimizations } from './atsLayoutOptimize.js';
import { createCanvasLayoutForTemplate } from './layoutTemplatePresets.js';
import { reflowColumnBlocksOnPage } from './layoutReflow.js';
import { applyLayoutPagination } from './layoutPagination.js';
import {
  PAGE_WIDTH_MM,
  removeBlock,
  sanitizeLayoutV3,
  setBlockPosition,
} from './cvLayoutModelV3.js';
import {
  resolveBoundText,
  resolveCertifications,
  resolveCompetenceList,
  resolveExperiences,
  resolveFormations,
  resolveLangues,
  resolvePhotoUrl,
  resolveProjets,
} from './freeCanvasContent.js';

const DECORATIVE_TYPES = new Set(['shape:rect', 'shape:line']);

const LAYOUT_STYLE_TEMPLATES = {
  'sidebar-left': ['modern', 'classic', 'creative'],
  'sidebar-right': ['executive', 'bold'],
  'single-column': ['minimal', 'elegant'],
  'header-band': ['executive', 'bold', 'classic'],
};

const SECTION_READ_ORDER = [
  'identity',
  'photo',
  'contact',
  'resume',
  'experiences',
  'formations',
  'skills',
  'certifications',
  'languages',
  'projets',
];

const THEME_PRESETS = {
  creative: {
    color_accent: '#6366f1',
    color_header: '#6366f1',
    color_sidebar: '#6366f1',
    color_section_title: '#6366f1',
  },
  executive: {
    color_accent: '#b8860b',
    color_header: '#0f172a',
    color_sidebar: '#f8f6f0',
    color_section_title: '#0f172a',
  },
  tech: {
    color_accent: '#3182ce',
    color_header: '#2d3748',
    color_sidebar: '#edf2f7',
    color_section_title: '#3182ce',
  },
  minimal: {
    color_accent: '#111827',
    color_header: '#ffffff',
    color_section_title: '#111827',
  },
};

/** Métriques du profil pour adapter la mise en page. */
export function analyzeCvProfile(cv) {
  const experiences = resolveExperiences(cv);
  const formations = resolveFormations(cv);
  const certifications = resolveCertifications(cv);
  const projets = resolveProjets(cv);
  const langues = resolveLangues(cv);
  const techniques = resolveCompetenceList(cv, 'competences.techniques');
  const logiciels = resolveCompetenceList(cv, 'competences.logiciels');
  const autres = resolveCompetenceList(cv, 'competences.autres');
  const resume = String(cv?.resume || '').trim();
  const titre = String(cv?.titre_professionnel || '').trim().toLowerCase();
  const bulletCount = experiences.reduce(
    (n, e) => n + (e.bullet_points || []).filter((b) => String(b || '').trim()).length,
    0,
  );

  return {
    expCount: experiences.length,
    formationCount: formations.length,
    certCount: certifications.length,
    projetCount: projets.length,
    langCount: langues.length,
    skillCount: techniques.length + logiciels.length + autres.length,
    resumeChars: resume.length,
    bulletCount,
    hasPhoto: Boolean(resolvePhotoUrl(cv)),
    hasContact: Boolean(
      String(cv?.email || '').trim()
      || String(cv?.telephone || '').trim()
      || String(cv?.linkedin || '').trim(),
    ),
    hasIdentity: Boolean(
      String(cv?.prenom || '').trim()
      || String(cv?.nom || '').trim()
      || String(cv?.titre_professionnel || '').trim(),
    ),
    isCreativeProfile: /design|créatif|creative|graphiste|ux|ui|marketing|brand|communication/.test(titre),
    isExecutiveProfile: /directeur|directrice|manager|chef|responsable|head|vp|ceo|cto|lead/.test(titre),
    isTechProfile: /dev|développ|engineer|ingénieur|data|software|full.?stack|backend|frontend/.test(titre),
    density: experiences.length * 3 + bulletCount + formations.length + resume.length / 80,
  };
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

/** Choisit le template le plus adapté au profil importé. */
export function recommendTemplateId(analysis, templatesList = [], currentTemplateId = '', layoutHints = {}) {
  const ids = new Set((templatesList || []).map((t) => t?.id).filter(Boolean));
  const pick = (id) => (ids.has(id) ? id : null);
  const style = String(layoutHints?.layout_style || '').trim();

  if (style && LAYOUT_STYLE_TEMPLATES[style]) {
    for (const candidate of LAYOUT_STYLE_TEMPLATES[style]) {
      const hit = pick(candidate);
      if (hit) return hit;
    }
  }

  if (analysis.isCreativeProfile && pick('creative')) return 'creative';
  if (analysis.isExecutiveProfile && analysis.expCount >= 3 && pick('executive')) return 'executive';
  if (analysis.isTechProfile && pick('modern')) return 'modern';
  if (analysis.expCount >= 6 && pick('classic')) return 'classic';
  if (analysis.skillCount >= 12 && analysis.hasPhoto && pick('modern')) return 'modern';
  if (analysis.density < 4 && pick('minimal')) return 'minimal';
  if (analysis.projetCount >= 2 && pick('bold')) return 'bold';
  if (currentTemplateId && pick(currentTemplateId)) return currentTemplateId;
  return pick('classic') || pick('minimal') || (templatesList[0]?.id) || 'classic';
}

export function recommendTemplateLabel(templateId, templatesList = []) {
  const t = (templatesList || []).find((item) => item?.id === templateId);
  return t?.name || templateId;
}

/** Résumé lisible pour le toast post-import. */
export function summarizeImportAdaptation(analysis, templateLabel, blockCount = 0) {
  const parts = [];
  if (analysis.expCount) parts.push(`${analysis.expCount} exp.`);
  if (analysis.formationCount) parts.push(`${analysis.formationCount} form.`);
  if (analysis.skillCount) parts.push(`${analysis.skillCount} compétences`);
  const body = parts.length ? parts.join(' · ') : 'Profil structuré';
  const blocks = blockCount > 0 ? ` · ${blockCount} blocs` : '';
  return `${body} — ${templateLabel}${blocks}`;
}

export function inferThemeFromProfile(analysis, layoutHints = {}) {
  const theme = {};
  if (isValidHexColor(layoutHints.accent_color)) {
    theme.color_accent = layoutHints.accent_color;
    theme.color_section_title = layoutHints.accent_color;
  }
  if (isValidHexColor(layoutHints.sidebar_color)) {
    theme.color_sidebar = layoutHints.sidebar_color;
  }
  if (isValidHexColor(layoutHints.header_color)) {
    theme.color_header = layoutHints.header_color;
  }

  if (!theme.color_accent) {
    if (analysis.isCreativeProfile) Object.assign(theme, THEME_PRESETS.creative);
    else if (analysis.isExecutiveProfile) Object.assign(theme, THEME_PRESETS.executive);
    else if (analysis.isTechProfile) Object.assign(theme, THEME_PRESETS.tech);
    else if (analysis.density < 4) Object.assign(theme, THEME_PRESETS.minimal);
  }
  return theme;
}

function blockHasRenderableContent(block, cv, analysis) {
  if (!block || DECORATIVE_TYPES.has(block.type)) return true;
  switch (block.type) {
    case 'identity':
      return analysis.hasIdentity;
    case 'contact':
      return analysis.hasContact;
    case 'photo':
      return analysis.hasPhoto;
    case 'resume':
      return analysis.resumeChars > 0;
    case 'experiences':
      return analysis.expCount > 0;
    case 'formations':
      return analysis.formationCount > 0;
    case 'certifications':
      return analysis.certCount > 0;
    case 'projets':
      return analysis.projetCount > 0;
    case 'languages':
      return analysis.langCount > 0;
    case 'skills': {
      const bind = block.bind || 'competences.techniques';
      return resolveCompetenceList(cv, bind).length > 0;
    }
    default:
      return true;
  }
}

function estimateExperiencesHeight(cv) {
  const exps = resolveExperiences(cv);
  if (!exps.length) return 0;
  let h = 14;
  for (const e of exps) {
    const bullets = (e.bullet_points || []).filter((b) => String(b || '').trim()).length;
    h += 10 + bullets * 3.8;
  }
  return Math.min(220, Math.max(28, h));
}

function estimateListHeight(count, itemHmm = 4.2, base = 10, max = 80) {
  if (!count) return 0;
  return Math.min(max, Math.max(14, base + count * itemHmm));
}

function estimateSkillsHeight(block, cv) {
  const items = resolveCompetenceList(cv, block.bind || 'competences.techniques');
  if (!items.length) return 0;
  const isChips = block.style?.format === 'chips';
  if (isChips) {
    const rows = Math.ceil(items.length / 5);
    return Math.min(55, Math.max(16, 12 + rows * 5.5));
  }
  return estimateListHeight(items.length, 3.8, 10, 50);
}

const SEMANTIC_MIN_HEIGHT_MM = 10;

/** Hauteur estimée (mm) d'un bloc sémantique selon le CV. */
export function estimateSemanticBlockHeight(block, cv, { respectCurrentMin = false } = {}) {
  const floor = respectCurrentMin ? (Number(block.h) || SEMANTIC_MIN_HEIGHT_MM) : SEMANTIC_MIN_HEIGHT_MM;
  if (!block || DECORATIVE_TYPES.has(block.type)) return floor;

  switch (block.type) {
    case 'identity': {
      const text = resolveBoundText(cv, block.bind);
      return Math.max(floor, text.length > 40 ? 22 : 16);
    }
    case 'contact':
      return Math.max(floor, 12);
    case 'photo':
      return Math.max(floor, 14);
    case 'resume': {
      const chars = String(cv?.resume || '').trim().length;
      if (!chars) return 0;
      return Math.max(16, Math.min(52, 12 + chars * 0.22));
    }
    case 'experiences':
      return Math.max(floor, estimateExperiencesHeight(cv));
    case 'formations':
      return Math.max(floor, estimateListHeight(resolveFormations(cv).length, 9, 12, 70));
    case 'certifications':
      return Math.max(floor, estimateListHeight(resolveCertifications(cv).length, 7, 10, 45));
    case 'projets':
      return Math.max(floor, estimateListHeight(resolveProjets(cv).length, 11, 12, 65));
    case 'languages':
      return Math.max(floor, estimateListHeight(resolveLangues(cv).length, 4.5, 10, 35));
    case 'skills':
      return Math.max(floor, estimateSkillsHeight(block, cv));
    default:
      return floor;
  }
}

function patchBlockHeight(layout, blockId, h) {
  const pages = (layout.pages || []).map((page) => ({
    ...page,
    blocks: (page.blocks || []).map((b) => (
      b.id === blockId ? { ...b, h: Math.max(3, h) } : b
    )),
  }));
  return { ...layout, pages };
}

function blockLane(block) {
  if (!block) return 'main';
  if (block.style?.zone) return block.style.zone;
  const x = Number(block.x) || 0;
  if (x > PAGE_WIDTH_MM * 0.62) return 'sidebar';
  if (x < PAGE_WIDTH_MM * 0.28) return 'sidebar';
  return 'main';
}

function sectionRank(type, layoutHints = {}) {
  const emphasis = Array.isArray(layoutHints.sections_emphasis)
    ? layoutHints.sections_emphasis
    : [];
  const ei = emphasis.indexOf(type);
  if (ei >= 0) return ei;
  const i = SECTION_READ_ORDER.indexOf(type);
  return i >= 0 ? i + 20 : 50;
}

/** Réordonne les blocs sémantiques dans chaque colonne selon le contenu importé. */
export function reorderSemanticBlocksByPriority(layout, cv, analysis, layoutHints = {}) {
  if (!layout?.pages?.length) return layout;
  let next = layout;
  for (let pageIndex = 0; pageIndex < next.pages.length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const blocks = [...(page.blocks || [])];
    const lanes = new Map();
    for (const block of blocks) {
      if (DECORATIVE_TYPES.has(block.type)) continue;
      const lane = blockLane(block);
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(block);
    }
    for (const laneBlocks of lanes.values()) {
      const sorted = [...laneBlocks].sort((a, b) => {
        const ra = sectionRank(a.type, layoutHints);
        const rb = sectionRank(b.type, layoutHints);
        if (ra !== rb) return ra - rb;
        return (Number(a.y) || 0) - (Number(b.y) || 0);
      });
      const startY = sorted.length
        ? Math.min(...sorted.map((b) => Number(b.y) || 0))
        : 0;
      let cursorY = startY;
      for (const block of sorted) {
        if (!blockHasRenderableContent(block, cv, analysis)) continue;
        next = setBlockPosition(next, block.id, { x: Number(block.x) || 0, y: cursorY });
        cursorY += (Number(block.h) || 10) + 2;
      }
    }
  }
  return next;
}

function countLayoutBlocks(layout) {
  return (layout?.pages || []).reduce((n, p) => n + (p.blocks?.length || 0), 0);
}

/**
 * Adapte un layout canvas existant au contenu du CV importé.
 */
export function adaptCanvasLayoutForCv(cv, layout, {
  templatesList = [],
  templateId = '',
  layoutHints = {},
} = {}) {
  const analysis = analyzeCvProfile(cv);
  const recommendedTemplateId = recommendTemplateId(
    analysis,
    templatesList,
    templateId,
    layoutHints,
  );

  if (!layout?.pages?.length) {
    return {
      layout,
      analysis,
      recommendedTemplateId,
      removedBlockCount: 0,
      resizedBlockCount: 0,
      blockCount: 0,
    };
  }

  let next = sanitizeLayoutV3(layout);
  let removedBlockCount = 0;
  let resizedBlockCount = 0;

  for (const page of next.pages || []) {
    for (const block of [...(page.blocks || [])]) {
      if (!blockHasRenderableContent(block, cv, analysis)) {
        next = removeBlock(next, block.id);
        removedBlockCount += 1;
        continue;
      }
      const est = estimateSemanticBlockHeight(block, cv, { respectCurrentMin: false });
      const cur = Number(block.h) || 0;
      if (est > 0 && Math.abs(est - cur) > 1.5) {
        next = patchBlockHeight(next, block.id, est);
        resizedBlockCount += 1;
      }
    }
  }

  next = reorderSemanticBlocksByPriority(next, cv, analysis, layoutHints);

  for (let pi = 0; pi < (next.pages?.length || 0); pi += 1) {
    next = reflowColumnBlocksOnPage(next, pi);
  }

  next = applyLayoutPagination(next);
  next = applyAtsLayoutOptimizations(next);

  const themePatch = inferThemeFromProfile(analysis, layoutHints);
  next = {
    ...next,
    theme: { ...next.theme, ...themePatch, template_id: recommendedTemplateId },
  };

  return {
    layout: next,
    analysis,
    recommendedTemplateId,
    removedBlockCount,
    resizedBlockCount,
    blockCount: countLayoutBlocks(next),
  };
}

/**
 * Pipeline complet : template → layout → adaptation au CV importé.
 */
export function buildAdaptedCanvasLayoutForCv(cv, template, options = {}) {
  const base = createCanvasLayoutForTemplate(template);
  const templateId = template?.id || options.templateId || '';
  const result = adaptCanvasLayoutForCv(cv, base, {
    templatesList: options.templatesList,
    templateId,
    layoutHints: options.layoutHints || {},
  });
  let layout = result.layout;
  for (let pi = 0; pi < (layout.pages?.length || 0); pi += 1) {
    layout = reflowColumnBlocksOnPage(layout, pi);
  }
  layout = applyLayoutPagination(layout);
  return { ...result, layout, blockCount: countLayoutBlocks(layout) };
}

/**
 * Point d'entrée import Beta : CV + hints → canvas complet prêt à l'emploi.
 */
export function buildFullCanvasImportLayout(cv, templatesList = [], {
  templateId = '',
  layoutHints = {},
} = {}) {
  const analysis = analyzeCvProfile(cv);
  const recommendedTemplateId = recommendTemplateId(
    analysis,
    templatesList,
    templateId,
    layoutHints,
  );
  const template = (templatesList || []).find((t) => t?.id === recommendedTemplateId)
    || (templatesList || [])[0];
  return buildAdaptedCanvasLayoutForCv(cv, template, {
    templatesList,
    templateId: recommendedTemplateId,
    layoutHints,
  });
}
