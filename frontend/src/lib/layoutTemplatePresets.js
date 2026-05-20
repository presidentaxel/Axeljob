/**
 * Layouts canvas v3 fidèles aux templates HTML (sidebar, header, couleurs, polices).
 */
import { fontStackFromTemplateOption } from './canvasFontOptions.js';
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  createBlankLayoutV3,
  createStarterLayoutV3,
  sanitizeLayoutV3,
} from './cvLayoutModelV3.js';

/** ~200px à 96dpi */
const SB = 53;
const MAIN_L = { x: SB, w: PAGE_WIDTH_MM - SB };
const MAIN_R = { x: 0, w: PAGE_WIDTH_MM - SB };
const SB_R = { x: PAGE_WIDTH_MM - SB, w: SB };
const H = PAGE_HEIGHT_MM;

function bgRect(x, y, w, h, color, z = 0) {
  return { type: 'shape:rect', x, y, w, h, z, style: { color } };
}

function accentBar(x, y, w, h, color, z = 2) {
  return { type: 'shape:rect', x, y, w, h, z, style: { color } };
}

function parseTemplateTheme(template) {
  const theme = {
    font_heading: 'Inter, sans-serif',
    font_body: 'Inter, sans-serif',
    color_accent: '#1e2a3a',
    color_header: '#1e2a3a',
    color_sidebar: '#f4f4f2',
    color_section_title: '#1e2a3a',
  };
  const opts = template?.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => {
      if (!o?.key) return;
      if (o.key === 'accent_color' && o.default) {
        theme.color_accent = o.default;
        theme.color_section_title = o.default;
      }
      if (o.key === 'header_color' && o.default) theme.color_header = o.default;
      if (o.key === 'sidebar_color' && o.default) theme.color_sidebar = o.default;
      if (o.key === 'font' && o.default) {
        const stack = fontStackFromTemplateOption(o.default);
        theme.font_heading = stack;
        theme.font_body = stack;
      }
    });
  }
  if (template?.id === 'modern') {
    theme.color_section_title = theme.color_accent;
  }
  return theme;
}

/** Sidebar gauche sombre (modern, creative). */
function buildLeftSidebarLayout(sidebarColor, blocks) {
  return [
    bgRect(0, 0, SB, H, sidebarColor, 0),
    ...blocks,
  ];
}

/** Header + corps main à gauche + sidebar droite (classic, executive, bold). */
function buildHeaderRightSidebar(headerH, headerColor, accentColor, sidebarColor, headerBlocks, mainBlocks, sidebarBlocks) {
  return [
    bgRect(0, 0, PAGE_WIDTH_MM, headerH, headerColor, 0),
    accentBar(0, headerH, PAGE_WIDTH_MM, 1.2, accentColor, 1),
    bgRect(SB_R.x, headerH + 1.2, SB, H - headerH - 1.2, sidebarColor, 0),
    ...headerBlocks.map((b) => ({ ...b, y: (b.y ?? 0) + 4 })),
    ...mainBlocks.map((b) => ({ ...b, y: (b.y ?? 0) + headerH + 2 })),
    ...sidebarBlocks.map((b) => ({
      ...b,
      x: b.x ?? SB_R.x,
      y: (b.y ?? 0) + headerH + 6,
    })),
  ];
}

function buildModern(template) {
  const t = parseTemplateTheme(template);
  const side = { zone: 'sidebar', align: 'center', font_size: 9, color: '#ffffff' };
  const main = { zone: 'main', font_size: 9 };
  const blocks = buildLeftSidebarLayout(t.color_sidebar, [
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 4, y: 16, w: SB - 8, h: 26, z: 2, style: { ...side, font_size: 13 } },
    { type: 'photo', x: 8, y: 44, w: SB - 16, h: 32, z: 2, style: { shape: 'circle', zone: 'sidebar' } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 4, y: 78, w: SB - 8, h: 24, z: 2, style: side },
    { type: 'skills', bind: 'competences.techniques', x: 4, y: 106, w: SB - 8, h: 42, z: 2, style: { ...side, format: 'chips' } },
    { type: 'languages', x: 4, y: 152, w: SB - 8, h: 22, z: 2, style: side },
    { type: 'resume', bind: 'resume', x: MAIN_L.x + 4, y: 14, w: MAIN_L.w - 8, h: 22, z: 1, style: { ...main, font_style: 'italic' } },
    { type: 'experiences', bind: 'experiences', x: MAIN_L.x + 4, y: 40, w: MAIN_L.w - 8, h: 128, z: 1, style: main },
    { type: 'formations', bind: 'formations', x: MAIN_L.x + 4, y: 172, w: MAIN_L.w - 8, h: 38, z: 1, style: main },
  ]);
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'modern' };
  return layout;
}

