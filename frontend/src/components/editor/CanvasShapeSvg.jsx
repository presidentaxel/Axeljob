import { SHAPE_SVG_PATHS } from '../../lib/canvasShapePresets.js';

const PREVIEW_INK = '#17171c';

/**
 * Rendu SVG vectoriel d'une forme canvas (mise à l'échelle libre).
 * @param {boolean} [preview] — aperçu sidebar : noir uniforme, proportions conservées
 */
export default function CanvasShapeSvg({ type, style = {}, className = '', preview = false }) {
  const path = SHAPE_SVG_PATHS[type];
  if (!path) return null;

  const fill = preview
    ? PREVIEW_INK
    : (style.color || style.bg || '#eeece7');
  const stroke = preview
    ? PREVIEW_INK
    : (style.stroke_color || style.color || '#17171c');
  const strokeWidth = style.stroke_width ?? (type === 'shape:frame' ? 2 : 0);
  const isStrokeOnly = type === 'shape:frame'
    || type === 'shape:line'
    || type?.startsWith('shape:arrow')
    || type === 'shape:cross';
  const opacity = preview ? 1 : (style.opacity ?? 1);
  const previewStroke = preview && isStrokeOnly ? 2.5 : strokeWidth;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio={preview ? 'xMidYMid meet' : 'none'}
      aria-hidden="true"
      style={{ width: '100%', height: '100%', opacity }}
    >
      <path
        d={path}
        fill={isStrokeOnly ? 'none' : fill}
        stroke={stroke}
        strokeWidth={isStrokeOnly
          ? Math.max(1.5, previewStroke * (preview ? 1 : 8))
          : (strokeWidth > 0 ? strokeWidth * 6 : 0)}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
