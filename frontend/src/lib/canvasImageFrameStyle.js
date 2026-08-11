/** Styles partagés pour les cadres image / photo du canvas. */

export function isCircleImageShape(style = {}) {
  return (style.shape || 'rect') === 'circle';
}

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

/**
 * Cadre image : en mode cercle, inscrit un carré centré (côté = min(w, h))
 * pour obtenir un cercle parfait même si le bloc n'est pas carré.
 */
export function imageFrameLayout(blockWMm, blockHMm, style = {}) {
  const w = Math.max(0, Number(blockWMm) || 0);
  const h = Math.max(0, Number(blockHMm) || 0);
  const border = imageFrameBorderStyle(style);
  const opacity = style.opacity ?? 1;

  if (isCircleImageShape(style) && w > 0 && h > 0) {
    const side = Math.min(w, h);
    return {
      mode: 'circle',
      outerStyle: {
        position: 'relative',
        width: '100%',
        height: '100%',
      },
      frameStyle: {
        position: 'absolute',
        left: `${(w - side) / 2}mm`,
        top: `${(h - side) / 2}mm`,
        width: `${side}mm`,
        height: `${side}mm`,
        borderRadius: '50%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity,
        ...border,
      },
    };
  }

  return {
    mode: 'rect',
    outerStyle: {
      width: '100%',
      height: '100%',
      borderRadius: imageBorderRadiusCss(style),
      overflow: 'hidden',
      boxSizing: 'border-box',
      opacity,
      ...border,
    },
    frameStyle: null,
  };
}
