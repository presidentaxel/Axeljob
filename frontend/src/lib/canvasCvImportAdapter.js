/**
 * Adaptation intelligente d'un CV importé vers une mise en page canvas Canva.
 *
 * Pipeline : analyse profil → template + couleurs → blocs dimensionnés →
 * reflow → pagination → ordre ATS.
 */
import {
  applyAtsLayoutOptimizations,
  optimizeAddMissingProfileSections,
} from './atsLayoutOptimize.js';
import {
  LAYOUT,
  MAIN_PAD_X,
  MAIN_PAD_Y,
  parseCanvasTheme,
  SIDE_PAD_X,
  SIDE_PAD_Y,
  STABLE_CANVAS_TEMPLATE_IDS,
} from './canvasTemplateSpecs.js';
import { createCanvasLayoutForTemplate } from './layoutTemplatePresets.js';
import { reflowColumnBlocksOnPage } from './layoutReflow.js';
import { applyLayoutPagination } from './layoutPagination.js';
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  listAllBlocks,
  removeBlock,
  sanitizeLayoutV3,
  setBlockPosition,
} from './cvLayoutModelV3.js';
import { syncCvDualKeys } from './cvDualKey.js';
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
import { bindStructuralTextToSemanticBlocks } from './structuralSemanticBind.js';

const DECORATIVE_TYPES = new Set(['shape:rect', 'shape:line']);

/** Blocs visibles pour l’utilisateur (hors filets / rectangles déco). */
export function isImportContentBlock(block) {
  return Boolean(block?.type) && !DECORATIVE_TYPES.has(block.type);
}

/** Compte les blocs de contenu (pas les filets décoratifs). */
export function countContentBlocks(layout) {
  return listAllBlocks(layout).filter(isImportContentBlock).length;
}

/**
 * AXE-344 — après prune import, ne jamais laisser un canvas décoratif-only
 * si le CV a du contenu : on pose au moins identity/contact (+ sections profil).
 */
export function ensureImportLayoutHasContent(layout, cv) {
  if (!layout?.pages?.length) return layout;
  if (countContentBlocks(layout) > 0) return layout;
  return optimizeAddMissingProfileSections(layout, cv || {});
}

/** template_id technique « imported » → id réel pour Stable / render-html. */
export function resolveImportPersistTemplateId(recommendedTemplateId, fallbackTemplateId = '') {
  const id = String(recommendedTemplateId || '').trim();
  if (!id || id === 'imported') {
    return String(fallbackTemplateId || '').trim() || 'minimal';
  }
  return id;
}

/**
 * Vrai si le profil a du contenu réel (post-onboarding / import data-only)
 * pour générer un canvas Beta sans forcer un nouvel import fichier.
 */
