/** Styles partagés pour les cadres image / photo du canvas. */

export function imageBorderRadiusCss(style = {}) {
  const radiusMm = style.border_radius_mm;
  if (radiusMm > 0) return `${radiusMm}mm`;
  const shape = style.shape || 'rect';
  if (shape === 'circle') return '50%';
  if (shape === 'rounded') return '12px';
  return '0';
}

export function imageFrameBorderStyle(style = {}) {
  const width = Number(style.image_border_width_mm);
  if (!Number.isFinite(width) || width <= 0) return {};
  return {
    border: `${width}mm solid ${style.image_border_color || '#17171c'}`,
    boxSizing: 'border-box',
  };
}

export function photoPresetBorderClass(style = {}) {
  const preset = style.photo_border;
  if (preset === 'light') return 'free-canvas-block__photo--border-light';
  if (preset === 'accent' || preset === 'accent-thick' || preset === 'accent-thin') {
    return 'free-canvas-block__photo--border-accent';
  }
  return '';
}
