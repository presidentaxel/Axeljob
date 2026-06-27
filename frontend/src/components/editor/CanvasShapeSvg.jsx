import { SHAPE_SVG_PATHS } from '../../lib/canvasShapePresets.js';

/**
 * Rendu SVG vectoriel d'une forme canvas (mise à l'échelle libre).
 */
export default function CanvasShapeSvg({ type, style = {}, className = '' }) {
  const path = SHAPE_SVG_PATHS[type];
  if (!path) return null;

  const fill = style.color || style.bg || '#eeece7';
  const stroke = style.stroke_color || style.color || '#17171c';
  const strokeWidth = style.stroke_width ?? (type === 'shape:frame' ? 2 : 0);
  const isStrokeOnly = type === 'shape:frame'
    || type === 'shape:line'
    || type?.startsWith('shape:arrow')
    || type === 'shape:cross';
  const opacity = style.opacity ?? 1;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: '100%', height: '100%', opacity }}
    >
      <path
        d={path}
        fill={isStrokeOnly ? 'none' : fill}
        stroke={stroke}
        strokeWidth={isStrokeOnly ? Math.max(1.5, strokeWidth * 8) : (strokeWidth > 0 ? strokeWidth * 6 : 0)}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