export function cvHasSeedableProfileContent(cv) {
  const synced = syncCvDualKeys(cv || {});
  if (
    String(synced.prenom || '').trim()
    || String(synced.first_name || '').trim()
    || String(synced.nom || '').trim()
    || String(synced.last_name || '').trim()
    || String(synced.email || '').trim()
    || String(synced.telephone || '').trim()
    || String(synced.titre_professionnel || '').trim()
    || String(synced.resume || '').trim()
  ) {
    return true;
  }
  const experiences = resolveExperiences(synced);
  if (experiences.some((e) => (
    String(e?.poste || '').trim()
    || String(e?.entreprise || '').trim()
    || (e?.bullet_points || []).some((b) => String(b || '').trim())
  ))) {
    return true;
  }
  const formations = resolveFormations(synced);
  if (formations.some((f) => (
    String(f?.diplome || '').trim()
    || String(f?.etablissement || '').trim()
  ))) {
    return true;
  }
  const analysis = analyzeCvProfile(synced);
  return analysis.skillCount > 0 || analysis.langCount > 0 || analysis.certCount > 0;
}

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
  const synced = syncCvDualKeys(cv || {});
  const experiences = resolveExperiences(synced);
  const formations = resolveFormations(synced);
  const certifications = resolveCertifications(synced);
  const projets = resolveProjets(synced);
  const langues = resolveLangues(synced);
  const techniques = resolveCompetenceList(synced, 'competences.techniques');
  const logiciels = resolveCompetenceList(synced, 'competences.logiciels');
  const autres = resolveCompetenceList(synced, 'competences.autres');
  const resume = String(synced?.resume || '').trim();
  const titre = String(synced?.titre_professionnel || '').trim().toLowerCase();
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
    hasPhoto: Boolean(resolvePhotoUrl(synced)),
    hasContact: Boolean(
      String(synced?.email || '').trim()
      || String(synced?.telephone || '').trim()
      || String(synced?.linkedin || '').trim(),
    ),
    hasIdentity: Boolean(
      String(synced?.prenom || '').trim()
      || String(synced?.first_name || '').trim()
      || String(synced?.nom || '').trim()
      || String(synced?.last_name || '').trim()
      || String(synced?.titre_professionnel || '').trim(),
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

const KNOWN_TEMPLATE_IDS = new Set(STABLE_CANVAS_TEMPLATE_IDS);

/** Choisit le template le plus adapté au profil importé. */
export function recommendTemplateId(analysis, templatesList = [], currentTemplateId = '', layoutHints = {}) {
  const ids = new Set((templatesList || []).map((t) => t?.id).filter(Boolean));
  const pick = (id) => (ids.has(id) ? id : null);

  const visionTemplate = String(layoutHints?.template_match || '').trim();
  if (KNOWN_TEMPLATE_IDS.has(visionTemplate) && pick(visionTemplate)) {
    return visionTemplate;
  }

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
export function summarizeImportAdaptation(analysis, templateLabel, blockCount = 0, { fromVision = false } = {}) {
  const parts = [];
  if (analysis.expCount) parts.push(`${analysis.expCount} exp.`);
  if (analysis.formationCount) parts.push(`${analysis.formationCount} form.`);
  if (analysis.skillCount) parts.push(`${analysis.skillCount} compétences`);
  const body = parts.length ? parts.join(' · ') : 'Profil structuré';
  const blocks = blockCount > 0 ? ` · ${blockCount} blocs` : '';
  const mode = fromVision ? `style ${templateLabel}` : templateLabel;
  return `${body} - ${mode}${blocks}`;
}

const VISION_MIN_CONFIDENCE = 0.15;

function cloneBlock(block) {
  return JSON.parse(JSON.stringify(block));
}

function layoutHasSidebarBackground(blocks) {
  return (blocks || []).some((b) => (
    b?.type === 'shape:rect'
    && (Number(b.w) || 0) > 35
    && (Number(b.h) || 0) > PAGE_HEIGHT_MM * 0.5
    && (Number(b.x) || 0) < PAGE_WIDTH_MM * 0.35
  ));
}

function layoutHasHeaderBand(blocks) {
  return (blocks || []).some((b) => (
    b?.type === 'shape:rect'
    && (Number(b.y) || 0) < 12
    && (Number(b.h) || 0) < 75
    && (Number(b.w) || 0) > PAGE_WIDTH_MM * 0.55
  ));
}

/** Complète un layout vision avec bandeaux / lignes du preset le plus proche. */
export function mergePresetDecorations(visionLayout, presetLayout) {
  if (!visionLayout?.pages?.[0] || !presetLayout?.pages?.[0]) return visionLayout;
  const vBlocks = visionLayout.pages[0].blocks || [];
  const presetBlocks = presetLayout.pages[0].blocks || [];
  const hasSidebar = layoutHasSidebarBackground(vBlocks);
  const hasHeader = layoutHasHeaderBand(vBlocks);

  const decor = presetBlocks.filter((b) => {
    if (b.type !== 'shape:rect' && b.type !== 'shape:line') return false;
    if (b.type === 'shape:rect' && (Number(b.h) || 0) > PAGE_HEIGHT_MM * 0.5 && hasSidebar) return false;
    if (b.type === 'shape:rect' && (Number(b.y) || 0) < 12 && (Number(b.h) || 0) < 75 && hasHeader) return false;
    return true;
  }).map(cloneBlock);

  const mergedBlocks = [...decor, ...vBlocks.map(cloneBlock)];
  const presetTheme = presetLayout.theme || {};
  return {
    ...visionLayout,
    theme: { ...presetTheme, ...visionLayout.theme, template_id: 'imported' },
    pages: [{
      ...visionLayout.pages[0],
      blocks: mergedBlocks,
    }],
  };
}

/** Fusionne les hints API + détection vision. */
export function mergeVisionLayoutHints(layoutHints = {}, visionMeta = {}) {
  const merged = { ...layoutHints };
  if (visionMeta?.template_match) merged.template_match = visionMeta.template_match;
  if (visionMeta?.layout_style) merged.layout_style = visionMeta.layout_style;
  const dom = visionMeta?.dominant_colors;
  if (dom && typeof dom === 'object') {
    if (isValidHexColor(dom.accent)) merged.accent_color = dom.accent;
    if (isValidHexColor(dom.sidebar)) merged.sidebar_color = dom.sidebar;
    if (isValidHexColor(dom.header)) merged.header_color = dom.header;
    if (isValidHexColor(dom.body_text)) merged.body_text_color = dom.body_text;
  }
  const sections = visionMeta?.sections_found || visionMeta?.sections_in_main;
  if (Array.isArray(sections) && sections.length) {
    merged.sections_emphasis = sections;
  }
  if (Array.isArray(visionMeta?.sections_in_sidebar)) {
    merged.sections_in_sidebar = visionMeta.sections_in_sidebar;
  }
  if (Array.isArray(visionMeta?.sections_in_main)) {
    merged.sections_in_main = visionMeta.sections_in_main;
  }
  return merged;
}

/** Thème import PDF : couleurs vision uniquement (jamais preset template / profil). */
export function buildThemeFromVisionImport(visionMeta = {}, layoutHints = {}, template = null) {
  const fonts = template ? parseCanvasTheme(template) : {};
  const theme = {
    template_id: template?.id || 'imported',
    font_heading: fonts.font_heading || 'Inter, sans-serif',
    font_body: fonts.font_body || fonts.font_heading || 'Inter, sans-serif',
    color_body: '#1a1a1a',
  };

  const dom = visionMeta?.dominant_colors && typeof visionMeta.dominant_colors === 'object'
    ? visionMeta.dominant_colors
    : {};

  const accent = [dom.accent, layoutHints.accent_color].find(isValidHexColor);
  const sidebar = [dom.sidebar, layoutHints.sidebar_color].find(isValidHexColor);
  const header = [dom.header, layoutHints.header_color].find(isValidHexColor);
  const bodyText = [dom.body_text, layoutHints.body_text_color].find(isValidHexColor);

  if (accent) {
    theme.color_accent = accent;
    theme.color_section_title = accent;
  }
  if (sidebar) theme.color_sidebar = sidebar;
  if (header) theme.color_header = header;
  if (bodyText) theme.color_body = bodyText;

  if (!theme.color_accent) theme.color_accent = '#1e2a3a';
  if (!theme.color_section_title) theme.color_section_title = theme.color_accent;
  if (!theme.color_header) theme.color_header = theme.color_accent;
  if (!theme.color_sidebar) theme.color_sidebar = '#f4f4f5';

  return theme;
}

function finalizeImportLayout(layout, visionMeta, layoutHints, template, recommendedTemplateId) {
  const layoutTemplate = stripTemplateColorOptions(template);
  const mergedHints = mergeVisionLayoutHints(layoutHints, visionMeta);
  const importTheme = buildThemeFromVisionImport(visionMeta, mergedHints, layoutTemplate);
  importTheme.template_id = recommendedTemplateId || importTheme.template_id;
  return applyThemeColorsToDecorativeBlocks({ ...layout, theme: importTheme });
}

/** Retire les couleurs sauvegardées du template utilisateur (import = couleurs PDF). */
function stripTemplateColorOptions(template) {
  if (!template?.options?.length) return template;
  return {
    ...template,
    options: template.options.filter(
      (o) => !['accent_color', 'sidebar_color', 'header_color'].includes(o?.key),
    ),
  };
}

const HEADER_BAND_TEMPLATES = new Set(['executive', 'bold']);

function isRightSidebarLayout(layoutStyle = '', templateId = '') {
  return layoutStyle === 'sidebar-right' || HEADER_BAND_TEMPLATES.has(templateId);
}

function isSingleColumnLayout(layoutStyle = '', templateId = '') {
  return layoutStyle === 'single-column' || templateId === 'minimal' || templateId === 'elegant';
}

function visionLaneForSectionType(type, visionMeta = {}) {
  const key = type === 'skills' ? 'skills' : type;
  const inSidebar = visionMeta?.sections_in_sidebar || [];
  const inMain = visionMeta?.sections_in_main || [];
  if (inSidebar.includes(key)) return 'sidebar';
  if (inMain.includes(key)) return 'main';
  return null;
}

function columnMetricsForLayout(layoutStyle, templateId) {
  if (isSingleColumnLayout(layoutStyle, templateId)) return null;
  const { SB, MAIN_L, MAIN_R, SB_R } = LAYOUT;
  if (isRightSidebarLayout(layoutStyle, templateId)) {
    return {
      sidebar: { x: SB_R.x + SIDE_PAD_X, w: SB_R.w - SIDE_PAD_X * 2, zone: 'sidebar-light' },
      main: { x: MAIN_R.x + MAIN_PAD_X, w: MAIN_R.w - MAIN_PAD_X * 2, zone: 'main' },
    };
  }
  return {
    sidebar: { x: SIDE_PAD_X, w: SB - SIDE_PAD_X * 2, zone: 'sidebar' },
    main: { x: MAIN_L.x + MAIN_PAD_X, w: MAIN_L.w - MAIN_PAD_X * 2, zone: 'main' },
  };
}

const VISION_MOVABLE_TYPES = new Set([
  'experiences', 'formations', 'certifications', 'languages', 'projets', 'skills',
]);

const HEADER_ZONE_TYPES = new Set(['header', 'sidebar-light']);

/** Repositionne les sections selon sections_in_sidebar / sections_in_main (vision PDF). */
export function applyVisionSectionPlacement(layout, visionMeta = {}, {
  layoutStyle = '',
  templateId = '',
} = {}) {
  if (!layout?.pages?.length) return layout;
  const metrics = columnMetricsForLayout(
    layoutStyle || visionMeta?.layout_style || '',
    templateId,
  );
  if (!metrics) return layout;

  const skipHeaderTypes = visionMeta?.has_header_band && HEADER_BAND_TEMPLATES.has(templateId)
    ? new Set(['identity', 'contact', 'resume', 'photo'])
    : new Set(['identity', 'contact', 'photo', 'resume']);

  const pages = layout.pages.map((page) => ({
    ...page,
    blocks: (page.blocks || []).map((block) => {
      if (DECORATIVE_TYPES.has(block.type) || !VISION_MOVABLE_TYPES.has(block.type)) {
        return block;
      }
      if (skipHeaderTypes.has(block.type)) return block;

      const targetLane = visionLaneForSectionType(block.type, visionMeta);
      if (!targetLane) return block;

      const currentLane = blockLane(block);
      if (currentLane === targetLane) return block;

      const col = metrics[targetLane];
      const style = { ...(block.style || {}), zone: col.zone };
      if (targetLane === 'sidebar' && templateId === 'creative') {
        style.color = 'rgba(255,255,255,0.92)';
        style.title_style = style.title_style || 'sidebar-creative';
      }
      return {
        ...block,
        x: col.x,
        w: col.w,
        style,
      };
    }),
  }));

  return { ...layout, pages };
}

/** Applique photo_shape détectée par la vision (cercle / carré). */
export function applyVisionPhotoShape(layout, visionMeta = {}) {
  const shape = visionMeta?.photo_shape;
  if (!shape || !layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => ({
    ...page,
    blocks: (page.blocks || []).map((block) => (
      block.type === 'photo' || block.type === 'image'
        ? { ...block, style: { ...(block.style || {}), shape } }
        : block
    )),
  }));
  return { ...layout, pages };
}

function isSquarePhotoSized(w, h) {
  if (w <= 0 || h <= 0) return false;
  const ratio = w / h;
  if (ratio < 0.85 || ratio > 1.18) return false;
  const side = Math.max(w, h);
  const short = Math.min(w, h);
  return side >= 12 && side <= 90 && short >= 9;
}

function blockOverlapRatio(a, b) {
  const ax = Number(a.x) || 0;
  const ay = Number(a.y) || 0;
  const aw = Number(a.w) || 0;
  const ah = Number(a.h) || 0;
  const bx = Number(b.x) || 0;
  const by = Number(b.y) || 0;
  const bw = Number(b.w) || 0;
  const bh = Number(b.h) || 0;
  if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0;
  const x0 = Math.max(ax, bx);
  const y0 = Math.max(ay, by);
  const x1 = Math.min(ax + aw, bx + bw);
  const y1 = Math.min(ay + ah, by + bh);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const smaller = Math.min(aw * ah, bw * bh);
  return smaller > 0 ? inter / smaller : 0;
}

/** Retire icônes / cercles vectoriels superposés aux photos importées. */
export function cleanupImportedImageOverlays(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = [...(page.blocks || [])];
    const images = blocks.filter((b) => b.type === 'image' || b.type === 'photo');
    const photoTargets = images.filter((b) => isSquarePhotoSized(Number(b.w) || 0, Number(b.h) || 0));
    const targets = photoTargets.length ? photoTargets : images;
    if (!targets.length) return page;

    for (const img of images) {
      for (const other of blocks) {
        if (other.type !== 'icon' && other.type !== 'shape:circle') continue;
        const side = Math.max(Number(other.w) || 0, Number(other.h) || 0);
        if (other.type === 'shape:circle' && side < 12) continue;
        if (blockOverlapRatio(other, img, 0.18) >= 0.18) {
          img.style = { ...(img.style || {}), shape: 'circle' };
        }
      }
    }

    const filtered = blocks.filter((block) => {
      if (block.type === 'icon' && targets.some((img) => blockOverlapRatio(block, img, 0.22) >= 0.22)) {
        return false;
      }
      if (block.type === 'shape:circle') {
        const side = Math.max(Number(block.w) || 0, Number(block.h) || 0);
        if (side >= 12 && targets.some((img) => blockOverlapRatio(block, img, 0.18) >= 0.18)) {
          return false;
        }
      }
      return true;
    });
    return { ...page, blocks: filtered };
  });
  return { ...layout, pages };
}

