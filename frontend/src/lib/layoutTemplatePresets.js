/**
 * Layouts canvas v3 par template_id (approximation visuelle, sans casser le HTML guidé).
 */
import {
  PAGE_MARGIN_MM,
  PAGE_USABLE_WIDTH_MM,
  PAGE_WIDTH_MM,
  createBlankLayoutV3,
  createStarterLayoutV3,
  sanitizeLayoutV3,
} from './cvLayoutModelV3.js';

function themeFromTemplate(template) {
  const patch = {};
  const opts = template?.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => {
      if (o?.key === 'accent_color' && o.default) patch.color_accent = o.default;
      if (o?.key === 'header_color' && o.default && !patch.color_accent) {
        patch.color_accent = o.default;
      }
      if (o?.key === 'sidebar_color' && o.default) patch.sidebar_color = o.default;
    });
  }
  return patch;
}

function buildModern() {
  const leftX = PAGE_MARGIN_MM;
  const leftW = 72;
  const rightX = leftX + leftW + 8;
  const rightW = PAGE_WIDTH_MM - PAGE_MARGIN_MM - rightX;
  const blocks = [
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: leftX, y: 12, w: leftW, h: 28, z: 2, style: { align: 'left' } },
    { type: 'photo', x: leftX, y: 44, w: leftW, h: 35, z: 2, style: { shape: 'circle' } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: leftX, y: 82, w: leftW, h: 22, z: 2 },
    { type: 'skills', bind: 'competences.techniques', x: leftX, y: 108, w: leftW, h: 40, z: 2, style: { format: 'chips' } },
    { type: 'languages', x: leftX, y: 152, w: leftW, h: 18, z: 2 },
    { type: 'resume', bind: 'resume', x: rightX, y: 12, w: rightW, h: 24, z: 1 },
    { type: 'experiences', bind: 'experiences', x: rightX, y: 40, w: rightW, h: 120, z: 1, style: { format: 'compact' } },
    { type: 'formations', bind: 'formations', x: rightX, y: 164, w: rightW, h: 35, z: 1 },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  return layout;
}

function buildExecutive() {
  const W = PAGE_USABLE_WIDTH_MM;
  const X = PAGE_MARGIN_MM;
  const blocks = [
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: X, y: 10, w: W, h: 26, z: 1, style: { align: 'center' } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: X, y: 38, w: W, h: 10, z: 1, style: { align: 'center' } },
    { type: 'resume', bind: 'resume', x: X, y: 52, w: W, h: 22, z: 1 },
    { type: 'experiences', bind: 'experiences', x: X, y: 78, w: W, h: 110, z: 1 },
    { type: 'formations', bind: 'formations', x: X, y: 192, w: W, h: 28, z: 1 },
    { type: 'skills', bind: 'competences.techniques', x: X, y: 224, w: W, h: 20, z: 1, style: { format: 'chips' } },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  return layout;
}

function buildCreative() {
  const blocks = [
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: 12, y: 10, w: 120, h: 30, z: 3, style: { align: 'left' } },
    { type: 'shape:rect', x: 10, y: 8, w: 125, h: 34, z: 1, style: { color: '#e9d5ff' } },
    { type: 'contact', bind: ['email', 'telephone'], x: 140, y: 14, w: 60, h: 20, z: 4 },
    { type: 'resume', bind: 'resume', x: 12, y: 48, w: 186, h: 28, z: 2 },
    { type: 'experiences', bind: 'experiences', x: 12, y: 82, w: 186, h: 130, z: 2 },
    { type: 'formations', bind: 'formations', x: 12, y: 218, w: 90, h: 30, z: 2 },
    { type: 'skills', bind: 'competences.techniques', x: 108, y: 218, w: 90, h: 30, z: 2, style: { format: 'chips' } },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  return layout;
}

function buildBold() {
  const W = PAGE_USABLE_WIDTH_MM;
  const X = PAGE_MARGIN_MM;
  const blocks = [
    { type: 'shape:rect', x: X, y: 8, w: W, h: 14, z: 0, style: { color: '#dc2626' } },
    { type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: X, y: 10, w: W, h: 24, z: 2, style: { align: 'left' } },
    { type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: X, y: 36, w: W, h: 8, z: 2 },
    { type: 'experiences', bind: 'experiences', x: X, y: 50, w: W, h: 130, z: 1 },
    { type: 'resume', bind: 'resume', x: X, y: 184, w: W, h: 18, z: 1 },
    { type: 'formations', bind: 'formations', x: X, y: 206, w: W, h: 25, z: 1 },
  ];
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  return layout;
}

const BUILDERS = {
  modern: buildModern,
  executive: buildExecutive,
  creative: buildCreative,
  bold: buildBold,
  minimal: () => createStarterLayoutV3(),
  classic: () => createStarterLayoutV3(),
  elegant: () => createStarterLayoutV3(),
};

/**
 * Crée un layout v3 pré-placé pour un template CV (n’affecte pas le template HTML App).
 */
export function createCanvasLayoutForTemplate(template) {
  if (!template?.id) return createStarterLayoutV3();
  const build = BUILDERS[template.id] || (() => createStarterLayoutV3());
  const layout = build();
  const themePatch = themeFromTemplate(template);
  if (Object.keys(themePatch).length) {
    layout.theme = { ...layout.theme, ...themePatch };
  }
  return sanitizeLayoutV3(layout);
}

export function createCanvasLayoutBlank() {
  return createBlankLayoutV3();
}
