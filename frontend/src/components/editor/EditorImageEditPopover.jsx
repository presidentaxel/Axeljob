import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../api';
import { resolvePhotoUrl } from '../../lib/freeCanvasContent.js';
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
  }, [style.focal_x, style.focal_y, style.image_zoom, style.border_radius_mm, block?.id]);

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
  const radiusCss = draftRadius > 0
    ? `${(draftRadius / blockRatioW) * frameW}px`
    : '0';
  const zoomPercent = Math.round((draftZoom - 1) / 2 * 100);
  const radiusPercent = maxRadiusMm > 0 ? Math.round((draftRadius / maxRadiusMm) * 100) : 0;

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

  const startImageDrag = (event) => {
    if (radiusDragRef.current) return;
    if (event.target?.closest?.('.editor-image-edit-modal__radius-handle')) return;
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
      const dx = event.clientX - radiusDrag.startClientX;
      const dy = event.clientY - radiusDrag.startClientY;
      const outward = (
        (radiusDrag.handle.includes('e') ? dx : -dx)
        + (radiusDrag.handle.includes('s') ? dy : -dy)
      ) / 2;
      const pxPerMm = Math.min(rect.width, rect.height) / Math.max(maxRadiusMm, 0.1);
      const nextMm = clampRadius(radiusDrag.startMm + outward / pxPerMm, maxRadiusMm);
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
          Glissez l&apos;image pour recadrer · molette pour zoomer · poignées aux coins pour arrondir
        </p>
        <div
          className="editor-image-edit-modal__frame-outer"
          style={{ width: `${frameW}px`, height: `${frameH}px` }}
        >
          <div
            ref={frameRef}
            className="editor-image-edit-modal__frame"
            style={{ borderRadius: radiusCss }}
            onPointerDown={startImageDrag}
            onPointerMove={moveImageDrag}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onWheel={handleWheel}
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
          {RADIUS_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`editor-image-edit-modal__radius-handle editor-image-edit-modal__radius-handle--${handle}`}
              aria-label="Ajuster les coins arrondis"
              onPointerDown={(e) => startRadiusDrag(e, handle)}
              onPointerMove={moveImageDrag}
              onPointerUp={endImageDrag}
              onPointerCancel={endImageDrag}
            />
          ))}
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
          <label className="editor-image-edit-modal__control">
            <span>Coins arrondis</span>
            <div className="ds-range-row">
              <input
                type="range"
                className="ds-range"
                min="0"
                max="100"
                step="1"
                value={radiusPercent}
                onChange={(e) => setRadiusFromPercent(parseInt(e.target.value, 10))}
              />
              <input
                type="text"
                className="ds-range-input"
                inputMode="numeric"
                value={radiusPercent}
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
        </div>
      </div>
    </div>
  );
}