/** Renforce shape:circle sur les photos importées (anneau vectoriel ou format carré photo). */
export function applyImportedRoundImageShapes(layout) {
  const cleaned = cleanupImportedImageOverlays(layout);
  if (!cleaned?.pages?.length) return cleaned;

  const pages = cleaned.pages.map((page) => ({
    ...page,
    blocks: (page.blocks || []).map((block) => {
      if (block.type !== 'image' && block.type !== 'photo') return block;
      if (block.style?.shape === 'circle') return block;
      const w = Number(block.w) || 0;
      const h = Number(block.h) || 0;
      if (!isSquarePhotoSized(w, h)) return block;
      return { ...block, style: { ...(block.style || {}), shape: 'circle' } };
    }),
  }));
  return { ...cleaned, pages };
}

/** Recolore bandeaux / sidebar du preset selon le thème vision. */
export function applyThemeColorsToDecorativeBlocks(layout) {
  if (!layout?.pages?.length) return layout;
  const theme = layout.theme || {};
  const accent = theme.color_accent;
  const sidebar = theme.color_sidebar;
  const header = theme.color_header;

  const pages = layout.pages.map((page) => ({
    ...page,
    blocks: (page.blocks || []).map((block) => {
      if (block.type !== 'shape:rect' && block.type !== 'shape:line') return block;
      const w = Number(block.w) || 0;
      const h = Number(block.h) || 0;
      const x = Number(block.x) || 0;
      const y = Number(block.y) || 0;
      const style = { ...(block.style || {}) };

      if (block.type === 'shape:rect') {
        if (h > PAGE_HEIGHT_MM * 0.45 && w < PAGE_WIDTH_MM * 0.4 && sidebar) {
          style.color = sidebar;
        } else if (y < 14 && h < 80 && w > PAGE_WIDTH_MM * 0.45 && header) {
          style.color = header;
        } else if (h < 3 && accent) {
          style.color = accent;
        }
      }
      if (block.type === 'shape:line' && accent) {
        style.color = accent;
      }
      if (x > PAGE_WIDTH_MM * 0.62 && h > PAGE_HEIGHT_MM * 0.4 && sidebar) {
        style.color = sidebar;
      }
      return { ...block, style };
    }),
  }));

  return { ...layout, pages };
}

