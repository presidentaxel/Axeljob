import { isVectorShapeType } from './canvasShapePresets.js';

/** Types de blocs avec contrôles toolbar (texte + sections sémantiques). */
export const TOOLBAR_FORMAT_TYPES = new Set([
  'text',
  'title',
  'identity',
  'contact',
  'resume',
  'experiences',
  'formations',
  'certifications',
  'projets',
  'skills',
  'languages',
]);

export function blockSupportsTextToolbar(type) {
  return TOOLBAR_FORMAT_TYPES.has(type);
}

export function blockSupportsShapeToolbar(type) {
  return type === 'shape:line'
    || type === 'shape:rect'
    || isVectorShapeType(type);
}

export function blockSupportsStyleToolbar(type) {
  return blockSupportsTextToolbar(type)
    || type === 'icon'
    || type === 'image'
    || type === 'photo'
    || blockSupportsShapeToolbar(type);
}

/** Styles bloc → CSS inline pour le rendu canvas. */
export function blockHasTypographyOverride(style = {}) {
  return Boolean(
    style?.font_size != null
    || style?.font_family
    || style?.color
    || style?.bold
    || style?.italic
    || style?.underline
    || style?.strikethrough,
  );
}

export function blockStyleToCss(style = {}) {
  if (!style || typeof style !== 'object') return {};
  const { zone: _zone, format: _format, font_style: _fs, effect: _effect, effect_color: _ec, ...rest } = style;
  const css = {};
  const s = rest;
  if (s.font_family) css.fontFamily = s.font_family;
  if (s.color_body) css.color = s.color_body;
  if (s.font_size != null) css.fontSize = `${s.font_size}pt`;
  if (s.color) css.color = s.color;
  if (s.align) css.textAlign = s.align;
  if (s.opacity != null) css.opacity = s.opacity;
  if (s.bold) css.fontWeight = '700';
  if (s.italic || s.font_style === 'italic') css.fontStyle = 'italic';
  const deco = [];
  if (s.underline) deco.push('underline');
  if (s.strikethrough) deco.push('line-through');
  if (deco.length) css.textDecoration = deco.join(' ');
  return css;
}
