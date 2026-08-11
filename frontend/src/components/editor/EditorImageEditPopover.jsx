import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../api';
import { resolvePhotoUrl } from '../../lib/freeCanvasContent.js';
import { CANVAS_COLOR_SWATCHES, DEFAULT_SHAPE_COLOR } from '../../lib/canvasColorPalette.js';
import { isCircleImageShape } from '../../lib/canvasImageFrameStyle.js';
import '../../styles/EditorImageEditPopover.css';

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampRadius(value, max) {
  return Math.max(0, Math.min(max, value));
}

function resolveImageSource(block, cv) {
  if (block?.type === 'image') return block.image_src || '';
  const raw = resolvePhotoUrl(cv);
  if (!raw) return '';
  return raw.startsWith('http') ? raw : apiUrl(`/api/assets/${raw.replace(/^assets\//, '')}`);
}

const PREVIEW_W = 360;
const PREVIEW_H = 280;
const RADIUS_HANDLES = ['nw', 'ne', 'se', 'sw'];
const HANDLE_SIZE = 14;
const HANDLE_HALF = HANDLE_SIZE / 2;

function radiusPxFromMm(radiusMm, frameW, frameH, blockRatioW, blockRatioH) {
  const scaleX = frameW / blockRatioW;
  const scaleY = frameH / blockRatioH;
  return Math.min(radiusMm * scaleX, radiusMm * scaleY);
}

function radiusMmFromPx(radiusPx, frameW, frameH, blockRatioW, blockRatioH, maxRadiusMm) {
  const scaleX = frameW / blockRatioW;
  const scaleY = frameH / blockRatioH;
  const scale = Math.min(scaleX, scaleY) || 1;
  return clampRadius(radiusPx / scale, maxRadiusMm);
}

function radiusPxFromPointer(handle, clientX, clientY, rect) {
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const w = rect.width;
  const h = rect.height;
  switch (handle) {
    case 'nw':
      return Math.min(localX, localY);
    case 'ne':
      return Math.min(w - localX, localY);
    case 'se':
      return Math.min(w - localX, h - localY);
    case 'sw':
      return Math.min(localX, h - localY);
    default:
      return 0;
  }
}

function handleCornerStyle(handle, radiusPx) {
  const inset = Math.max(0, radiusPx - HANDLE_HALF);
  switch (handle) {
    case 'nw':
      return { left: `${inset}px`, top: `${inset}px` };
    case 'ne':
      return { right: `${inset}px`, top: `${inset}px` };
    case 'se':
      return { right: `${inset}px`, bottom: `${inset}px` };
    case 'sw':
      return { left: `${inset}px`, bottom: `${inset}px` };
    default:
      return {};
  }
}

