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
    readiness: 'thin',
    fidelityCss: 'thin',
    gaps: [
      'CSS Stable très dense vs twin canvas mince',
      'Sidebar compétences / typo header à rapprocher',
    ],
  },
  modern: {
    name: 'Moderne',
    layoutFamily: 'sidebar-left',
    readiness: 'projection',
    fidelityCss: 'medium',
    gaps: ['Détails sidebar (outils/langues) et accents underline à peaufiner'],
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
    readiness: 'projection',
    fidelityCss: 'medium',
    gaps: ['Bandeau header + barre accent vs CSS Stable'],
  },
  bold: {
    name: 'Impact',
    layoutFamily: 'sidebar-right',
    readiness: 'near-replica',
    fidelityCss: 'rich',
    gaps: ['Écarts résiduels typo/exp (meilleure base actuelle)'],
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

/** @param {object} template */
export function parseCanvasTheme(template) {
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

  const opts = template?.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => {
      if (o?.key === 'accent_color' && o.default) {
        theme.color_accent = o.default;
        if (id !== 'creative') theme.color_section_title = o.default;
      }
      if (o?.key === 'header_color' && o.default) theme.color_header = o.default;
      if (o?.key === 'sidebar_color' && o.default) theme.color_sidebar = o.default;
      if (o?.key === 'font' && o.default) {
        theme.font_heading = fontStackFromTemplateOption(o.default);
        theme.font_body = id === 'executive' || id === 'minimal' || id === 'elegant'
          ? 'Inter, sans-serif'
          : theme.font_heading;
      }
    });
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

export function buildTemplateBlocks(template) {
  const id = template?.id;
  const t = parseCanvasTheme(template);
  const { SB, MAIN_L, MAIN_R, SB_R, H } = LAYOUT;
  const sx = SIDE_PAD_X;
  const sy = SIDE_PAD_Y;
  const mx = MAIN_L.x + MAIN_PAD_X;
  const mw = MAIN_L.w - MAIN_PAD_X * 2;
  switch (id) {
    case 'modern':
      return [
        bg(0, 0, SB, H, t.color_sidebar, 0),
        { type: 'photo', x: SB / 2 - 11, y: sy, w: 22, h: 22, z: 2, style: { shape: 'circle', zone: 'sidebar', photo_border: 'light' } },
        { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: sx, y: sy + 24, w: SB - sx * 2, h: 22, z: 2, style: { ...side(), font_size: 13, identity_divider: true } },
        { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: sx, y: sy + 48, w: SB - sx * 2, h: 26, z: 2, style: { ...side(), section_label: 'CONTACT' } },
        ...sidebarCompetenceBlocks(sx, SB - sx * 2, sy + 76, side(), 2, { tools: 'OUTILS' }),
        { type: 'languages', x: sx, y: sy + 112, w: SB - sx * 2, h: 20, z: 2, style: { ...side(), section_label: 'LANGUES', list_format: 'list' } },
        { type: 'certifications', bind: 'certifications', x: sx, y: sy + 134, w: SB - sx * 2, h: 24, z: 2, style: { ...side(), section_label: 'CERTIFICATIONS', list_format: 'list' } },
        { type: 'skills', bind: 'competences.autres', x: sx, y: sy + 160, w: SB - sx * 2, h: 22, z: 2, style: { ...side(), section_label: 'AUTRES', list_format: 'list' } },
        { type: 'resume', bind: 'resume', x: mx, y: MAIN_PAD_Y, w: mw, h: 20, z: 1, style: { ...main(), section_label: 'PROFIL', font_style: 'italic', align: 'justify' } },
        { type: 'experiences', bind: 'experiences', x: mx, y: MAIN_PAD_Y + 24, w: mw, h: 128, z: 1, style: { ...main(), section_label: 'EXPÉRIENCE PROFESSIONNELLE', title_style: 'underline-accent' } },
        { type: 'formations', bind: 'formations', x: mx, y: MAIN_PAD_Y + 156, w: mw, h: 36, z: 1, style: { ...main(), section_label: 'FORMATION', title_style: 'underline-accent' } },
        { type: 'projets', bind: 'projets', x: mx, y: MAIN_PAD_Y + 196, w: mw, h: 28, z: 1, style: { ...main(), section_label: 'PROJETS', title_style: 'underline-accent' } },
      ];

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
      const { SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const headerH = 50;
      const bodyY = headerH + 1.2;
      const bodyH = H - bodyY;
      const sideCol = (extra = {}) => ({
        ...sideLight(),
        title_color: t.color_accent,
        list_format: 'list',
        ...extra,
      });
      return [
        bg(0, 0, PAGE_WIDTH_MM, headerH, t.color_header, 0),
        bar(0, headerH, PAGE_WIDTH_MM, 1.2, t.color_accent, 1),
        bg(SB_X, bodyY, SB, bodyH, t.color_sidebar, 0),
        bar(SB_X, bodyY, 0.5, bodyH, t.color_accent, 2),
        { type: 'photo', x: 8, y: 6, w: 16, h: 16, z: 5, style: { shape: 'circle', zone: 'header', photo_border: 'accent' } },
        { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 28, y: 6, w: PAGE_WIDTH_MM - SB - 36, h: 14, z: 5, style: { ...header(), font_size: 18, font_family: t.font_heading, align: 'left' } },
        { type: 'resume', bind: 'resume', x: 28, y: 22, w: PAGE_WIDTH_MM - SB - 36, h: 12, z: 5, style: { ...header(), font_style: 'italic', align: 'justify', font_size: 9 } },
        { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 8, y: 36, w: PAGE_WIDTH_MM - SB - 16, h: 10, z: 5, style: { ...header(), contact_layout: 'header-bar', font_size: 8.5, contact_icons: true } },
        { type: 'experiences', bind: 'experiences', x: PAD, y: bodyY + 4, w: MAIN_W, h: 118, z: 2, style: { ...main(), section_label: 'EXPÉRIENCE PROFESSIONNELLE', title_style: 'executive-main', font_family: t.font_heading, exp_style: 'bold' } },
        { type: 'formations', bind: 'formations', x: PAD, y: bodyY + 126, w: MAIN_W, h: 30, z: 2, style: { ...main(), section_label: 'FORMATION', title_style: 'executive-main', font_family: t.font_heading } },
        { type: 'projets', bind: 'projets', x: PAD, y: bodyY + 160, w: MAIN_W, h: 26, z: 2, style: { ...main(), section_label: 'PROJETS', title_style: 'executive-main', font_family: t.font_heading } },
        ...sidebarCompetenceBlocksDetailed(SB_X + SB_INSET, SB - SB_INSET * 2, bodyY + 8, sideCol(), 3),
      ];
    }

    case 'bold': {
      const { SB, SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const PHOTO_TOP = px(20);
      const PHOTO_H = px(64);
      const GAP = px(10);
      const RESUME_H = px(52);
      const CONTACT_H = px(14);
      const headerH = PHOTO_TOP + PHOTO_H + GAP + RESUME_H + GAP + CONTACT_H + px(16);
      const bodyY = headerH + px(4);
      const resumeY = PHOTO_TOP + PHOTO_H + GAP;
      const contactY = resumeY + RESUME_H + GAP;
      const bodyH = H - bodyY;
      const hdr = (extra = {}) => ({
        zone: 'header',
        color: '#ffffff',
        font_family: t.font_heading,
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
        { type: 'photo', x: px(24), y: PHOTO_TOP, w: PHOTO_H, h: PHOTO_H, z: 5, style: { shape: 'circle', zone: 'header', photo_border: 'accent-thick' } },
        {
          type: 'identity',
          bind: ['prenom', 'nom', 'titre_professionnel'],
          x: px(24) + PHOTO_H + px(16),
          y: PHOTO_TOP + px(2),
          w: PAGE_WIDTH_MM - px(24) - PHOTO_H - px(16) - px(24),
          h: PHOTO_H,
          z: 5,
          style: {
            ...hdr(),
            font_size: 20,
            bold: true,
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
          style: { ...hdr(), align: 'justify', font_size: 9, color: 'rgba(255,255,255,0.88)' },
        },
        {
          type: 'contact',
          bind: ['email', 'telephone', 'linkedin'],
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
          style: { ...mainCol(), section_label: 'FORMATION', title_style: 'bold-main' },
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
      const { SB, SB_X, PAD, MAIN_W, SB_INSET } = rightSidebarMetrics();
      const headerH = 46;
      const bodyY = headerH + 1;
      const bodyH = H - bodyY;
      return [
        bg(0, 0, PAGE_WIDTH_MM, headerH, t.color_header, 0),
        bar(0, headerH, PAGE_WIDTH_MM, 0.8, t.color_accent, 1),
        bg(SB_X, bodyY, SB, bodyH, t.color_sidebar, 0),
        { type: 'photo', x: 8, y: 6, w: 14, h: 14, z: 4, style: { shape: 'circle', zone: 'header' } },
        { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 26, y: 8, w: PAGE_WIDTH_MM - SB - 34, h: 14, z: 4, style: { ...header(), font_size: 15 } },
        { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 8, y: 30, w: PAGE_WIDTH_MM - SB - 16, h: 10, z: 4, style: { ...header(), contact_layout: 'header-bar', contact_icons: true, font_size: 8.5 } },
        { type: 'experiences', bind: 'experiences', x: PAD, y: bodyY + 4, w: MAIN_W, h: 120, z: 2, style: { ...main(), section_label: 'EXPÉRIENCE PROFESSIONNELLE', title_style: 'classic-main', exp_style: 'bold' } },
        { type: 'formations', bind: 'formations', x: PAD, y: bodyY + 128, w: MAIN_W, h: 28, z: 2, style: { ...main(), section_label: 'FORMATION', title_style: 'classic-main' } },
        { type: 'resume', bind: 'resume', x: PAD, y: bodyY + 160, w: MAIN_W, h: 20, z: 2, style: { ...main(), section_label: 'PROFIL', font_style: 'italic' } },
        { type: 'projets', bind: 'projets', x: PAD, y: bodyY + 184, w: MAIN_W, h: 24, z: 2, style: { ...main(), section_label: 'PROJETS', title_style: 'classic-main' } },
        ...sidebarCompetenceBlocksDetailed(SB_X + SB_INSET, SB - SB_INSET * 2, bodyY + 6, sideLight(), 3),
      ];
    }

    case 'minimal': {
      // Réplique templates/minimal : mono-colonne, pas de photo, contact « · »,
      // titres Title Case, géométrie verrouillée (freeform + lock_geometry).
      const px = (n) => (n * 25.4) / 96;
      const pad = px(28);
      const W = PAGE_WIDTH_MM - pad * 2;
      const yHeader = px(18);
      // name 18pt×1.15 + title 10pt + marges ≈ 32–34px
      const identityH = px(34);
      const contactY = yHeader + identityH + px(4);
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
