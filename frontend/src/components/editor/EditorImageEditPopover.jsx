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

  const startImageDrag = (event) => {
    if (radiusDragRef.current) return;
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
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
      const maxDist = Math.min(rect.width, rect.height) / 2;
      const nextMm = clampRadius((dist / maxDist) * maxRadiusMm, maxRadiusMm);
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
      try { frameRef.current?.releasePointerCapture?.(event.pointerId); } catch (_) { /* ignore */ }
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
    radiusDragRef.current = { handle, currentMm: draftRadius };
    frameRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    const next = Math.min(3, Math.max(1, draftZoom + delta));
    setDraftZoom(next);
    patchStyle({ image_zoom: next });
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
        <div
          ref={frameRef}
          className="editor-image-edit-modal__frame"
          style={{ width: `${frameW}px`, height: `${frameH}px`, borderRadius: radiusCss }}
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
          {RADIUS_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`editor-image-edit-modal__radius-handle editor-image-edit-modal__radius-handle--${handle}`}
              aria-label="Ajuster les coins arrondis"
              onPointerDown={(e) => startRadiusDrag(e, handle)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