/**
 * Pipeline fiable : vision classifie template + couleurs → preset canvas calibré.
 */
export function buildLayoutFromVisionDetection(cv, visionMeta = {}, templatesList = [], {
  templateId = '',
  layoutHints = {},
} = {}) {
  const analysis = analyzeCvProfile(cv);
  const mergedHints = mergeVisionLayoutHints(layoutHints, visionMeta);
  const recommendedTemplateId = recommendTemplateId(
    analysis,
    templatesList,
    templateId,
    mergedHints,
  );
  const template = (templatesList || []).find((t) => t?.id === recommendedTemplateId)
    || (templatesList || [])[0];
  const layoutTemplate = stripTemplateColorOptions(template);

  let result = buildAdaptedCanvasLayoutForCv(cv, layoutTemplate, {
    templatesList,
    templateId: recommendedTemplateId,
    layoutHints: mergedHints,
    forImport: true,
    skipAdaptReorder: true,
  });

  let layout = result.layout;
  layout = applyVisionSectionPlacement(layout, visionMeta, {
    layoutStyle: mergedHints.layout_style || visionMeta?.layout_style,
    templateId: recommendedTemplateId,
  });
  layout = applyVisionPhotoShape(layout, visionMeta);

  const analysis2 = analyzeCvProfile(cv);
  // Répliques freeform (elegant/minimal) : ne pas réordonner / reflow ATS.
  if (!layout.freeform) {
    layout = reorderSemanticBlocksByPriority(layout, cv, analysis2, mergedHints);
    for (let pi = 0; pi < (layout.pages?.length || 0); pi += 1) {
      layout = reflowColumnBlocksOnPage(layout, pi);
    }
  }
  layout = applyLayoutPagination(layout);

  result.layout = finalizeImportLayout(
    layout,
    visionMeta,
    mergedHints,
    template,
    recommendedTemplateId,
  );
  result.layout = ensureImportLayoutHasContent(result.layout, cv);

  return {
    ...result,
    layout: result.layout,
    blockCount: countLayoutBlocks(result.layout),
    contentBlockCount: countContentBlocks(result.layout),
    recommendedTemplateId: resolveImportPersistTemplateId(
      recommendedTemplateId,
      template?.id || 'minimal',
    ),
    importSource: 'vision-guided',
    visionConfidence: Number(visionMeta?.confidence ?? 0),
  };
}