function handleCursor(handle) {
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

export default function EditorImageEditPopover({
  block,
  cv,
  onBlockStylePatch,
  onClose,
}) {
  const ref = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const radiusDragRef = useRef(null);
  const style = block?.style || {};
  const [draftFocal, setDraftFocal] = useState({
    x: style.focal_x ?? 50,
    y: style.focal_y ?? 50,
  });
  const [draftZoom, setDraftZoom] = useState(style.image_zoom ?? 1);
  const [draftRadius, setDraftRadius] = useState(style.border_radius_mm ?? 0);
  const [draftBorderWidth, setDraftBorderWidth] = useState(style.image_border_width_mm ?? 0);
  const [draftBorderColor, setDraftBorderColor] = useState(style.image_border_color || DEFAULT_SHAPE_COLOR);
  const [draftShape, setDraftShape] = useState(style.shape || 'rect');

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
    if (dragRef.current || radiusDragRef.current) return;
    setDraftFocal({ x: style.focal_x ?? 50, y: style.focal_y ?? 50 });
    setDraftZoom(style.image_zoom ?? 1);
    setDraftRadius(style.border_radius_mm ?? 0);
    setDraftBorderWidth(style.image_border_width_mm ?? 0);
    setDraftBorderColor(style.image_border_color || DEFAULT_SHAPE_COLOR);
    setDraftShape(style.shape || 'rect');
  }, [style.focal_x, style.focal_y, style.image_zoom, style.border_radius_mm, style.image_border_width_mm, style.image_border_color, style.shape, block?.id]);

  const patchStyle = useCallback((patch) => {
    onBlockStylePatch?.(patch);
  }, [onBlockStylePatch]);

  if (!block || (block.type !== 'image' && block.type !== 'photo')) return null;

  const imageSrc = resolveImageSource(block, cv);
  const blockRatioW = Math.max(1, Number(block.w) || 4);
  const blockRatioH = Math.max(1, Number(block.h) || 3);
  const ratio = blockRatioW / blockRatioH;
  const frameW = ratio >= PREVIEW_W / PREVIEW_H ? PREVIEW_W : PREVIEW_H * ratio;
  const frameH = ratio >= PREVIEW_W / PREVIEW_H ? PREVIEW_W / ratio : PREVIEW_H;
  const maxRadiusMm = Math.min(blockRatioW, blockRatioH) / 2;
  const isCircle = isCircleImageShape({ shape: draftShape });
  const radiusPx = isCircle ? 0 : radiusPxFromMm(draftRadius, frameW, frameH, blockRatioW, blockRatioH);
  const radiusCss = radiusPx > 0 ? `${radiusPx}px` : '0';
  const circleSidePx = Math.min(frameW, frameH);
  const circleFrameStyle = isCircle
    ? {
      position: 'absolute',
      left: `${(frameW - circleSidePx) / 2}px`,
      top: `${(frameH - circleSidePx) / 2}px`,
      width: `${circleSidePx}px`,
      height: `${circleSidePx}px`,
      borderRadius: '50%',
      overflow: 'hidden',
      boxSizing: 'border-box',
      ...(draftBorderWidth > 0
        ? { border: `${draftBorderWidth}mm solid ${draftBorderColor}`, boxSizing: 'border-box' }
        : {}),
    }
    : {
      borderRadius: radiusCss,
      ...(draftBorderWidth > 0
        ? { border: `${draftBorderWidth}mm solid ${draftBorderColor}`, boxSizing: 'border-box' }
        : {}),
    };
  const zoomPercent = Math.round((draftZoom - 1) / 2 * 100);
  const radiusPercent = maxRadiusMm > 0 ? Math.round((draftRadius / maxRadiusMm) * 100) : 0;
  const borderWidthPercent = Math.round((draftBorderWidth / 3) * 100);

  const setZoomFromPercent = (percent) => {
    const clamped = Math.min(200, Math.max(0, percent));
    const next = 1 + (clamped / 100) * 2;
    setDraftZoom(next);
    patchStyle({ image_zoom: next });
  };

  const setRadiusFromPercent = (percent) => {
    const clamped = Math.min(100, Math.max(0, percent));
    const nextMm = clampRadius((clamped / 100) * maxRadiusMm, maxRadiusMm);
    setDraftRadius(nextMm);
    patchStyle({ border_radius_mm: nextMm, shape: 'rect' });
  };

  const setRectShape = () => {
    setDraftShape('rect');
    patchStyle({ shape: 'rect' });
  };

  const setCircleShape = () => {
    setDraftShape('circle');
    setDraftRadius(0);
    patchStyle({ shape: 'circle', border_radius_mm: 0 });
  };

  const setBorderWidthFromPercent = (percent) => {
    const clamped = Math.min(100, Math.max(0, percent));
    const nextMm = Math.round((clamped / 100) * 30) / 10;
    setDraftBorderWidth(nextMm);
    patchStyle({ image_border_width_mm: nextMm, image_border_color: draftBorderColor });
  };

  const setBorderColor = (color) => {
    setDraftBorderColor(color);
    patchStyle({
      image_border_color: color,
      image_border_width_mm: draftBorderWidth > 0 ? draftBorderWidth : 0.4,
    });
    if (draftBorderWidth <= 0) setDraftBorderWidth(0.4);
  };

  const startImageDrag = (event) => {
    if (radiusDragRef.current) return;
    if (event.target?.closest?.('.editor-image-edit-modal__radius-handle')) return;
    if (event.target?.closest?.('.editor-image-edit-modal__shape-btn')) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFocalX: draftFocal.x,
      startFocalY: draftFocal.y,
      currentFocalX: draftFocal.x,
      currentFocalY: draftFocal.y,
      width: frameRef.current?.clientWidth || frameW,
      height: frameRef.current?.clientHeight || frameH,
    };
    frameRef.current?.setPointerCapture?.(event.pointerId);
  };

  const moveImageDrag = (event) => {
    const radiusDrag = radiusDragRef.current;
    if (radiusDrag) {
      event.preventDefault();
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const rPx = radiusPxFromPointer(radiusDrag.handle, event.clientX, event.clientY, rect);
      const nextMm = radiusMmFromPx(rPx, frameW, frameH, blockRatioW, blockRatioH, maxRadiusMm);
      radiusDrag.currentMm = nextMm;
      setDraftRadius(nextMm);
      return;
    }
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
    const radiusDrag = radiusDragRef.current;
    if (radiusDrag) {
      radiusDragRef.current = null;
      patchStyle({ border_radius_mm: radiusDrag.currentMm ?? draftRadius, shape: 'rect' });
      try { event.currentTarget?.releasePointerCapture?.(event.pointerId); } catch (_) { /* ignore */ }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    patchStyle({ focal_x: drag.currentFocalX, focal_y: drag.currentFocalY });
    try { frameRef.current?.releasePointerCapture?.(event.pointerId); } catch (_) { /* ignore */ }
  };

  const startRadiusDrag = (event, handle) => {
    event.preventDefault();
    event.stopPropagation();
    radiusDragRef.current = {
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startMm: draftRadius,
      currentMm: draftRadius,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -10 : 10;
    setZoomFromPercent(zoomPercent + delta);
  };

  return (
    <div className="editor-image-edit-overlay" role="presentation">
      <div
        ref={ref}
        className="editor-image-edit-modal"
        role="dialog"
        aria-label="Ajuster l’image"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="editor-image-edit-modal__hint">
          Glissez l&apos;image pour recadrer · molette pour zoomer · tirez les poignées vers l&apos;intérieur pour arrondir
        </p>
        <div
          className="editor-image-edit-modal__frame-outer"
          style={{ width: `${frameW}px`, height: `${frameH}px` }}
        >
          <div
            ref={frameRef}
            className={`editor-image-edit-modal__frame${isCircle ? ' editor-image-edit-modal__frame--circle-host' : ''}`}
            style={isCircle ? { position: 'relative', width: '100%', height: '100%' } : circleFrameStyle}
            onPointerDown={startImageDrag}
            onPointerMove={moveImageDrag}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onWheel={handleWheel}
          >
            <div
              className="editor-image-edit-modal__frame-inner"
              style={isCircle ? circleFrameStyle : { width: '100%', height: '100%' }}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt=""
                  draggable="false"
                  style={{
                    objectPosition: `${draftFocal.x}% ${draftFocal.y}%`,
                    transform: `scale(${draftZoom})`,
                    transformOrigin: `${draftFocal.x}% ${draftFocal.y}%`,
                  }}
                />
              ) : (
                <span className="editor-image-edit-modal__empty" aria-hidden />
              )}
              <div className="editor-image-edit-modal__mask" aria-hidden />
            </div>
          </div>
          {!isCircle && RADIUS_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className="editor-image-edit-modal__radius-handle"
              style={{
                ...handleCornerStyle(handle, radiusPx),
                cursor: handleCursor(handle),
              }}
              aria-label="Ajuster les coins arrondis"
              onPointerDown={(e) => startRadiusDrag(e, handle)}
              onPointerMove={moveImageDrag}
              onPointerUp={endImageDrag}
              onPointerCancel={endImageDrag}
            />
          ))}
        </div>
        <div className="editor-image-edit-modal__shape-row">
          <span className="editor-image-edit-modal__shape-label">Forme</span>
          <div className="editor-image-edit-modal__shape-btns">
            <button
              type="button"
              className={`editor-image-edit-modal__shape-btn${!isCircle ? ' is-active' : ''}`}
              onClick={setRectShape}
            >
              Rectangle
            </button>
            <button
              type="button"
              className={`editor-image-edit-modal__shape-btn${isCircle ? ' is-active' : ''}`}
              onClick={setCircleShape}
            >
              Cercle
            </button>
          </div>
        </div>
        <div className="editor-image-edit-modal__controls">
          <label className="editor-image-edit-modal__control">
            <span>Zoom</span>
            <div className="ds-range-row">
              <input
                type="range"
                className="ds-range"
                min="0"
                max="200"
                step="5"
                value={zoomPercent}
                onChange={(e) => setZoomFromPercent(parseInt(e.target.value, 10))}
              />
              <input
                type="text"
                className="ds-range-input"
                inputMode="numeric"
                value={zoomPercent}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  if (!Number.isNaN(n)) setZoomFromPercent(n);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  setZoomFromPercent(Number.isNaN(n) ? zoomPercent : n);
                }}
                aria-label="Zoom en pourcentage"
              />
              <span className="editor-image-edit-modal__suffix">%</span>
            </div>
          </label>
          <label className={`editor-image-edit-modal__control${isCircle ? ' is-disabled' : ''}`}>
            <span>Coins arrondis</span>
            <div className="ds-range-row">
              <input
                type="range"
                className="ds-range"
                min="0"
                max="100"
                step="1"
                value={radiusPercent}
                disabled={isCircle}
                onChange={(e) => setRadiusFromPercent(parseInt(e.target.value, 10))}
              />
              <input
                type="text"
                className="ds-range-input"
                inputMode="numeric"
                value={radiusPercent}
                disabled={isCircle}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  if (!Number.isNaN(n)) setRadiusFromPercent(n);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  setRadiusFromPercent(Number.isNaN(n) ? radiusPercent : n);
                }}
                aria-label="Arrondi en pourcentage"
              />
              <span className="editor-image-edit-modal__suffix">%</span>
            </div>
          </label>
          <label className="editor-image-edit-modal__control">
            <span>Bordure</span>
            <div className="ds-range-row">
              <input
                type="range"
                className="ds-range"
                min="0"
                max="100"
                step="5"
                value={borderWidthPercent}
                onChange={(e) => setBorderWidthFromPercent(parseInt(e.target.value, 10))}
              />
              <input
                type="text"
                className="ds-range-input"
                inputMode="decimal"
                value={draftBorderWidth.toFixed(1)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value.replace(',', '.'));
                  if (!Number.isNaN(n)) setBorderWidthFromPercent(Math.round((n / 3) * 100));
                }}
                onBlur={(e) => {
                  const n = parseFloat(e.target.value.replace(',', '.'));
                  setBorderWidthFromPercent(Number.isNaN(n) ? borderWidthPercent : Math.round((n / 3) * 100));
                }}
                aria-label="Épaisseur de bordure en millimètres"
              />
              <span className="editor-image-edit-modal__suffix">mm</span>
            </div>
          </label>
          <div className="editor-image-edit-modal__control">
            <span>Couleur bordure</span>
            <div className="editor-image-edit-modal__swatches">
              {CANVAS_COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`editor-image-edit-modal__swatch${draftBorderColor === color ? ' is-active' : ''}`}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={color}
                  onClick={() => setBorderColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