function buildCreative(template) {
  const t = parseTemplateTheme(template);
  const side = { zone: 'sidebar', align: 'center', font_size: 9, color: '#ffffff' };
  const main = { zone: 'main', font_size: 9 };
  const blocks = buildLeftSidebarLayout(t.color_sidebar, [
    { type: 'photo', x: 8, y: 14, w: SB - 16, h: 30, z: 3, style: { shape: 'circle', zone: 'sidebar' } },
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 4, y: 46, w: SB - 8, h: 28, z: 3, style: { ...side, font_size: 14 } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 4, y: 76, w: SB - 8, h: 22, z: 3, style: side },
    { type: 'skills', bind: 'competences.techniques', x: 4, y: 102, w: SB - 8, h: 38, z: 3, style: { ...side, format: 'chips' } },
    { type: 'languages', x: 4, y: 144, w: SB - 8, h: 20, z: 3, style: side },
    { type: 'resume', bind: 'resume', x: MAIN_L.x + 4, y: 14, w: MAIN_L.w - 8, h: 24, z: 2, style: main },
    { type: 'experiences', bind: 'experiences', x: MAIN_L.x + 4, y: 42, w: MAIN_L.w - 8, h: 130, z: 2, style: main },
    { type: 'formations', bind: 'formations', x: MAIN_L.x + 4, y: 176, w: MAIN_L.w - 8, h: 28, z: 2, style: main },
  ]);
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'creative' };
  return layout;
}

function buildExecutive(template) {
  const t = parseTemplateTheme(template);
  const header = { zone: 'header', align: 'left', color: '#ffffff', font_size: 10 };
  const main = { zone: 'main', font_size: 9.5 };
  const side = { zone: 'sidebar-light', font_size: 8.5 };
  const headerH = 48;
  const blocks = buildHeaderRightSidebar(
    headerH,
    t.color_header,
    t.color_accent,
    t.color_sidebar,
    [
      { type: 'photo', x: 8, y: 6, w: 22, h: 22, z: 4, style: { shape: 'circle', zone: 'header' } },
      { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 34, y: 8, w: MAIN_R.w - 42, h: 22, z: 4, style: { ...header, font_size: 18 } },
      { type: 'resume', bind: 'resume', x: 34, y: 30, w: MAIN_R.w - 42, h: 14, z: 4, style: { ...header, font_style: 'italic' } },
      { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 8, y: 38, w: MAIN_R.w - 16, h: 8, z: 4, style: { ...header, align: 'center', font_size: 8.5 } },
    ],
    [
      { type: 'experiences', bind: 'experiences', x: 6, y: 4, w: MAIN_R.w - 12, h: 118, z: 2, style: main },
      { type: 'formations', bind: 'formations', x: 6, y: 126, w: MAIN_R.w - 12, h: 32, z: 2, style: main },
      { type: 'projets', bind: 'projets', x: 6, y: 162, w: MAIN_R.w - 12, h: 28, z: 2, style: main },
    ],
    [
      { type: 'skills', bind: 'competences.techniques', x: SB_R.x + 3, y: 4, w: SB - 6, h: 50, z: 3, style: { ...side, format: 'chips' } },
      { type: 'languages', x: SB_R.x + 3, y: 58, w: SB - 6, h: 24, z: 3, style: side },
      { type: 'certifications', bind: 'certifications', x: SB_R.x + 3, y: 86, w: SB - 6, h: 30, z: 3, style: side },
    ],
  );
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'executive' };
  return layout;
}

function buildBold(template) {
  const t = parseTemplateTheme(template);
  const header = { zone: 'header', align: 'left', color: '#ffffff', font_size: 10 };
  const main = { zone: 'main', font_size: 9 };
  const side = { zone: 'sidebar-light', font_size: 8.5 };
  const headerH = 52;
  const blocks = buildHeaderRightSidebar(
    headerH,
    t.color_header,
    t.color_accent,
    t.color_sidebar,
    [
      { type: 'photo', x: 8, y: 8, w: 24, h: 24, z: 4, style: { shape: 'circle', zone: 'header' } },
      { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 36, y: 10, w: MAIN_R.w - 44, h: 24, z: 4, style: { ...header, font_size: 20, bold: true } },
      { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 8, y: 38, w: MAIN_R.w - 16, h: 10, z: 4, style: { ...header, font_size: 8.5 } },
    ],
    [
      { type: 'experiences', bind: 'experiences', x: 6, y: 6, w: MAIN_R.w - 12, h: 130, z: 2, style: main },
      { type: 'resume', bind: 'resume', x: 6, y: 140, w: MAIN_R.w - 12, h: 20, z: 2, style: main },
      { type: 'formations', bind: 'formations', x: 6, y: 164, w: MAIN_R.w - 12, h: 28, z: 2, style: main },
    ],
    [
      { type: 'skills', bind: 'competences.techniques', x: SB_R.x + 3, y: 6, w: SB - 6, h: 55, z: 3, style: { ...side, format: 'chips' } },
      { type: 'languages', x: SB_R.x + 3, y: 66, w: SB - 6, h: 22, z: 3, style: side },
    ],
  );
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'bold' };
  return layout;
}

