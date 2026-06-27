import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import FreeCanvasBlock from './FreeCanvasBlock.jsx';
import {
  clientPointToPageMm,
  findPageElementAtPoint,
  pageIndexFromElement,
} from '../../lib/canvasPlacement.js';
import { clampBlockPositionOnPage } from '../../lib/canvasPageTransfer.js';
import { canAppendBlankPage, findBlock } from '../../lib/cvLayoutModelV3.js';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../../lib/cvLayoutModelV3.js';
import {
  clientDeltaToMmDelta,
  dragGroupKey,
  positionAfterDrag,
} from '../../lib/freeCanvasDrag.js';
import {
  computeResizedBlock,
  resizeGroupKey,
} from '../../lib/freeCanvasResize.js';
import { computePageScale, scaledPageHeightPx } from '../../lib/freeCanvasScale.js';
import { nextOverlappingBlockId } from '../../lib/freeCanvasSelection.js';
import { blockIdsInMarquee, normalizeMarqueeRect } from '../../lib/canvasMarqueeUtils.js';
import { CANVAS_IMAGE_DROP_MIME } from '../../lib/canvasImageLibrary.js';
import { snapBlockGeometry, snapBlockPosition } from '../../lib/freeCanvasSnap.js';
import '../../styles/FreeCanvas.css';
import '../../styles/CanvasTemplateFidelity.css';