export function inferThemeFromProfile(analysis, layoutHints = {}, { skipPresets = false } = {}) {
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

  if (!skipPresets && !theme.color_accent) {
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
  let h = 8; // titre de section
  for (const e of exps) {
    const bullets = (e.bullet_points || []).filter((b) => String(b || '').trim()).length;
    h += 8 + bullets * 3.2;
  }
  return Math.min(220, Math.max(18, h));
}

function estimateListHeight(count, itemHmm = 4.2, base = 8, max = 80) {
  if (!count) return 0;
  // Floor bas : le padding CSS twin + auto-height finalisent la hauteur réelle.
  return Math.min(max, Math.max(7, base + count * itemHmm));
}

function estimateSkillsHeight(block, cv) {
  const items = resolveCompetenceList(cv, block.bind || 'competences.techniques');
  const outils = block.style?.skills_nested_outils
    ? resolveCompetenceList(cv, 'competences.logiciels')
    : [];
  const total = items.length + outils.length;
  if (!total) return 0;
  const isChips = block.style?.format === 'chips';
  if (isChips) {
    const rows = Math.ceil(total / 5);
    return Math.min(55, Math.max(16, 12 + rows * 5.5));
  }
  // Sidebar catégorie seule (sans titre COMPÉTENCES) : base plus basse.
  const baseHmm = block.style?.section_label ? 9 : 5.5;
  const base = estimateListHeight(items.length, 3.4, baseHmm, 50);
  return outils.length ? Math.min(60, base + 6) : base;
}

const SEMANTIC_MIN_HEIGHT_MM = 10;
/** Floor bas quand on shrink-to-content (répliques) — évite des blocs sidebar trop hauts. */
const SEMANTIC_SHRINK_FLOOR_MM = 7;

/** Hauteur estimée (mm) d'un bloc sémantique selon le CV. */
export function estimateSemanticBlockHeight(block, cv, { respectCurrentMin = false } = {}) {
  const floor = respectCurrentMin
    ? (Number(block.h) || SEMANTIC_MIN_HEIGHT_MM)
    : SEMANTIC_SHRINK_FLOOR_MM;
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
      if (block.style?.zone === 'header') {
        return Math.min(14, Math.max(10, 8 + chars * 0.06));
      }
      // Titre section + corps 9pt : ancien 0.22 mm/char gonflait Profil→Expérience.
      return Math.max(11, Math.min(40, 8 + chars * 0.12));
    }
    case 'experiences':
      return Math.max(floor, estimateExperiencesHeight(cv));
    case 'formations':
      return Math.max(floor, estimateListHeight(resolveFormations(cv).length, 6, 8, 70));
    case 'certifications': {
      const n = resolveCertifications(cv).length;
      const base = block.style?.sidebar_category && !block.style?.section_label ? 5 : 7;
      return Math.max(floor, estimateListHeight(n, 4.5, base, 45));
    }
    case 'projets':
      return Math.max(floor, estimateListHeight(resolveProjets(cv).length, 8, 8, 65));
    case 'languages':
      return Math.max(floor, estimateListHeight(resolveLangues(cv).length, 3.6, 7, 35));
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

const REPLICA_CASCADE_GAP_MM = 0;

/**
 * Réplique Stable (freeform) : ajuste h au contenu et empile sans chevauchement,
 * en respectant `lock_geometry` / photo (header figé).
 * Cascade **par lane** (header / main / sidebar) — un seul curseur vertical
 * cassait Classic (sidebar-right) et poussait le texte en page 2.
 * Ne réordonne PAS les types (contrairement à ATS spatial).
 */
export function fitReplicaLayoutToContent(layout, cv) {
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
      const sorted = [...laneBlocks].sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
      let cursorBottom = null;
      for (const block of sorted) {
        const locked = Boolean(block.style?.lock_geometry) || block.type === 'photo';
        let h = Number(block.h) || 0;
        let y = Number(block.y) || 0;
        if (!locked) {
          const est = estimateSemanticBlockHeight(block, cv, { respectCurrentMin: false });
          if (est > 0 && Math.abs(est - h) > 0.8) {
            h = est;
            next = patchBlockHeight(next, block.id, h);
          }
        }
        if (!locked && cursorBottom != null) {
          // Snap (monter ou descendre) — sinon les y preset trop bas laissent des trous
          // après shrink (sidebar Classic : Logiciels/Certifs/Langues trop espacés).
          const targetY = cursorBottom + REPLICA_CASCADE_GAP_MM;
          if (Math.abs(y - targetY) > 0.05) {
            y = targetY;
            next = setBlockPosition(next, block.id, { x: Number(block.x) || 0, y });
          }
        }
        const bottom = y + Math.max(h, 0.2);
        cursorBottom = cursorBottom == null ? bottom : Math.max(cursorBottom, bottom);
      }
    }
  }
  return next;
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
      const zone = block.style?.zone;
      if (zone === 'header') continue;
      if (block.style?.lock_geometry) continue;
      const lane = blockLane(block);
      if (HEADER_ZONE_TYPES.has(lane)) continue;
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
  fromVision = false,
  forImport = false,
  preserveReplicaGeometry = false,
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
  const keepGeometry = Boolean(preserveReplicaGeometry || next.freeform);
  let removedBlockCount = 0;
  let resizedBlockCount = 0;

  for (const page of next.pages || []) {
    for (const block of [...(page.blocks || [])]) {
      if (!blockHasRenderableContent(block, cv, analysis)) {
        next = removeBlock(next, block.id);
        removedBlockCount += 1;
        continue;
      }
      if (keepGeometry || block.style?.lock_geometry) continue;
      const est = estimateSemanticBlockHeight(block, cv, { respectCurrentMin: false });
      const cur = Number(block.h) || 0;
      if (est > 0 && Math.abs(est - cur) > 1.5) {
        next = patchBlockHeight(next, block.id, est);
        resizedBlockCount += 1;
      }
    }
  }

  if (!keepGeometry && !fromVision && !forImport) {
    next = reorderSemanticBlocksByPriority(next, cv, analysis, layoutHints);
  }

  if (!keepGeometry) {
    for (let pi = 0; pi < (next.pages?.length || 0); pi += 1) {
      next = reflowColumnBlocksOnPage(next, pi);
    }
  }

  // ATS spatial réordonne identity→contact→photo et casse les répliques Stable
  // (ex. Élégant : photo centrée au-dessus du nom). Skip si géométrie préservée.
  // Cascade verticale uniquement pour les répliques déclarées (`replica_cascade`),
  // pas pour un freeform PDF multi-colonnes.
  if (keepGeometry) {
    if (next.replica_cascade === true) {
      next = fitReplicaLayoutToContent(next, cv);
    }
    next = applyLayoutPagination(next);
  } else {
    next = applyLayoutPagination(next);
    next = applyAtsLayoutOptimizations(next);
  }

  if (!fromVision && !forImport) {
    const themePatch = inferThemeFromProfile(analysis, layoutHints);
    next = {
      ...next,
      theme: { ...next.theme, ...themePatch, template_id: recommendedTemplateId },
    };
  }

  if (forImport) {
    next = ensureImportLayoutHasContent(next, cv);
  }

  return {
    layout: next,
    analysis,
    recommendedTemplateId,
    removedBlockCount,
    resizedBlockCount,
    blockCount: countLayoutBlocks(next),
    contentBlockCount: countContentBlocks(next),
  };
}