function buildClassic(template) {
  const t = parseTemplateTheme(template);
  t.color_header = t.color_header || '#1e2a3a';
  t.color_sidebar = t.color_sidebar || '#f4f4f2';
  const header = { zone: 'header', color: '#ffffff', font_size: 10 };
  const main = { zone: 'main', font_size: 9 };
  const side = { zone: 'sidebar-light', font_size: 8.5 };
  const headerH = 46;
  const blocks = buildHeaderRightSidebar(
    headerH,
    t.color_header,
    t.color_accent,
    t.color_sidebar,
    [
      { type: 'photo', x: 8, y: 6, w: 20, h: 20, z: 4, style: { shape: 'circle', zone: 'header' } },
      { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 32, y: 8, w: MAIN_R.w - 40, h: 20, z: 4, style: { ...header, font_size: 15 } },
      { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: 8, y: 32, w: MAIN_R.w - 16, h: 10, z: 4, style: header },
    ],
    [
      { type: 'experiences', bind: 'experiences', x: 6, y: 4, w: MAIN_R.w - 12, h: 120, z: 2, style: main },
      { type: 'formations', bind: 'formations', x: 6, y: 128, w: MAIN_R.w - 12, h: 30, z: 2, style: main },
      { type: 'resume', bind: 'resume', x: 6, y: 162, w: MAIN_R.w - 12, h: 22, z: 2, style: main },
    ],
    [
      { type: 'skills', bind: 'competences.techniques', x: SB_R.x + 3, y: 4, w: SB - 6, h: 48, z: 3, style: { ...side, format: 'chips' } },
      { type: 'languages', x: SB_R.x + 3, y: 56, w: SB - 6, h: 22, z: 3, style: side },
    ],
  );
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'classic' };
  return layout;
}

function buildMinimal(template) {
  const t = parseTemplateTheme(template);
  const pad = 14;
  const W = PAGE_WIDTH_MM - pad * 2;
  const blocks = [
    accentBar(pad, 10, W, 1.5, t.color_accent, 0),
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: pad, y: 16, w: W, h: 28, z: 2, style: { zone: 'main', align: 'left', font_size: 18 } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: pad, y: 46, w: W, h: 10, z: 2, style: { zone: 'main', font_size: 8.5 } },
    { type: 'resume', bind: 'resume', x: pad, y: 60, w: W, h: 22, z: 2, style: { zone: 'main', font_size: 9 } },
    { type: 'experiences', bind: 'experiences', x: pad, y: 86, w: W, h: 120, z: 1, style: { zone: 'main', font_size: 9 } },
    { type: 'formations', bind: 'formations', x: pad, y: 210, w: W, h: 30, z: 1, style: { zone: 'main', font_size: 9 } },
    { type: 'skills', bind: 'competences.techniques', x: pad, y: 244, w: W, h: 22, z: 1, style: { zone: 'main', format: 'chips', font_size: 9 } },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'minimal' };
  return layout;
}

function buildElegant(template) {
  const t = parseTemplateTheme(template);
  const pad = 16;
  const W = PAGE_WIDTH_MM - pad * 2;
  const blocks = [
    bgRect(pad, 12, W, 52, '#ffffff', 0),
    accentBar(pad, 64, W, 0.4, '#e2e8f0', 1),
    { type: 'photo', x: PAGE_WIDTH_MM / 2 - 14, y: 16, w: 28, h: 28, z: 3, style: { shape: 'circle', zone: 'main' } },
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: pad, y: 46, w: W, h: 22, z: 3, style: { zone: 'main', align: 'center', font_size: 20 } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: pad, y: 70, w: W, h: 8, z: 3, style: { zone: 'main', align: 'center', font_size: 8.5 } },
    { type: 'resume', bind: 'resume', x: pad, y: 82, w: W, h: 24, z: 2, style: { zone: 'main', font_size: 9 } },
    { type: 'experiences', bind: 'experiences', x: pad, y: 110, w: W, h: 118, z: 1, style: { zone: 'main', font_size: 9 } },
    { type: 'formations', bind: 'formations', x: pad, y: 232, w: W, h: 28, z: 1, style: { zone: 'main', font_size: 9 } },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...t, template_id: 'elegant' };
  return layout;
}

const BUILDERS = {
  modern: buildModern,
  creative: buildCreative,
  executive: buildExecutive,
  bold: buildBold,
  classic: buildClassic,
  minimal: buildMinimal,
  elegant: buildElegant,
};

export function createCanvasLayoutForTemplate(template) {
  if (!template?.id) return createStarterLayoutV3();
  const build = BUILDERS[template.id];
  if (!build) return createStarterLayoutV3();
  return sanitizeLayoutV3(build(template));
}

export function createCanvasLayoutBlank() {
  return createBlankLayoutV3();
}