/** Échappe une valeur destinée à une chaîne CSS (font-family, format…). */
function cssEscapeString(value) {
  return String(value || '')
    .replace(/[\\"']/g, '\\$&')
    .replace(/[\n\r<>]/g, '');
}

/** Autorise uniquement les sources de police sûres (data: ou http(s)). */
function safeFontSrc(src) {
  const s = String(src || '').trim();
  if (!/^(data:[a-z/+.-]+;base64,[a-z0-9+/=]+|https?:\/\/[^\s'")]+)$/i.test(s)) return null;
  return s;
}

/** Règles @font-face pour les polices embarquées d'un PDF importé. */
function EmbeddedFontFaces({ fonts }) {
  if (!Array.isArray(fonts) || fonts.length === 0) return null;
  const css = fonts
    .map((f) => {
      if (!f || !f.family || !f.src) return null;
      const src = safeFontSrc(f.src);
      if (!src) return null;
      const family = cssEscapeString(f.family);
      const format = cssEscapeString(f.format || 'truetype');
      return (
        `@font-face{font-family:'${family}';`
        + `font-weight:${f.weight === 700 ? 700 : 400};`
        + `font-style:${f.style === 'italic' ? 'italic' : 'normal'};`
        + 'font-display:swap;'
        + `src:url("${src}") format('${format}');}`
      );
    })
    .filter(Boolean)
    .join('\n');
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

function SnapGuides({ guides }) {
  if (!guides?.length) return null;
  return (
    <div className="free-canvas-snap-guides" aria-hidden="true">
      {guides.map((g, i) => (
        <div
          key={`${g.type}-${g.pos}-${g.role || 'edge'}-${i}`}
          className={[
            'free-canvas-snap-guide',
            `free-canvas-snap-guide--${g.type}`,
            g.role === 'center' ? 'free-canvas-snap-guide--center' : '',
          ].filter(Boolean).join(' ')}
          style={
            g.type === 'v'
              ? { left: `${g.pos}mm` }
              : { top: `${g.pos}mm` }
          }
        />
      ))}
    </div>
  );
}

/**
 * Canvas libre (P3.2–P3.4) : rendu, selection, drag, resize.
 */
export default function FreeCanvas({
  layout,
  cv,
  selectedBlockId = null,
  selectedBlockIds = [],
  editingBlockId = null,
  onSelectBlock,
  onBlockPositionChange,
  onBlockMove,
  onBlockResizeChange,
  onDragEnd,
  onCanvasInteractionChange,
  onStartBlockEdit,
  onCommitBlockEdit,
  onImageEdit,
  onSelectedBlockRect,
  onBlockAutoHeight,
  onResizeStart,
  onResizeEnd,
  suppressAutoHeight = false,
  showGrid = false,
  snapEnabled = true,
  interactable = true,
  placementPreset = null,
  onPlaceBlockAt,
  onPlaceBlockRect,
  onCancelPlacement,
  onDropImage,
  onAddPage,
  onRemovePage,
}) {
  const viewportRef = useRef(null);
  const blockElementsRef = useRef({});
  const [scale, setScale] = useState(1);
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const [resizingBlockId, setResizingBlockId] = useState(null);
  const [resizePreview, setResizePreview] = useState(null);
  const resizePreviewRef = useRef(null);
  const [activeGuides, setActiveGuides] = useState([]);
  const dragSessionRef = useRef(null);
  const resizeSessionRef = useRef(null);
  const resizeWindowCleanupRef = useRef(null);
  const placing = Boolean(placementPreset);
  const drawRectMode = placing && placementPreset?.placementMode === 'draw-rect';
  const [drawRect, setDrawRect] = useState(null);
  const drawSessionRef = useRef(null);
  const marqueeSessionRef = useRef(null);
  const [marqueeRect, setMarqueeRect] = useState(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const w = el.clientWidth;
      setScale(computePageScale(w, { paddingPx: 24, maxScale: 1 }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clearGuides = useCallback(() => setActiveGuides([]), []);

  const setCanvasBusy = useCallback((busy) => {
    if (typeof onCanvasInteractionChange === 'function') {
      onCanvasInteractionChange(busy);
    }
  }, [onCanvasInteractionChange]);

  const endDrag = useCallback(() => {
    dragSessionRef.current = null;
    setDraggingBlockId(null);
    clearGuides();
    setCanvasBusy(false);
  }, [clearGuides, setCanvasBusy]);

  const endResize = useCallback(() => {
    if (resizeWindowCleanupRef.current) {
      resizeWindowCleanupRef.current();
      resizeWindowCleanupRef.current = null;
    }
    resizeSessionRef.current = null;
    setResizingBlockId(null);
    clearGuides();
    setCanvasBusy(false);
  }, [clearGuides, setCanvasBusy]);

  const lastReportedRectRef = useRef(null);

  useLayoutEffect(() => {
    if (!selectedBlockId || typeof onSelectedBlockRect !== 'function') {
      if (lastReportedRectRef.current != null) {
        lastReportedRectRef.current = null;
        onSelectedBlockRect(null);
      }
      return undefined;
    }
    const el = blockElementsRef.current[selectedBlockId];
    if (!el) {
      lastReportedRectRef.current = null;
      onSelectedBlockRect(null);
      return undefined;
    }
    const update = () => {
      const rect = el.getBoundingClientRect();
      const next = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
      const prev = lastReportedRectRef.current;
      if (
        prev
        && prev.top === next.top
        && prev.left === next.left
        && prev.width === next.width
        && prev.height === next.height
      ) {
        return;
      }
      lastReportedRectRef.current = next;
      onSelectedBlockRect(next);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('scroll', update, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [selectedBlockId, editingBlockId, layout, scale, onSelectedBlockRect]);

  const commitEditingBlock = useCallback(() => {
    if (!editingBlockId || typeof onCommitBlockEdit !== 'function') return;
    const wrap = blockElementsRef.current[editingBlockId];
    const inner = wrap?.querySelector?.('.free-canvas-block__inner') ?? null;
    onCommitBlockEdit(editingBlockId, inner);
  }, [editingBlockId, onCommitBlockEdit]);

  const handleBlockPointerDown = useCallback((event, block) => {
    if (placing && typeof onPlaceBlockAt === 'function') {
      event.preventDefault();
      event.stopPropagation();
      const pageEl = event.currentTarget?.closest?.('.free-canvas-page');
      if (!pageEl) return;
      const pageIndex = pageIndexFromElement(pageEl);
      const pt = clientPointToPageMm(event.clientX, event.clientY, pageEl);
      onPlaceBlockAt(pageIndex, pt.x, pt.y);
      return;
    }
    if (editingBlockId && editingBlockId !== block?.id) {
      commitEditingBlock();
    }
    if (editingBlockId === block?.id) return;
    if (event.target?.closest?.('[data-resize-handle]')) return;
    if (!interactable || !block?.id || resizeSessionRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    const additive = event.shiftKey;
    if (typeof onSelectBlock === 'function') onSelectBlock(block.id, { additive });

    if (block?.locked) return;

    if (typeof onBlockPositionChange !== 'function') return;
    const found = findBlock(layout, block.id);
    const pageEl = event.currentTarget?.closest?.('.free-canvas-page');
    const pageIndex = found?.pageIndex ?? pageIndexFromElement(pageEl);
    dragSessionRef.current = {
      blockId: block.id,
      pageIndex,
      selectedAtStart: selectedBlockId,
      moved: false,
      startMm: { x: block.x, y: block.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setDraggingBlockId(block.id);
    setCanvasBusy(true);
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [
    placing,
    onPlaceBlockAt,
    interactable,
    onSelectBlock,
    onBlockPositionChange,
    setCanvasBusy,
    editingBlockId,
    commitEditingBlock,
    layout,
    selectedBlockId,
  ]);

  const handleBlockPointerMove = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session) return;
    const moveFn = onBlockMove || onBlockPositionChange;
    if (typeof moveFn !== 'function') return;

    const pageEl = findPageElementAtPoint(event.clientX, event.clientY);
    const targetPageIndex = pageEl ? pageIndexFromElement(pageEl) : session.pageIndex;
    let pos;

    if (pageEl && targetPageIndex !== session.pageIndex) {
      const pt = clientPointToPageMm(event.clientX, event.clientY, pageEl);
      const block = findBlock(layout, session.blockId)?.block;
      pos = clampBlockPositionOnPage(block, pt.x, pt.y);
      session.pageIndex = targetPageIndex;
      session.startMm = { x: pos.x, y: pos.y };
      session.startClientX = event.clientX;
      session.startClientY = event.clientY;
      setActiveGuides([]);
    } else {
      const dxPx = event.clientX - session.startClientX;
      const dyPx = event.clientY - session.startClientY;
      if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
        session.moved = true;
      }
      const deltaMm = clientDeltaToMmDelta(dxPx, dyPx, scale);
      pos = positionAfterDrag(session.startMm, deltaMm);
      const snapped = snapEnabled
        ? snapBlockPosition(pos, layout, session.blockId)
        : { ...pos, guides: [] };
      setActiveGuides(snapped.guides);
      pos = { x: snapped.x, y: snapped.y };
    }

    moveFn(
      session.blockId,
      { x: pos.x, y: pos.y },
      targetPageIndex,
      { groupKey: dragGroupKey(session.blockId) },
    );
  }, [scale, layout, onBlockPositionChange, onBlockMove, snapEnabled]);

  const handleBlockPointerUp = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
    const wasDragging = Boolean(session);
    let cycledSelection = false;
    if (!session.moved && typeof onSelectBlock === 'function') {
      const pageEl = event.currentTarget?.closest?.('.free-canvas-page');
      const blocks = layout?.pages?.[session.pageIndex]?.blocks || [];
      if (pageEl && blocks.length > 1) {
        const pt = clientPointToPageMm(event.clientX, event.clientY, pageEl);
        const nextId = nextOverlappingBlockId(blocks, pt, session.selectedAtStart);
        if (nextId && nextId !== session.blockId) {
          onSelectBlock(nextId);
          cycledSelection = true;
        }
      }
    }
    endDrag();
    if (wasDragging && !cycledSelection && typeof onDragEnd === 'function') onDragEnd();
  }, [endDrag, onDragEnd, onSelectBlock, layout]);

  const handleResizePointerMove = useCallback((event) => {
    const session = resizeSessionRef.current;
    if (!session || typeof onBlockResizeChange !== 'function') return;
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    const deltaMm = clientDeltaToMmDelta(dxPx, dyPx, scale);
    const patch = computeResizedBlock(session.startBlock, session.handle, deltaMm);
    const snapped = snapEnabled
      ? snapBlockGeometry(patch, layout, session.blockId, session.handle)
      : { ...patch, guides: [] };
    setActiveGuides(snapped.guides);
    const nextPreview = {
      blockId: session.blockId,
      x: snapped.x,
      y: snapped.y,
      w: snapped.w,
      h: snapped.h,
    };
    resizePreviewRef.current = nextPreview;
    setResizePreview(nextPreview);
  }, [scale, layout, snapEnabled, onBlockResizeChange]);

  const handleResizePointerUp = useCallback((event) => {
    const session = resizeSessionRef.current;
    if (!session) return;
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
    const wasResizing = Boolean(session);
    const blockId = session.blockId;
    const preview = resizePreviewRef.current;
    endResize();
    resizePreviewRef.current = null;
    setResizePreview(null);
    if (wasResizing && preview?.blockId === blockId && typeof onBlockResizeChange === 'function') {
      onBlockResizeChange(
        blockId,
        { x: preview.x, y: preview.y, w: preview.w, h: preview.h },
        { groupKey: resizeGroupKey(blockId) },
      );
    }
    if (wasResizing && typeof onResizeEnd === 'function') onResizeEnd(blockId);
    if (wasResizing && typeof onDragEnd === 'function') onDragEnd();
  }, [endResize, onDragEnd, onResizeEnd, onBlockResizeChange]);

  const handleResizePointerDown = useCallback((event, block, handle) => {
    if (block?.locked) return;
    if (!interactable || !block?.id || typeof onBlockResizeChange !== 'function') return;
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    if (typeof onSelectBlock === 'function') onSelectBlock(block.id);
    resizeSessionRef.current = {
      blockId: block.id,
      handle,
      startBlock: { x: block.x, y: block.y, w: block.w, h: block.h },
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setResizingBlockId(block.id);
    setResizePreview(null);
    resizePreviewRef.current = null;
    setCanvasBusy(true);
    if (typeof onResizeStart === 'function') onResizeStart();
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const onWinMove = (e) => handleResizePointerMove(e);
    const onWinUp = (e) => handleResizePointerUp(e);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    resizeWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
    };
  }, [interactable, onSelectBlock, onBlockResizeChange, endDrag, setCanvasBusy, onResizeStart, handleResizePointerMove, handleResizePointerUp]);

  const handlePageDragOver = useCallback((event) => {
    if (!event.dataTransfer?.types?.includes(CANVAS_IMAGE_DROP_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handlePageDrop = useCallback((event) => {
    const dataUrl = event.dataTransfer?.getData(CANVAS_IMAGE_DROP_MIME);
    if (!dataUrl || typeof onDropImage !== 'function') return;
    event.preventDefault();
    event.stopPropagation();
    const pageIndex = pageIndexFromElement(event.currentTarget);
    const pt = clientPointToPageMm(event.clientX, event.clientY, event.currentTarget);
    onDropImage(pageIndex, pt.x, pt.y, dataUrl);
  }, [onDropImage]);

  const [placeCursor, setPlaceCursor] = useState(null);

  useEffect(() => {
    if (!placing) {
      setPlaceCursor(null);
      setDrawRect(null);
      drawSessionRef.current = null;
      return undefined;
    }
    const onMove = (e) => setPlaceCursor({ x: e.clientX, y: e.clientY });
    const onKey = (e) => {
      if (e.key === 'Escape') onCancelPlacement?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [placing, onCancelPlacement]);

  const handlePageBackgroundPointerDown = useCallback((event) => {
    if (event.target !== event.currentTarget) return;
    const pageIndex = parseInt(event.currentTarget.getAttribute('data-page-index') || '0', 10);
    if (drawRectMode && typeof onPlaceBlockRect === 'function') {
      event.preventDefault();
      const pt = clientPointToPageMm(event.clientX, event.clientY, event.currentTarget);
      drawSessionRef.current = { pageIndex, startX: pt.x, startY: pt.y, pageEl: event.currentTarget };
      setDrawRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (placing && typeof onPlaceBlockAt === 'function') {
      const pt = clientPointToPageMm(event.clientX, event.clientY, event.currentTarget);
      onPlaceBlockAt(pageIndex, pt.x, pt.y);
      return;
    }
    commitEditingBlock();
    event.preventDefault();
    const pt = clientPointToPageMm(event.clientX, event.clientY, event.currentTarget);
    marqueeSessionRef.current = {
      pageIndex,
      startX: pt.x,
      startY: pt.y,
      pageEl: event.currentTarget,
    };
    setMarqueeRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [placing, drawRectMode, onPlaceBlockAt, onPlaceBlockRect, commitEditingBlock]);

  const handlePageDrawPointerMove = useCallback((event) => {
    const session = drawSessionRef.current;
    if (!session?.pageEl) return;
    const pt = clientPointToPageMm(event.clientX, event.clientY, session.pageEl);
    const x = Math.min(session.startX, pt.x);
    const y = Math.min(session.startY, pt.y);
    const w = Math.abs(pt.x - session.startX);
    const h = Math.abs(pt.y - session.startY);
    setDrawRect({ x, y, w, h });
  }, []);

  const handlePageDrawPointerUp = useCallback((event) => {
    const session = drawSessionRef.current;
    if (!session) return;
    drawSessionRef.current = null;
    try { session.pageEl?.releasePointerCapture?.(event.pointerId); } catch (_) { /* ignore */ }
    const pt = clientPointToPageMm(event.clientX, event.clientY, session.pageEl);
    const x = Math.min(session.startX, pt.x);
    const y = Math.min(session.startY, pt.y);
    const w = Math.abs(pt.x - session.startX);
    const h = Math.abs(pt.y - session.startY);
    setDrawRect(null);
    if (w >= 4 && h >= 4 && typeof onPlaceBlockRect === 'function') {
      onPlaceBlockRect(session.pageIndex, { x, y, w, h });
    }
  }, [onPlaceBlockRect]);

  const handlePagePointerMove = useCallback((event) => {
    if (drawRectMode && drawSessionRef.current) {
      handlePageDrawPointerMove(event);
      return;
    }
    const session = marqueeSessionRef.current;
    if (!session?.pageEl) return;
    const pt = clientPointToPageMm(event.clientX, event.clientY, session.pageEl);
    setMarqueeRect(normalizeMarqueeRect(session.startX, session.startY, pt.x, pt.y));
  }, [drawRectMode, handlePageDrawPointerMove]);

  const handlePagePointerUp = useCallback((event) => {
    if (drawRectMode && drawSessionRef.current) {
      handlePageDrawPointerUp(event);
      return;
    }
    const session = marqueeSessionRef.current;
    if (!session) return;
    marqueeSessionRef.current = null;
    try { session.pageEl?.releasePointerCapture?.(event.pointerId); } catch (_) { /* ignore */ }
    const pt = clientPointToPageMm(event.clientX, event.clientY, session.pageEl);
    const rect = normalizeMarqueeRect(session.startX, session.startY, pt.x, pt.y);
    setMarqueeRect(null);
    if (rect.w < 2 && rect.h < 2) {
      if (typeof onSelectBlock === 'function') onSelectBlock(null);
      return;
    }
    const blocks = layout?.pages?.[session.pageIndex]?.blocks || [];
    const ids = blockIdsInMarquee(blocks, rect);
    if (typeof onSelectBlock === 'function') {
      onSelectBlock(null, { replaceIds: ids });
    }
  }, [drawRectMode, handlePageDrawPointerUp, onSelectBlock, layout]);

  const handleCanvasBackgroundPointerDown = useCallback((event) => {
    if (placing) return;
    if (event.target?.closest?.('.free-canvas-page')) return;
    if (event.target?.closest?.('.free-canvas-add-page-row')) return;
    commitEditingBlock();
    if (typeof onSelectBlock === 'function') onSelectBlock(null);
  }, [placing, commitEditingBlock, onSelectBlock]);

  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  const theme = layout?.theme || {};
  const accent = theme.color_accent || '#1e2a3a';
  const fontHeading = theme.font_heading || 'Inter, sans-serif';
  const fontBody = theme.font_body || fontHeading;
  const sidebarColor = theme.color_sidebar || accent;
  const headerColor = theme.color_header || accent;
  const sectionTitleColor = theme.color_section_title || accent;
  const tplId = theme.template_id;
  const scaledHeight = scaledPageHeightPx(scale);
  const showAddPageBtn = interactable
    && typeof onAddPage === 'function'
    && canAppendBlankPage(layout);
  const showRemovePageBtns = interactable
    && typeof onRemovePage === 'function'
    && pages.length > 1;

  const placeLabel = placementPreset?.placementMode === 'draw-rect'
    ? 'Dessinez la zone'
    : placementPreset?.type === 'icon'
      ? 'Icône'
      : placementPreset?.type === 'image'
        ? 'Image'
        : placementPreset?.type || 'Élément';

  return (
    <div
      className={`free-canvas${placing ? ' free-canvas--placing' : ''}`}
      ref={viewportRef}
      onPointerDown={interactable ? handleCanvasBackgroundPointerDown : undefined}
    >
      <EmbeddedFontFaces fonts={layout?.fonts} />
      {placing && placeCursor && (
        <div
          className="free-canvas-placement-ghost"
          style={{ left: placeCursor.x, top: placeCursor.y }}
          aria-hidden
        >
          {placeLabel}
        </div>
      )}
      <div className="free-canvas-pages-stack">
      <div
        className="free-canvas-pages"
        style={{ minHeight: `${scaledHeight}px` }}
      >
        {pages.map((page, pageIndex) => {
          const blocks = Array.isArray(page?.blocks) ? [...page.blocks] : [];
          blocks.sort((a, b) => (a.z || 0) - (b.z || 0));
          return (
            <div
              key={page.id || `page-${pageIndex}`}
              className="free-canvas-page-wrap"
              style={{ height: `${scaledHeight}px` }}
            >
              {showRemovePageBtns && (
                <button
                  type="button"
                  className="free-canvas-remove-page-btn"
                  title={`Supprimer la page ${pageIndex + 1}`}
                  aria-label={`Supprimer la page ${pageIndex + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemovePage(pageIndex)}
                >
                  Supprimer page {pageIndex + 1}
                </button>
              )}
              <div
                className={[
                  'free-canvas-page',
                  tplId ? `free-canvas-page--tpl-${tplId}` : '',
                  interactable ? 'free-canvas-page--interactive' : '',
                  interactable && showGrid ? 'free-canvas-page--grid' : '',
                  placing ? 'free-canvas-page--placing' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  width: `${PAGE_WIDTH_MM}mm`,
                  height: `${PAGE_HEIGHT_MM}mm`,
                  transform: `scale(${scale})`,
                  fontFamily: fontBody,
                  ['--free-canvas-accent']: accent,
                  ['--free-canvas-sidebar']: sidebarColor,
                  ['--free-canvas-header']: headerColor,
                  ['--free-canvas-section-title']: sectionTitleColor,
                  ['--free-canvas-font-heading']: fontHeading,
                }}
                data-page-index={pageIndex}
                onPointerDown={interactable ? handlePageBackgroundPointerDown : undefined}
                onPointerMove={interactable ? handlePagePointerMove : undefined}
                onPointerUp={interactable ? handlePagePointerUp : undefined}
                onPointerCancel={interactable ? handlePagePointerUp : undefined}
                onDragOver={interactable ? handlePageDragOver : undefined}
                onDrop={interactable ? handlePageDrop : undefined}
              >
                {marqueeRect && !drawRectMode && (
                  <div
                    className="free-canvas-marquee"
                    style={{
                      left: `${marqueeRect.x}mm`,
                      top: `${marqueeRect.y}mm`,
                      width: `${marqueeRect.w}mm`,
                      height: `${marqueeRect.h}mm`,
                    }}
                    aria-hidden
                  />
                )}
                {drawRect && drawRectMode && (
                  <div
                    className="free-canvas-draw-rect-preview"
                    style={{
                      left: `${drawRect.x}mm`,
                      top: `${drawRect.y}mm`,
                      width: `${drawRect.w}mm`,
                      height: `${drawRect.h}mm`,
                    }}
                    aria-hidden
                  />
                )}
                {interactable && <SnapGuides guides={activeGuides} />}
                {blocks.map((block) => {
                  const preview =
                    resizePreview?.blockId === block.id ? resizePreview : null;
                  const renderBlock = preview
                    ? { ...block, x: preview.x, y: preview.y, w: preview.w, h: preview.h }
                    : block;
                  return (
                  <FreeCanvasBlock
                    key={block.id}
                    block={renderBlock}
                    cv={cv}
                    selected={selectedBlockIds.includes(block.id)}
                    editing={editingBlockId === block.id}
                    dragging={draggingBlockId === block.id}
                    resizing={resizingBlockId === block.id}
                    interactable={interactable}
                    onPointerDown={handleBlockPointerDown}
                    onPointerMove={handleBlockPointerMove}
                    onPointerUp={handleBlockPointerUp}
                    onPointerCancel={handleBlockPointerUp}
                    onResizePointerDown={handleResizePointerDown}
                    onResizePointerMove={handleResizePointerMove}
                    onResizePointerUp={handleResizePointerUp}
                    onResizePointerCancel={handleResizePointerUp}
                    onDoubleClickEdit={onStartBlockEdit}
                    onImageEdit={onImageEdit}
                    onInnerBlur={onCommitBlockEdit}
                    onBlockAutoHeight={suppressAutoHeight ? undefined : onBlockAutoHeight}
                    locked={Boolean(block.locked)}
                    onBlockElementRef={(blockId, el) => {
                      if (el) blockElementsRef.current[blockId] = el;
                      else delete blockElementsRef.current[blockId];
                    }}
                  />
                  );
                })}
                {blocks.length === 0 && (
                  <p className="free-canvas-page-empty">
                    Page {pageIndex + 1} vide — choisissez un élément dans la barre latérale, puis cliquez ici pour le placer
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showAddPageBtn && (
        <div className="free-canvas-add-page-row">
          <button
            type="button"
            className="free-canvas-add-page-btn"
            data-testid="free-canvas-add-page"
            title={`Ajouter une page A4 (page ${pages.length + 1})`}
            aria-label={`Ajouter une page ${pages.length + 1}`}
            onClick={() => onAddPage()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width={22}
              height={22}
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span className="free-canvas-add-page-hint">
            Page {pages.length} - ajouter la page {pages.length + 1}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
