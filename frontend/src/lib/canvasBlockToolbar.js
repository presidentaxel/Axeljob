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

export function blockSupportsStyleToolbar(type) {
  return blockSupportsTextToolbar(type)
    || type === 'shape:line'
    || type === 'icon'
    || type === 'image'
    || type === 'shape:rect';
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
  const css = {};
  if (style.font_family) css.fontFamily = style.font_family;
  if (style.font_size != null) css.fontSize = `${style.font_size}pt`;
  if (style.color) css.color = style.color;
  if (style.align) css.textAlign = style.align;
  if (style.opacity != null) css.opacity = style.opacity;
  if (style.bold) css.fontWeight = '700';
  if (style.italic) css.fontStyle = 'italic';
  const deco = [];
  if (style.underline) deco.push('underline');
  if (style.strikethrough) deco.push('line-through');
  if (deco.length) css.textDecoration = deco.join(' ');
  return css;
}
