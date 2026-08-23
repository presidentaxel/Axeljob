/**
 * Spécifications canvas calquées sur templates/*.css (mm, typo, blocs).
 * AXE-346 : viser des répliques natives ; la matrice de fidélité documente l’écart actuel.
 */
import { fontStackFromTemplateOption } from './canvasFontOptions.js';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './cvLayoutModelV3.js';

/** Catalogue Stable avec projection canvas (hors `custom_*` / `beta`). */
export const STABLE_CANVAS_TEMPLATE_IDS = Object.freeze([
  'minimal',
  'classic',
  'modern',
  'creative',
  'elegant',
  'executive',
  'bold',
]);

/**
 * Matrice AXE-346 — readiness réplique native (état projection actuelle).
 * @type {Readonly<Record<string, {
 *   name: string,
 *   layoutFamily: 'single-column' | 'sidebar-left' | 'sidebar-right',
 *   readiness: 'thin' | 'projection' | 'near-replica',
 *   fidelityCss: 'thin' | 'medium' | 'rich',
 *   gaps: string[],
 * }>>}
 */
export const TEMPLATE_CANVAS_FIDELITY = Object.freeze({
  minimal: {
    name: 'Minimal',
    layoutFamily: 'single-column',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: [
      'Typos injectées (--cv-fs-*) / densités Compact–Confort non projetées',
      'Pagination multi-page CV longs à valider',
    ],
  },
  classic: {
    name: 'Classique',
    layoutFamily: 'sidebar-right',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: [
      'Checklist visuelle Stable↔Beta (AXE-389)',
      'Densité PDF (pad compact) vs preview à valider',
    ],
  },
  modern: {
    name: 'Moderne',
    layoutFamily: 'sidebar-left',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: ['Checklist visuelle Stable↔Beta (AXE-391)', 'Densité PDF compacte à valider'],
  },
  creative: {
    name: 'Créatif',
    layoutFamily: 'sidebar-left',
    readiness: 'projection',
    fidelityCss: 'medium',
    gaps: ['Titres creative-main et bordures photo à valider visuellement'],
  },
  elegant: {
    name: 'Élégant',
    layoutFamily: 'single-column',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: ['Checklist visuelle Stable↔Beta avant merge'],
  },
  executive: {
    name: 'Executive',
    layoutFamily: 'sidebar-right',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: ['Checklist visuelle Stable↔Beta (AXE-392)', 'Densité PDF compacte à valider'],
  },
  bold: {
    name: 'Impact',
    layoutFamily: 'sidebar-right',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: ['Checklist visuelle Stable↔Beta (AXE-390)'],
  },
});

/** @param {string|null|undefined} id */
export function isStableCanvasTemplateId(id) {
  return STABLE_CANVAS_TEMPLATE_IDS.includes(String(id || '').trim());
}

/** @param {string|null|undefined} id */
export function getTemplateCanvasFidelity(id) {
  const key = String(id || '').trim();
  return TEMPLATE_CANVAS_FIDELITY[key] || null;
}

/** 200px @ 96dpi */
export const SIDEBAR_W_MM = (200 * 25.4) / 96;
export const MAIN_PAD_X = (18 * 25.4) / 96;
export const MAIN_PAD_Y = (16 * 25.4) / 96;
export const SIDE_PAD_X = (14 * 25.4) / 96;
export const SIDE_PAD_Y = (20 * 25.4) / 96;

export const LAYOUT = {
  SB: SIDEBAR_W_MM,
  MAIN_L: { x: SIDEBAR_W_MM, w: PAGE_WIDTH_MM - SIDEBAR_W_MM },
  MAIN_R: { x: 0, w: PAGE_WIDTH_MM - SIDEBAR_W_MM },
  SB_R: { x: PAGE_WIDTH_MM - SIDEBAR_W_MM, w: SIDEBAR_W_MM },
  H: PAGE_HEIGHT_MM,
};

function bg(x, y, w, h, color, z = 0) {
  return { type: 'shape:rect', x, y, w, h, z, style: { color } };
}

function bar(x, y, w, h, color, z = 1) {
  return { type: 'shape:rect', x, y, w, h, z, style: { color } };
}

/**
 * @param {object} template
 * @param {Record<string, unknown>|null|undefined} [optionValues] valeurs live (Stable template_options)
 */