/**
 * Pipeline complet : template → layout → adaptation au CV importé.
 */
export function buildAdaptedCanvasLayoutForCv(cv, template, options = {}) {
  const base = createCanvasLayoutForTemplate(
    template,
    options.optionValues || options.templateOptions || null,
  );
  const templateId = template?.id || options.templateId || '';
  const preserveReplicaGeometry = Boolean(
    options.preserveReplicaGeometry
    || templateId === 'minimal'
    || templateId === 'elegant'
    || templateId === 'classic'
    || base?.freeform,
  );
  const result = adaptCanvasLayoutForCv(cv, base, {
    templatesList: options.templatesList,
    templateId,
    layoutHints: options.layoutHints || {},
    forImport: Boolean(options.forImport),
    preserveReplicaGeometry,
  });
  let layout = result.layout;
  if (!options.skipAdaptReorder && !preserveReplicaGeometry) {
    for (let pi = 0; pi < (layout.pages?.length || 0); pi += 1) {
      layout = reflowColumnBlocksOnPage(layout, pi);
    }
    layout = applyLayoutPagination(layout);
  }
  return {
    ...result,
    layout,
    blockCount: countLayoutBlocks(layout),
    contentBlockCount: countContentBlocks(layout),
  };
}

/**
 * Vrai si le layout fourni par le backend est une reconstruction structurelle
 * exploitable (copie fidèle du PDF, blocs positionnés en mm).
 */
