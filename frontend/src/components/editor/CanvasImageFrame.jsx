import {
  imageFrameLayout,
  photoPresetBorderClass,
} from '../../lib/canvasImageFrameStyle.js';

function imageContentStyle(style = {}) {
  const focalX = style.focal_x ?? 50;
  const focalY = style.focal_y ?? 50;
  const zoom = style.image_zoom ?? 1;
  return {
    objectFit: 'cover',
    objectPosition: `${focalX}% ${focalY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${focalX}% ${focalY}%`,
  };
}

/**
 * Cadre image/photo avec recadrage circulaire centré sur blocs non carrés.
 */
export default function CanvasImageFrame({
  blockW,
  blockH,
  style = {},
  src,
  imgClassName,
  frameClassName = '',
}) {
  const layout = imageFrameLayout(blockW, blockH, style);
  const borderCls = photoPresetBorderClass(style);
  const imageStyle = imageContentStyle(style);

  if (layout.mode === 'circle') {
    return (
      <div
        className={['free-canvas-block__image-frame', frameClassName].filter(Boolean).join(' ')}
        style={layout.outerStyle}
      >
        <div
          className={['free-canvas-block__image-frame-inner', borderCls].filter(Boolean).join(' ')}
          style={layout.frameStyle}
        >
          <img className={imgClassName} src={src} alt="" style={imageStyle} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'free-canvas-block__image-frame',
        frameClassName,
        borderCls,
      ].filter(Boolean).join(' ')}
      style={layout.outerStyle}
    >
      <img className={imgClassName} src={src} alt="" style={imageStyle} />
    </div>
  );
}