export function parseCanvasTheme(template, optionValues = null) {
  const id = template?.id || 'classic';
  const theme = {
    template_id: id,
    font_heading: 'Inter, sans-serif',
    font_body: 'Inter, sans-serif',
    color_accent: '#1e2a3a',
    color_header: '#1e2a3a',
    color_sidebar: '#f4f4f2',
    color_section_title: '#1e2a3a',
    color_body: '#1a1a1a',
  };
  const defaults = {
    modern: { color_header: '#2d3748', color_sidebar: '#2d3748', color_accent: '#3182ce', color_section_title: '#3182ce', font: 'Inter' },
    creative: { color_header: '#6366f1', color_sidebar: '#6366f1', color_accent: '#f59e0b', color_section_title: '#6366f1', font: 'Plus Jakarta Sans' },
    executive: { color_header: '#0f172a', color_sidebar: '#f8f6f0', color_accent: '#b8860b', color_section_title: '#0f172a', font: 'Georgia' },
    bold: { color_header: '#1e293b', color_sidebar: '#f1f5f9', color_accent: '#dc2626', color_section_title: '#1e293b', font: 'Plus Jakarta Sans' },
    classic: { color_header: '#1e2a3a', color_sidebar: '#f4f4f2', color_accent: '#1e2a3a', color_section_title: '#1e2a3a', font: 'Plus Jakarta Sans' },
    minimal: { color_header: '#ffffff', color_accent: '#111827', color_section_title: '#111827', font: 'Georgia' },
    elegant: { color_header: '#ffffff', color_accent: '#4a5568', color_section_title: '#4a5568', font: 'Georgia' },
  }[id] || {};

  Object.assign(theme, {
    color_header: defaults.color_header ?? theme.color_header,
    color_sidebar: defaults.color_sidebar ?? theme.color_sidebar,
    color_accent: defaults.color_accent ?? theme.color_accent,
    color_section_title: defaults.color_section_title ?? theme.color_accent,
  });

  if (defaults.font) {
    theme.font_heading = fontStackFromTemplateOption(defaults.font);
    theme.font_body = id === 'executive' || id === 'minimal' || id === 'elegant'
      ? 'Inter, sans-serif'
      : theme.font_heading;
  }

  const live = optionValues && typeof optionValues === 'object' ? optionValues : null;
  const resolveOpt = (key, fallback) => {
    if (live && live[key] != null && String(live[key]).trim() !== '') return live[key];
    return fallback;
  };

  const opts = template?.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => {
      if (o?.key === 'accent_color') {
        const val = resolveOpt('accent_color', o.default);
        if (val) {
          theme.color_accent = val;
          // Bold Stable : titres corps restent slate ; accent = filets/dates seulement.
          if (id !== 'creative' && id !== 'bold') theme.color_section_title = val;
        }
      }
      if (o?.key === 'header_color') {
        const val = resolveOpt('header_color', o.default);
        if (val) theme.color_header = val;
      }
      if (o?.key === 'sidebar_color') {
        const val = resolveOpt('sidebar_color', o.default);
        if (val) theme.color_sidebar = val;
      }
      if (o?.key === 'font') {
        const val = resolveOpt('font', o.default);
        if (val) {
          theme.font_heading = fontStackFromTemplateOption(val);
          theme.font_body = id === 'executive' || id === 'minimal' || id === 'elegant'
            ? 'Inter, sans-serif'
            : theme.font_heading;
        }
      }
    });
  } else if (live) {
    // Template catalogue sans schema options (id seul) : appliquer les valeurs live.
    if (live.accent_color) {
      theme.color_accent = live.accent_color;
      if (id !== 'creative' && id !== 'bold') theme.color_section_title = live.accent_color;
    }
    if (live.header_color) theme.color_header = live.header_color;
    if (live.sidebar_color) theme.color_sidebar = live.sidebar_color;
    if (live.font) {
      theme.font_heading = fontStackFromTemplateOption(live.font);
      theme.font_body = id === 'executive' || id === 'minimal' || id === 'elegant'
        ? 'Inter, sans-serif'
        : theme.font_heading;
    }
  }
  if (id === 'creative') theme.color_section_title = theme.color_sidebar;
  return theme;
}

const side = (extra = {}) => ({
  zone: 'sidebar',
  align: 'center',
  font_size: 8,
  color: '#ffffff',
  show_section_title: true,
  title_style: 'sidebar',
  list_format: 'list',
  ...extra,
});

const sideCreative = (extra = {}) => ({
  zone: 'sidebar',
  align: 'center',
  font_size: 8,
  color: 'rgba(255,255,255,0.92)',
  show_section_title: true,
  title_style: 'sidebar-creative',
  list_format: 'list',
  ...extra,
});

const main = (extra = {}) => ({
  zone: 'main',
  font_size: 9,
  color: '#1a1a1a',
  ...extra,
});

const header = (extra = {}) => ({
  zone: 'header',
  color: '#ffffff',
  ...extra,
});

const sideLight = (extra = {}) => ({
  zone: 'sidebar-light',
  font_size: 8.5,
  color: '#333333',
  show_section_title: true,
  title_style: 'sidebar-category',
  list_format: 'list',
  ...extra,
});

const px = (n) => (n * 25.4) / 96;

/** Layout colonne gauche type Modern / Creative (sidebar 200px). */
function leftSidebarMetrics() {
  const SB = px(200);
  return {
    SB,
    SB_X: 0,
    SX: px(14),
    SY: px(20),
    MAIN_X: SB + px(18),
    MAIN_W: PAGE_WIDTH_MM - SB - px(36),
    MAIN_Y: px(16),
  };
}

/** Layout colonne droite type Impact / Executive (sidebar 200px). */
function rightSidebarMetrics() {
  const SB = px(200);
  return {
    SB,
    SB_X: PAGE_WIDTH_MM - SB,
    PAD: px(18),
    MAIN_W: PAGE_WIDTH_MM - SB - px(36),
    SB_INSET: px(12),
  };
}

/** Blocs compétences + outils (reflow ajuste les y). */
function sidebarCompetenceBlocks(x, w, startY, style, z, labels = {}) {
  return [
    {
      type: 'skills',
      bind: 'competences.techniques',
      x,
      y: startY,
      w,
      h: 30,
      z,
      style: { ...style, section_label: labels.tech || 'COMPÉTENCES', list_format: 'list' },
    },
    {
      type: 'skills',
      bind: 'competences.logiciels',
      x,
      y: startY + 34,
      w,
      h: 26,
      z,
      style: { ...style, section_label: labels.tools || 'OUTILS', list_format: 'list' },
    },
  ];
}

