import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../api';
import { resolvePhotoUrl } from '../../lib/freeCanvasContent.js';
import '../../styles/EditorImageEditPopover.css';

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function resolveImageSource(block, cv) {
  if (block?.type === 'image') return block.image_src || '';
  const raw = resolvePhotoUrl(cv);
  if (!raw) return '';
  return raw.startsWith('http') ? raw : apiUrl(`/api/assets/${raw.replace(/^assets\//, '')}`);
}

function frameBorderStyle(block, theme = {}) {
  const border = block?.style?.photo_border;
  if (!border) return {};
  const accent = theme.color_accent || block?.style?.color || '#4f46e5';
  if (border === 'light') {
    return { boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.65)' };
  }
  if (border === 'accent-thick') {
    return { border: `4px solid ${accent}` };
  }
  if (border === 'accent-thin') {
    return { border: `1px solid ${accent}` };
  }
  if (border === 'accent') {
    return { boxShadow: `0 0 0 3px ${accent}` };
  }
  return {};
}

/**
 * Pop-up édition image (double-clic) : cadrage, zoom, forme.
 */
export default function EditorImageEditPopover({
  block,
  cv,
  theme,
  anchorRect,
  onBlockStylePatch,
  onClose,
}) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const style = block?.style || {};
  const [draftFocal, setDraftFocal] = useState({
    x: style.focal_x ?? 50,
    y: style.focal_y ?? 50,
  });

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (dragRef.current) return;
    setDraftFocal({
      x: style.focal_x ?? 50,
      y: style.focal_y ?? 50,
    });
  }, [style.focal_x, style.focal_y, block?.id]);

  if (!block || (block.type !== 'image' && block.type !== 'photo') || !anchorRect) return null;

  const top = Math.min(window.innerHeight - 320, anchorRect.top + anchorRect.height + 12);
  const left = Math.min(window.innerWidth - 280, Math.max(8, anchorRect.left));

  const patchStyle = (patch) => onBlockStylePatch?.(patch);
  const imageSrc = resolveImageSource(block, cv);
  const shape = style.shape || 'rect';
  const radiusMm = style.border_radius_mm;
  const radius = radiusMm > 0
    ? `${radiusMm}mm`
    : shape === 'circle'
      ? '50%'
      : shape === 'rounded'
        ? '12px'
        : '0';
  const focalX = draftFocal.x;
  const focalY = draftFocal.y;
  const zoom = style.image_zoom ?? 1;
  const blockRatioW = Math.max(1, Number(block.w) || 4);
  const blockRatioH = Math.max(1, Number(block.h) || 3);
  const previewMaxW = 236;
  const previewMaxH = 180;
  const ratio = blockRatioW / blockRatioH;
  const previewW = ratio >= previewMaxW / previewMaxH ? previewMaxW : previewMaxH * ratio;
  const previewH = ratio >= previewMaxW / previewMaxH ? previewMaxW / ratio : previewMaxH;
  const frameStyle = {
    width: `${previewW}px`,
    height: `${previewH}px`,
    borderRadius: radius,
    ...frameBorderStyle(block, theme),
  };

  const startImageDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFocalX: focalX,
      startFocalY: focalY,
      currentFocalX: focalX,
      currentFocalY: focalY,
      width: event.currentTarget.clientWidth || 1,
      height: event.currentTarget.clientHeight || 1,
    };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const moveImageDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const dx = ((event.clientX - drag.startClientX) / drag.width) * 100;
    const dy = ((event.clientY - drag.startClientY) / drag.height) * 100;
    const next = {
      x: clampPercent(drag.startFocalX - dx),
      y: clampPercent(drag.startFocalY - dy),
    };
    drag.currentFocalX = next.x;
    drag.currentFocalY = next.y;
    setDraftFocal(next);
  };

  const endImageDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    patchStyle({
      focal_x: drag.currentFocalX,
      focal_y: drag.currentFocalY,
    });
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
  };

  return (
    <div
      ref={ref}
      className="editor-image-edit-popover"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="dialog"
      aria-label="Éditer l’image"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="editor-image-edit-popover__head">
        <strong>{block.type === 'photo' ? 'Photo' : 'Image'}</strong>
        <button type="button" className="editor-image-edit-popover__close" onClick={onClose}>×</button>
      </header>

      <label className="editor-image-edit-popover__field">
        Forme
        <select
          value={style.shape || 'rect'}
          onChange={(e) => patchStyle({ shape: e.target.value })}
        >
          <option value="rect">Rectangle</option>
          <option value="rounded">Arrondi</option>
          <option value="circle">Cercle</option>
        </select>
      </label>

      <p className="editor-image-edit-popover__label">Placement dans le cadre</p>
      <div
        className="editor-image-edit-popover__frame"
        style={frameStyle}
        role="application"
        aria-label="Glisser pour déplacer l'image dans son cadre"
        onPointerDown={startImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={endImageDrag}
        onPointerCancel={endImageDrag}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            draggable="false"
            style={{
              objectPosition: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
        ) : (
          <span>Aucune image</span>
        )}
        <span className="editor-image-edit-popover__frame-hint">Glissez l'image</span>
      </div>

      <label className="editor-image-edit-popover__field">
        Zoom ({Math.round((style.image_zoom ?? 1) * 100)}%)
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={style.image_zoom ?? 1}
          onChange={(e) => patchStyle({ image_zoom: parseFloat(e.target.value) })}
        />
      </label>

      <label className="editor-image-edit-popover__field">
        Coins arrondis (mm)
        <input
          type="number"
          min="0"
          max="30"
          step="1"
          value={style.border_radius_mm ?? 0}
          onChange={(e) => patchStyle({ border_radius_mm: parseFloat(e.target.value) || 0 })}
        />
      </label>
    </div>
  );
}