export function isStructuralLayout(layout) {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.pages)) return false;
  const blocks = layout.pages.reduce((n, p) => n + (p?.blocks?.length || 0), 0);
  return blocks > 0;
}

function _isNearWhite(hex) {
  if (!hex || hex.length !== 7) return true;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return r > 235 && g > 235 && b > 235;
  } catch { return true; }
}

function _isNearBodyBlack(hex) {
  // Corps de texte courant : noir ou gris très sombre (#1a1a1a, #333…)
  if (!hex || hex.length !== 7) return true;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return r < 55 && g < 55 && b < 55;
  } catch { return true; }
}

/**
 * Infère color_accent, color_sidebar, color_header depuis tous les blocs
 * d'un layout structurel importé (couleurs dans block.style.color, pas dans le theme).
 *
 * Passe 1 – formes géométriques : sidebar, bandeau header, filets horizontaux.
 *   Pour l'accent on collecte TOUTES les couleurs de formes-ligne et on prend
 *   la plus fréquente (évite de bloquer sur le premier filet trouvé, qui peut
 *   être une décoration marginale).
 *
 * Passe 2 – blocs texte : fallback si aucune forme colorée trouvée (CVs
 *   colonne unique sans sidebar ni filet coloré). Pondère par font_size.
 */
function inferThemeColorsFromStructuralBlocks(layout) {
  if (!layout?.pages?.length) return {};
  const blocks = layout.pages.flatMap((p) => p.blocks || []);
  let colorSidebar = null;
  let colorHeader = null;

  // Fréquence des couleurs de filets/lignes (pour choisir la plus représentative)
  const lineColorFreq = new Map();

  for (const block of blocks) {
    const color = block.style?.color;
    if (!isValidHexColor(color) || _isNearWhite(color)) continue;

    const w = Number(block.w) || 0;
    const h = Number(block.h) || 0;
    const x = Number(block.x) || 0;
    const y = Number(block.y) || 0;

    if (block.type === 'shape:rect') {
      // Sidebar : grand rectangle vertical à gauche ou à droite
      if (h > PAGE_HEIGHT_MM * 0.45 && w < PAGE_WIDTH_MM * 0.4 && !colorSidebar) {
        colorSidebar = color;
      } else if (h > PAGE_HEIGHT_MM * 0.45 && x > PAGE_WIDTH_MM * 0.62 && !colorSidebar) {
        colorSidebar = color;
      // Bandeau header : rectangle large et peu haut, en haut de page
      } else if (y < 14 && h < 80 && w > PAGE_WIDTH_MM * 0.55 && !colorHeader) {
        colorHeader = color;
      // Filet / barre horizontale : très large par rapport à la hauteur
      } else if (w > h * 5 && w > 20) {
        lineColorFreq.set(color, (lineColorFreq.get(color) || 0) + w);
      }
    }

    if (block.type === 'shape:line') {
      // Filets explicites (type:line produit par pdf_structural_extract)
      lineColorFreq.set(color, (lineColorFreq.get(color) || 0) + (w || 10));
    }

    if (block.type === 'shape:circle' && Math.max(w, h) < 8) {
      // Puces colorées → potentiel accent
      lineColorFreq.set(color, (lineColorFreq.get(color) || 0) + 5);
    }
  }

  // Couleur d'accent = couleur de filet la plus fréquente (pondérée par largeur)
  let colorAccent = null;
  if (lineColorFreq.size > 0) {
    colorAccent = [...lineColorFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Fallback texte : si aucune forme colorée, chercher dans les gros titres
  if (!colorAccent) {
    const textColorFreq = new Map();
    for (const block of blocks) {
      if (block.type !== 'text') continue;
      const color = block.style?.color;
      if (!isValidHexColor(color) || _isNearWhite(color) || _isNearBodyBlack(color)) continue;
      const weight = Number(block.style?.font_size) || 10;
      textColorFreq.set(color, (textColorFreq.get(color) || 0) + weight);
    }
    if (textColorFreq.size > 0) {
      colorAccent = [...textColorFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  // Fallback accent depuis header/sidebar si toujours rien
  if (!colorAccent && colorHeader) colorAccent = colorHeader;
  if (!colorAccent && colorSidebar) colorAccent = colorSidebar;

  const patch = {};
  if (colorSidebar) patch.color_sidebar = colorSidebar;
  if (colorHeader) patch.color_header = colorHeader;
  if (colorAccent) {
    patch.color_accent = colorAccent;
    patch.color_section_title = colorAccent;
  }
  return patch;
}

/**
 * Import "copier-coller" : on utilise tel quel le layout reconstruit depuis le
 * PDF (texte, formes, images positionnés). Aucun preset, aucune IA - juste un
 * nettoyage défensif via sanitizeLayoutV3.
 */
export function buildStructuralImportLayout(cv, structuralLayout, {
  templateId = '',
  annotations = null,
} = {}) {
  const analysis = analyzeCvProfile(cv);
  // `freeform` : positions absolues figées (cf. reflow/pagination) → copie
  // fidèle du PDF, jamais ré-empilée en colonnes par l'auto-height.
  const sanitized = sanitizeLayoutV3({ ...structuralLayout, freeform: true });
  // AXE-329 / AXE-332 : annotations API > heuristiques locales.
  const { layout: boundLayout } = bindStructuralTextToSemanticBlocks(sanitized, cv, {
    annotations: annotations
      ?? structuralLayout?.semantic_annotations
      ?? null,
  });
  const layout = applyLayoutPagination(boundLayout);
  // Python extrait les couleurs thème directement depuis page.get_drawings()
  // (fiable quel que soit le chemin de rendu). Le JS n'intervient qu'en
  // fallback pour les couleurs que Python n'a pas trouvées.
  const existingTheme = layout.theme || {};
  const DEFAULT_ACCENT = '#1e2a3a'; // valeur DEFAULT_THEME de cvLayoutModelV3
  const needsAccent = !existingTheme.color_accent || existingTheme.color_accent === DEFAULT_ACCENT;
  const needsSidebar = !existingTheme.color_sidebar;
  const needsHeader = !existingTheme.color_header;

  let finalLayout = applyImportedRoundImageShapes(layout);
  if (needsAccent || needsSidebar || needsHeader) {
    const inferredTheme = inferThemeColorsFromStructuralBlocks(layout);
    const patch = {};
    if (needsAccent && inferredTheme.color_accent) {
      patch.color_accent = inferredTheme.color_accent;
      patch.color_section_title = inferredTheme.color_section_title || inferredTheme.color_accent;
    }
    if (needsSidebar && inferredTheme.color_sidebar) patch.color_sidebar = inferredTheme.color_sidebar;
    if (needsHeader && inferredTheme.color_header) patch.color_header = inferredTheme.color_header;
    if (Object.keys(patch).length > 0) {
      finalLayout = { ...finalLayout, theme: { ...existingTheme, ...patch } };
    }
  }
  finalLayout = ensureImportLayoutHasContent(finalLayout, cv);
  const persistedTemplateId = resolveImportPersistTemplateId(
    templateId || finalLayout.theme?.template_id,
    'minimal',
  );
  finalLayout = {
    ...finalLayout,
    theme: { ...(finalLayout.theme || {}), template_id: persistedTemplateId },
  };
  return {
    layout: finalLayout,
    analysis,
    recommendedTemplateId: persistedTemplateId,
    removedBlockCount: 0,
    resizedBlockCount: 0,
    blockCount: countLayoutBlocks(finalLayout),
    contentBlockCount: countContentBlocks(finalLayout),
    importSource: 'structural',
  };
}

/**
 * Point d'entrée import Beta : CV + hints → canvas complet prêt à l'emploi.
 */
export function buildFullCanvasImportLayout(cv, templatesList = [], {
  templateId = '',
  layoutHints = {},
  visionLayout = null,
  visionMeta = {},
  annotations = null,
} = {}) {
  // Priorité absolue : reconstruction structurelle (copie fidèle du PDF natif).
  if (isStructuralLayout(visionLayout)) {
    return buildStructuralImportLayout(cv, visionLayout, {
      templateId,
      annotations: annotations ?? visionLayout?.semantic_annotations ?? null,
    });
  }

  const confidence = Number(visionMeta?.confidence ?? 0);
  const hasVisionDetection = Boolean(
    visionMeta?.source === 'gemini_vision'
    || visionMeta?.template_match
    || visionMeta?.layout_style
    || (visionMeta?.dominant_colors && confidence >= VISION_MIN_CONFIDENCE),
  );

  if (hasVisionDetection && (visionMeta?.template_match || confidence >= VISION_MIN_CONFIDENCE)) {
    return buildLayoutFromVisionDetection(cv, visionMeta, templatesList, {
      templateId,
      layoutHints,
    });
  }

  const analysis = analyzeCvProfile(cv);
  const recommendedTemplateId = recommendTemplateId(
    analysis,
    templatesList,
    templateId,
    layoutHints,
  );
  const template = (templatesList || []).find((t) => t?.id === recommendedTemplateId)
    || (templatesList || [])[0];
  const layoutTemplate = stripTemplateColorOptions(template);
  const mergedHints = mergeVisionLayoutHints(layoutHints, visionMeta);
  const result = buildAdaptedCanvasLayoutForCv(cv, layoutTemplate, {
    templatesList,
    templateId: recommendedTemplateId,
    layoutHints: mergedHints,
    forImport: true,
  });
  result.layout = finalizeImportLayout(
    result.layout,
    visionMeta,
    mergedHints,
    template,
    recommendedTemplateId,
  );
  result.layout = ensureImportLayoutHasContent(result.layout, cv);
  return {
    ...result,
    blockCount: countLayoutBlocks(result.layout),
    contentBlockCount: countContentBlocks(result.layout),
    importSource: 'preset',
  };
}