/** Sidebar type Executive / Classic / Bold (sous-titres catégorie). */
function sidebarCompetenceBlocksDetailed(x, w, startY, style, z) {
  return [
    {
      type: 'skills',
      bind: 'competences.techniques',
      x,
      y: startY,
      w,
      h: 30,
      z,
      style: {
        ...style,
        section_label: 'COMPÉTENCES',
        sidebar_category: 'Compétences techniques',
        title_style: 'bold-sidebar-section',
        list_format: 'list',
      },
    },
    {
      type: 'skills',
      bind: 'competences.logiciels',
      x,
      y: startY + 34,
      w,
      h: 26,
      z,
      style: { ...style, sidebar_category: 'Logiciels & outils', title_style: 'bold-sidebar-category', list_format: 'list' },
    },
    {
      type: 'certifications',
      bind: 'certifications',
      x,
      y: startY + 64,
      w,
      h: 24,
      z,
      style: { ...style, sidebar_category: 'Certifications', title_style: 'bold-sidebar-category', list_format: 'list' },
    },
    {
      type: 'languages',
      x,
      y: startY + 92,
      w,
      h: 20,
      z,
      style: { ...style, section_label: 'LANGUES', title_style: 'bold-main', list_format: 'list' },
    },
    {
      type: 'skills',
      bind: 'competences.autres',
      x,
      y: startY + 116,
      w,
      h: 24,
      z,
      style: { ...style, section_label: 'AUTRES', title_style: 'bold-main', list_format: 'list' },
    },
  ];
}

/**
 * @param {object} template
 * @param {Record<string, unknown>|null|undefined} [optionValues]
 */
export function buildTemplateBlocks(template, optionValues = null) {
  const id = template?.id;
  const t = parseCanvasTheme(template, optionValues);
  const { SB, MAIN_L, MAIN_R, SB_R, H } = LAYOUT;
  const sx = SIDE_PAD_X;
  const sy = SIDE_PAD_Y;
  const mx = MAIN_L.x + MAIN_PAD_X;
  const mw = MAIN_L.w - MAIN_PAD_X * 2;
  switch (id) {
    case 'modern': {
      // Réplique templates/modern : sidebar gauche (photo, identité, contact, skills…),
      // main droite PROFIL → EXP → FORMATION → PROJETS.
      const { SB, SX, SY, MAIN_X, MAIN_W, MAIN_Y } = leftSidebarMetrics();
      const PHOTO = px(80);
      const photoX = (SB - PHOTO) / 2;
      const identityY = SY + PHOTO + px(10);
      const identityH = px(40);
      const contactY = identityY + identityH + px(10);
      const sideW = SB - SX * 2;
      const sideLock = { lock_geometry: true };
      const sideCol = (extra = {}) => ({
        ...side(),
        title_style: 'modern-sidebar',
        font_family: t.font_heading,
        ...extra,
      });
      const mainCol = (extra = {}) => ({
        ...main(),
        title_style: 'modern-main',
        font_family: t.font_heading,
        ...extra,
      });
      return [
        bg(0, 0, SB, H, t.color_sidebar, 0),
        {
          type: 'photo',
          x: photoX,
          y: SY,
          w: PHOTO,
          h: PHOTO,
          z: 2,
          style: { shape: 'circle', zone: 'sidebar', photo_border: 'light', align: 'center', ...sideLock },
        },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: SX,
          y: identityY,
          w: sideW,
          h: identityH,
          z: 2,
          style: {
            ...sideCol(),
            align: 'center',
            identity_divider: true,
            identity_layout: 'modern-sidebar',
            ...sideLock,
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: SX,
          y: contactY,
          w: sideW,
          h: px(48),
          z: 2,
          style: { ...sideCol(), section_label: 'CONTACT', align: 'left' },
        },
        {
          type: 'skills',
          bind: 'competences.techniques',
          x: SX,
          y: contactY + px(52),
          w: sideW,
          h: px(40),
          z: 2,
          style: { ...sideCol(), section_label: 'COMPÉTENCES', align: 'left' },
        },
        {
          type: 'skills',
          bind: 'competences.logiciels',
          x: SX,
          y: contactY + px(96),
          w: sideW,
          h: px(34),
          z: 2,
          style: { ...sideCol(), section_label: 'OUTILS', align: 'left' },
        },
        {
          type: 'certifications',
          bind: 'certifications',
          x: SX,
          y: contactY + px(134),
          w: sideW,
          h: px(28),
          z: 2,
          style: { ...sideCol(), section_label: 'CERTIFICATIONS', align: 'left' },
        },
        {
          type: 'languages',
          x: SX,
          y: contactY + px(166),
          w: sideW,
          h: px(24),
          z: 2,
          style: { ...sideCol(), section_label: 'LANGUES', align: 'left' },
        },
        {
          type: 'skills',
          bind: 'competences.autres',
          x: SX,
          y: contactY + px(194),
          w: sideW,
          h: px(28),
          z: 2,
          style: { ...sideCol(), section_label: 'AUTRES', align: 'left' },
        },
        {
          type: 'resume',
          bind: 'resume',
          x: MAIN_X,
          y: MAIN_Y,
          w: MAIN_W,
          h: px(36),
          z: 1,
          style: {
            ...mainCol(),
            section_label: 'PROFIL',
            font_style: 'italic',
            align: 'justify',
          },
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: MAIN_X,
          y: MAIN_Y + px(42),
          w: MAIN_W,
          h: px(160),
          z: 1,
          style: {
            ...mainCol(),
            section_label: 'EXPÉRIENCE PROFESSIONNELLE',
            exp_style: 'modern',
          },
        },
        {
          type: 'formations',
          bind: 'formations',
          x: MAIN_X,
          y: MAIN_Y + px(208),
          w: MAIN_W,
          h: px(36),
          z: 1,
          style: {
            ...mainCol(),
            section_label: 'FORMATION',
            formation_style: 'minimal',
          },
        },
        {
          type: 'projets',
          bind: 'projets',
          x: MAIN_X,
          y: MAIN_Y + px(250),
          w: MAIN_W,
          h: px(28),
          z: 1,
          style: { ...mainCol(), section_label: 'PROJETS' },
        },
      ];
    }

    case 'creative':
      return [
        bg(0, 0, SB, H, t.color_sidebar, 0),
        { type: 'photo', x: SB / 2 - 11, y: sy, w: 22, h: 22, z: 2, style: { shape: 'circle', zone: 'sidebar', photo_border: 'accent' } },
        { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: sx, y: sy + 24, w: SB - sx * 2, h: 24, z: 2, style: { ...sideCreative(), font_size: 14, identity_divider: true, font_style: 'italic' } },
        { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: sx, y: sy + 50, w: SB - sx * 2, h: 22, z: 2, style: { ...sideCreative(), section_label: 'CONTACT', contact_divider: true } },
        ...sidebarCompetenceBlocks(sx, SB - sx * 2, sy + 76, sideCreative(), 2, { tools: 'OUTILS' }),
        { type: 'languages', x: sx, y: sy + 112, w: SB - sx * 2, h: 18, z: 2, style: { ...sideCreative(), section_label: 'LANGUES', list_format: 'list' } },
        { type: 'certifications', bind: 'certifications', x: sx, y: sy + 132, w: SB - sx * 2, h: 22, z: 2, style: { ...sideCreative(), section_label: 'CERTIFICATIONS', list_format: 'list' } },
        { type: 'skills', bind: 'competences.autres', x: sx, y: sy + 156, w: SB - sx * 2, h: 22, z: 2, style: { ...sideCreative(), section_label: 'AUTRES', list_format: 'list' } },
        { type: 'resume', bind: 'resume', x: mx, y: MAIN_PAD_Y, w: mw, h: 22, z: 1, style: { ...main(), section_label: 'PROFIL', title_style: 'creative-main', font_style: 'italic' } },
        { type: 'experiences', bind: 'experiences', x: mx, y: MAIN_PAD_Y + 26, w: mw, h: 130, z: 1, style: { ...main(), section_label: 'EXPÉRIENCE PROFESSIONNELLE', title_style: 'creative-main' } },
        { type: 'formations', bind: 'formations', x: mx, y: MAIN_PAD_Y + 160, w: mw, h: 30, z: 1, style: { ...main(), section_label: 'FORMATION', title_style: 'creative-main' } },
        { type: 'projets', bind: 'projets', x: mx, y: MAIN_PAD_Y + 194, w: mw, h: 26, z: 1, style: { ...main(), section_label: 'PROJETS', title_style: 'creative-main' } },
      ];

    case 'executive': {
      // Réplique templates/executive : header sombre + barre accent 3px, photo 60px,
      // identity inline, résumé sans titre, contact icônes centré ; main EXP/FORMATION/PROJETS ;
      // sidebar droite crème + filet accent.
      const { SB, SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const PHOTO_TOP = px(18);
      const PHOTO_H = px(60);
      const GAP = px(8);
      const RESUME_H = px(36);
      const CONTACT_H = px(14);
      const headerPadBottom = px(14);
      const ACCENT_BAR = px(3);
      const headerH = PHOTO_TOP + PHOTO_H + GAP + RESUME_H + GAP + CONTACT_H + headerPadBottom;
      const bodyY = headerH + ACCENT_BAR;
      const resumeY = PHOTO_TOP + PHOTO_H + GAP;
      const contactY = resumeY + RESUME_H + GAP;
      const bodyH = H - bodyY;
      const headerLock = { lock_geometry: true };
      const hdr = (extra = {}) => ({
        zone: 'header',
        color: '#ffffff',
        font_family: t.font_heading,
        ...headerLock,
        ...extra,
      });
      const mainCol = (extra = {}) => ({
        zone: 'main',
        font_size: 9.5,
        color: '#1a1a1a',
        font_family: t.font_heading,
        ...extra,
      });
      const sideCol = (extra = {}) => ({
        zone: 'sidebar-light',
        font_size: 8.5,
        color: '#333333',
        list_format: 'list',
        font_family: t.font_heading,
        ...extra,
      });
      const photoX = px(22);
      const identityX = photoX + PHOTO_H + px(16);
      return [
        bg(0, 0, PAGE_WIDTH_MM, headerH, t.color_header, 0),
        bar(0, headerH, PAGE_WIDTH_MM, ACCENT_BAR, t.color_accent, 1),
        bg(SB_X, bodyY, SB, bodyH, t.color_sidebar, 0),
        bar(SB_X, bodyY, px(1.5), bodyH, t.color_accent, 2),
        {
          type: 'photo',
          x: photoX,
          y: PHOTO_TOP,
          w: PHOTO_H,
          h: PHOTO_H,
          z: 5,
          style: { shape: 'circle', zone: 'header', photo_border: 'accent', ...headerLock },
        },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: identityX,
          y: PHOTO_TOP,
          w: PAGE_WIDTH_MM - identityX - px(22),
          h: PHOTO_H,
          z: 5,
          style: {
            ...hdr(),
            header_layout: 'inline-title',
            identity_layout: 'executive-header',
          },
        },
        {
          type: 'resume',
          bind: 'resume',
          x: photoX,
          y: resumeY,
          w: PAGE_WIDTH_MM - px(44),
          h: RESUME_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'justify',
            font_size: 9,
            color: 'rgba(255,255,255,0.9)',
            show_section_title: false,
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: photoX,
          y: contactY,
          w: PAGE_WIDTH_MM - px(44),
          h: CONTACT_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'center',
            contact_layout: 'header-bar',
            font_size: 8.5,
            contact_icons: true,
            contact_separator: ' ',
          },
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: PAD,
          y: bodyY + px(10),
          w: MAIN_W,
          h: px(160),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'EXPÉRIENCE PROFESSIONNELLE',
            title_style: 'executive-main',
            exp_style: 'executive',
          },
        },
        {
          type: 'formations',
          bind: 'formations',
          x: PAD,
          y: bodyY + px(176),
          w: MAIN_W,
          h: px(36),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'FORMATION',
            title_style: 'executive-main',
            formation_style: 'minimal',
          },
        },
        {
          type: 'projets',
          bind: 'projets',
          x: PAD,
          y: bodyY + px(218),
          w: MAIN_W,
          h: px(28),
          z: 2,
          style: { ...mainCol(), section_label: 'PROJETS', title_style: 'executive-main' },
        },
        {
          type: 'skills',
          bind: 'competences.techniques',
          x: SB_X + SB_INSET,
          y: bodyY + px(18),
          w: SB - SB_INSET * 2,
          h: px(52),
          z: 3,
          style: {
            ...sideCol(),
            section_label: 'COMPÉTENCES',
            sidebar_category: 'Compétences techniques',
            title_style: 'executive-sidebar-section',
          },
        },
        {
          type: 'skills',
          bind: 'competences.logiciels',
          x: SB_X + SB_INSET,
          y: bodyY + px(72),
          w: SB - SB_INSET * 2,
          h: px(40),
          z: 3,
          style: {
            ...sideCol(),
            sidebar_category: 'Logiciels & outils',
            title_style: 'executive-sidebar-category',
          },
        },
        {
          type: 'certifications',
          bind: 'certifications',
          x: SB_X + SB_INSET,
          y: bodyY + px(114),
          w: SB - SB_INSET * 2,
          h: px(28),
          z: 3,
          style: {
            ...sideCol(),
            sidebar_category: 'Certifications',
            title_style: 'executive-sidebar-category',
          },
        },
        {
          type: 'languages',
          x: SB_X + SB_INSET,
          y: bodyY + px(146),
          w: SB - SB_INSET * 2,
          h: px(22),
          z: 3,
          style: { ...sideCol(), section_label: 'LANGUES', title_style: 'executive-main' },
        },
        {
          type: 'skills',
          bind: 'competences.autres',
          x: SB_X + SB_INSET,
          y: bodyY + px(170),
          w: SB - SB_INSET * 2,
          h: px(30),
          z: 3,
          style: { ...sideCol(), section_label: 'AUTRES', title_style: 'executive-main' },
        },
      ];
    }

    case 'bold': {
      const { SB, SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const PHOTO_TOP = px(20);
      const PHOTO_H = px(64);
      const GAP = px(10);
      const RESUME_H = px(36);
      const CONTACT_H = px(14);
      const headerPadBottom = px(16);
      const headerH = PHOTO_TOP + PHOTO_H + GAP + RESUME_H + GAP + CONTACT_H + headerPadBottom;
      const bodyY = headerH + px(4);
      const resumeY = PHOTO_TOP + PHOTO_H + GAP;
      const contactY = resumeY + RESUME_H + GAP;
      const bodyH = H - bodyY;
      // Header figé : sinon replica_cascade empile identity sous la photo (même lane).
      const headerLock = { lock_geometry: true };
      const hdr = (extra = {}) => ({
        zone: 'header',
        color: '#ffffff',
        font_family: t.font_heading,
        ...headerLock,
        ...extra,
      });
      const mainCol = (extra = {}) => ({
        zone: 'main',
        font_size: 9,
        color: '#1e293b',
        font_family: t.font_heading,
        ...extra,
      });
      const sideCol = (extra = {}) => ({
        zone: 'sidebar-light',
        font_size: 8.5,
        color: '#475569',
        list_format: 'list',
        ...extra,
      });
      return [
        bg(0, 0, PAGE_WIDTH_MM, headerH, t.color_header, 0),
        bar(0, headerH, PAGE_WIDTH_MM, px(4), t.color_accent, 1),
        bg(SB_X, bodyY, SB, bodyH, t.color_sidebar, 0),
        {
          type: 'photo',
          x: px(24),
          y: PHOTO_TOP,
          w: PHOTO_H,
          h: PHOTO_H,
          z: 5,
          style: { shape: 'circle', zone: 'header', photo_border: 'accent-thick', ...headerLock },
        },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: px(24) + PHOTO_H + px(16),
          y: PHOTO_TOP,
          w: PAGE_WIDTH_MM - px(24) - PHOTO_H - px(16) - px(24),
          h: PHOTO_H,
          z: 5,
          style: {
            ...hdr(),
            // Pas de font_size ici : sinon --typography force titre = 20pt (inherit !important).
            // Tailles via twin CSS : nom 20pt / titre 11pt.
            header_layout: 'inline-title',
            title_accent: true,
          },
        },
        {
          type: 'resume',
          bind: 'resume',
          x: px(24),
          y: resumeY,
          w: PAGE_WIDTH_MM - px(48),
          h: RESUME_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'justify',
            font_size: 9,
            color: 'rgba(255,255,255,0.88)',
            // Stable : résumé dans le header, pas de titre « Profil »
            show_section_title: false,
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: px(24),
          y: contactY,
          w: PAGE_WIDTH_MM - px(48),
          h: CONTACT_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'center',
            contact_layout: 'header-bar',
            font_size: 8.5,
            contact_icons: true,
            contact_uppercase: true,
            contact_separator: ' ',
          },
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: PAD,
          y: bodyY + px(10),
          w: MAIN_W,
          h: px(200),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'EXPÉRIENCE PROFESSIONNELLE',
            title_style: 'bold-main',
            exp_style: 'bold',
          },
        },
        {
          type: 'formations',
          bind: 'formations',
          x: PAD,
          y: bodyY + px(215),
          w: MAIN_W,
          h: px(38),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'FORMATION',
            title_style: 'bold-main',
            formation_style: 'minimal',
          },
        },
        {
          type: 'projets',
          bind: 'projets',
          x: PAD,
          y: bodyY + px(258),
          w: MAIN_W,
          h: px(28),
          z: 2,
          style: { ...mainCol(), section_label: 'PROJETS', title_style: 'bold-main' },
        },
        {
          type: 'skills',
          bind: 'competences.techniques',
          x: SB_X + SB_INSET,
          y: bodyY + px(18),
          w: SB - SB_INSET * 2,
          h: px(52),
          z: 3,
          style: {
            ...sideCol(),
            section_label: 'COMPÉTENCES',
            sidebar_category: 'Compétences techniques',
            title_style: 'bold-sidebar-section',
          },
        },
        {
          type: 'skills',
          bind: 'competences.logiciels',
          x: SB_X + SB_INSET,
          y: bodyY + px(72),
          w: SB - SB_INSET * 2,
          h: px(40),
          z: 3,
          style: { ...sideCol(), sidebar_category: 'Logiciels & outils', title_style: 'bold-sidebar-category' },
        },
        {
          type: 'certifications',
          bind: 'certifications',
          x: SB_X + SB_INSET,
          y: bodyY + px(114),
          w: SB - SB_INSET * 2,
          h: px(28),
          z: 3,
          style: { ...sideCol(), sidebar_category: 'Certifications', title_style: 'bold-sidebar-category' },
        },
        {
          type: 'languages',
          x: SB_X + SB_INSET,
          y: bodyY + px(146),
          w: SB - SB_INSET * 2,
          h: px(22),
          z: 3,
          style: { ...sideCol(), section_label: 'LANGUES', title_style: 'bold-main' },
        },
        {
          type: 'skills',
          bind: 'competences.autres',
          x: SB_X + SB_INSET,
          y: bodyY + px(170),
          w: SB - SB_INSET * 2,
          h: px(30),
          z: 3,
          style: { ...sideCol(), section_label: 'AUTRES', title_style: 'bold-main' },
        },
      ];
    }

    case 'classic': {
      // Réplique templates/classic : header sombre (photo + nom inline + résumé + contact
      // centré icônes), accent optionnel, main gauche, sidebar droite compétences.
      const { SB, SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const PHOTO_TOP = px(12);
      const PHOTO_H = px(52);
      const GAP = px(6);
      const RESUME_H = px(42);
      const CONTACT_H = px(14);
      const headerPadBottom = px(12);
      const headerH = PHOTO_TOP + PHOTO_H + GAP + RESUME_H + GAP + CONTACT_H + headerPadBottom;
      const bodyY = headerH;
      const resumeY = PHOTO_TOP + PHOTO_H + GAP;
      const contactY = resumeY + RESUME_H + GAP;
      const bodyH = H - bodyY;
      const headerLock = { lock_geometry: true };
      const hdr = (extra = {}) => ({
        zone: 'header',
        color: '#ffffff',
        font_family: t.font_heading,
        ...headerLock,
        ...extra,
      });
      const mainCol = (extra = {}) => ({
        zone: 'main',
        font_size: 9,
        color: '#1a1a1a',
        font_family: t.font_heading,
        ...extra,
      });
      const sideCol = (extra = {}) => ({
        zone: 'sidebar-light',
        font_size: 8.5,
        color: '#333333',
        list_format: 'list',
        ...extra,
      });
      return [
        bg(0, 0, PAGE_WIDTH_MM, headerH, t.color_header, 0),
        bg(SB_X, bodyY, SB, bodyH, t.color_sidebar, 0),
        {
          type: 'photo',
          x: px(16),
          y: PHOTO_TOP,
          w: PHOTO_H,
          h: PHOTO_H,
          z: 5,
          style: { shape: 'circle', zone: 'header', photo_border: 'light', ...headerLock },
        },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: px(16) + PHOTO_H + px(12),
          y: PHOTO_TOP + px(4),
          w: PAGE_WIDTH_MM - px(16) - PHOTO_H - px(12) - px(16),
          h: PHOTO_H - px(8),
          z: 5,
          style: {
            ...hdr(),
            font_size: 15,
            bold: true,
            header_layout: 'inline-title',
            identity_layout: 'classic-header',
          },
        },
        {
          type: 'resume',
          bind: 'resume',
          x: px(16),
          y: resumeY,
          w: PAGE_WIDTH_MM - px(32),
          h: RESUME_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'justify',
            font_size: 9,
            font_style: 'italic',
            color: 'rgba(255,255,255,0.95)',
            // Pas de section_label : résumé dans le header Stable (pas « Profil » main)
            show_section_title: false,
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: px(16),
          y: contactY,
          w: PAGE_WIDTH_MM - px(32),
          h: CONTACT_H,
          z: 5,
          style: {
            ...hdr(),
            align: 'center',
            contact_layout: 'header-bar',
            contact_icons: true,
            contact_separator: ' ',
            font_size: 9,
          },
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: PAD,
          y: bodyY + px(8),
          w: MAIN_W,
          h: px(200),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'EXPÉRIENCE PROFESSIONNELLE',
            title_style: 'classic-main',
            exp_style: 'classic',
          },
        },
        {
          type: 'formations',
          bind: 'formations',
          x: PAD,
          y: bodyY + px(214),
          w: MAIN_W,
          h: px(36),
          z: 2,
          style: {
            ...mainCol(),
            section_label: 'FORMATION',
            title_style: 'classic-main',
            formation_style: 'classic',
          },
        },
        {
          type: 'projets',
          bind: 'projets',
          x: PAD,
          y: bodyY + px(254),
          w: MAIN_W,
          h: px(28),
          z: 2,
          style: { ...mainCol(), section_label: 'PROJETS', title_style: 'classic-main' },
        },
        ...sidebarCompetenceBlocksDetailed(
          SB_X + SB_INSET,
          SB - SB_INSET * 2,
          bodyY + px(12),
          sideCol(),
          3,
        ),
      ];
    }

    case 'minimal': {
      // Réplique templates/minimal : mono-colonne, pas de photo, contact « · »,
      // titres Title Case, géométrie verrouillée (freeform + lock_geometry).
      const px = (n) => (n * 25.4) / 96;
      const pad = px(28);
      const W = PAGE_WIDTH_MM - pad * 2;
      const yHeader = px(18);
      // name 18pt×1.15 + title 10pt×1.3 + marge titre ≈ 48px (34px overflowait sur le contact)
      const identityH = px(48);
      const contactY = yHeader + identityH + px(6);
      const contactH = px(14);
      const yBody = contactY + contactH + px(8) + px(6);
      const section = (label, extra = {}) => ({
        ...main(),
        section_label: label,
        title_style: 'minimal-section',
        ...extra,
      });
      const headerLock = { lock_geometry: true };
      return [
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: pad,
          y: yHeader,
          w: W,
          h: identityH,
          z: 2,
          style: {
            ...main(),
            ...headerLock,
            // Pas de font_size/color ici : twin CSS gère (évite inherit !important).
            font_family: t.font_heading,
            identity_layout: 'minimal-header',
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: pad,
          y: contactY,
          w: W,
          h: contactH,
          z: 2,
          style: {
            ...main(),
            ...headerLock,
            align: 'left',
            contact_layout: 'header-bar',
            contact_separator: ' · ',
            contact_icons: false,
          },
        },
        {
          type: 'resume',
          bind: 'resume',
          x: pad,
          y: yBody,
          w: W,
          h: px(42),
          z: 1,
          style: section('Profil', { font_style: 'italic' }),
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: pad,
          y: yBody + px(48),
          w: W,
          h: px(140),
          z: 1,
          style: section('Expérience professionnelle', { exp_style: 'minimal' }),
        },
        {
          type: 'formations',
          bind: 'formations',
          x: pad,
          y: yBody + px(194),
          w: W,
          h: px(36),
          z: 1,
          style: section('Formation', { formation_style: 'minimal' }),
        },
        {
          type: 'skills',
          bind: 'competences.techniques',
          x: pad,
          y: yBody + px(236),
          w: W,
          h: px(36),
          z: 1,
          style: section('Compétences', {
            list_format: 'inline',
            skills_nested_outils: true,
          }),
        },
        {
          type: 'certifications',
          bind: 'certifications',
          x: pad,
          y: yBody + px(278),
          w: W,
          h: px(24),
          z: 1,
          style: section('Certifications', { list_format: 'inline' }),
        },
        {
          type: 'languages',
          x: pad,
          y: yBody + px(308),
          w: W,
          h: px(20),
          z: 1,
          style: section('Langues', { list_format: 'inline' }),
        },
        {
          type: 'projets',
          bind: 'projets',
          x: pad,
          y: yBody + px(334),
          w: W,
          h: px(28),
          z: 1,
          style: section('Projets'),
        },
      ];
    }

    case 'elegant': {
      // Réplique templates/elegant : header centré + photo, titres uppercase via twin CSS,
      // chips Compétences (+ outils nestés), géométrie verrouillée.
      const ePx = (n) => (n * 25.4) / 96;
      const pad = ePx(30);
      const W = PAGE_WIDTH_MM - pad * 2;
      const photoSize = ePx(56);
      // Stable .cv-header { padding: 22px 30px 16px }
      const yPhoto = ePx(22);
      // .header-photo { margin-bottom: 8px }
      const yIdentity = yPhoto + photoSize + ePx(8);
      // name ~20pt×1.15 + title mt 4px + 10.5pt×1.3 ≈ 42–44px
      const identityH = ePx(44);
      // .header-contact { margin-top: 8px } sous le titre
      const yContact = yIdentity + identityH + ePx(8);
      const contactH = ePx(14);
      // padding-bottom header 16px puis border
      const yRule = yContact + contactH + ePx(16);
      const yBody = yRule + ePx(8);
      const section = (label, extra = {}) => ({
        ...main(),
        section_label: label,
        title_style: 'elegant-section',
        ...extra,
      });
      const headerLock = { lock_geometry: true };
      return [
        {
          type: 'photo',
          x: PAGE_WIDTH_MM / 2 - photoSize / 2,
          y: yPhoto,
          w: photoSize,
          h: photoSize,
          z: 3,
          style: {
            ...headerLock,
            shape: 'circle',
            zone: 'main',
            photo_border: 'accent-thin',
            image_border_width_mm: (2 * 25.4) / 96,
            image_border_color: t.color_accent,
          },
        },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: pad,
          y: yIdentity,
          w: W,
          h: identityH,
          z: 3,
          style: {
            ...main(),
            // Pas de lock : auto-height + replica_cascade gardent l’écart Stable sous le titre
            align: 'center',
            font_family: t.font_heading,
            identity_layout: 'elegant-header',
          },
        },
        {
          type: 'contact',
          bind: ['telephone', 'email', 'linkedin'],
          x: pad,
          y: yContact,
          w: W,
          h: contactH,
          z: 3,
          style: {
            ...main(),
            align: 'center',
            contact_layout: 'header-bar',
            // Stable : <span class="contact-sep">·</span> + margin 0 8px
            contact_separator: '·',
            contact_icons: false,
          },
        },
        bar(pad, yRule, W, 0.15, '#e2e8f0', 0),
        {
          type: 'resume',
          bind: 'resume',
          x: pad,
          y: yBody,
          w: W,
          h: ePx(42),
          z: 2,
          style: section('Profil', { font_style: 'italic' }),
        },
        {
          type: 'experiences',
          bind: 'experiences',
          x: pad,
          y: yBody + ePx(48),
          w: W,
          h: ePx(118),
          z: 1,
          style: section('Expérience professionnelle', {
            font_family: t.font_heading,
            exp_style: 'elegant',
          }),
        },
        {
          type: 'formations',
          bind: 'formations',
          x: pad,
          y: yBody + ePx(172),
          w: W,
          h: ePx(28),
          z: 1,
          style: section('Formation', {
            font_family: t.font_heading,
            formation_style: 'minimal',
          }),
        },
        {
          type: 'skills',
          bind: 'competences.techniques',
          x: pad,
          y: yBody + ePx(206),
          w: W,
          h: ePx(32),
          z: 1,
          style: section('Compétences', {
            format: 'chips',
            skills_nested_outils: true,
          }),
        },
        {
          type: 'certifications',
          bind: 'certifications',
          x: pad,
          y: yBody + ePx(244),
          w: W,
          h: ePx(22),
          z: 1,
          style: section('Certifications', { list_format: 'list' }),
        },
        {
          type: 'languages',
          x: pad,
          y: yBody + ePx(272),
          w: W,
          h: ePx(18),
          z: 1,
          style: section('Langues', { list_format: 'list' }),
        },
        {
          type: 'projets',
          bind: 'projets',
          x: pad,
          y: yBody + ePx(296),
          w: W,
          h: ePx(24),
          z: 1,
          style: section('Projets'),
        },
      ];
    }

    default:
      return [];
  }
}

/**
 * Résumé structurel d’une projection (tests + inventaire AXE-346).
 * @param {object} template
 */
export function summarizeTemplateCanvasLayout(template) {
  const theme = parseCanvasTheme(template);
  const blocks = buildTemplateBlocks(template);
  /** @type {Record<string, number>} */
  const blockTypes = {};
  /** @type {Set<string>} */
  const zones = new Set();
  for (const block of blocks) {
    const type = String(block?.type || 'unknown');
    blockTypes[type] = (blockTypes[type] || 0) + 1;
    const zone = block?.style?.zone;
    if (zone) zones.add(String(zone));
  }
  const fidelity = getTemplateCanvasFidelity(theme.template_id);
  return {
    templateId: theme.template_id,
    blockCount: blocks.length,
    blockTypes,
    zones: [...zones].sort(),
    themeTemplateId: theme.template_id,
    readiness: fidelity?.readiness || null,
    layoutFamily: fidelity?.layoutFamily || null,
  };
}
