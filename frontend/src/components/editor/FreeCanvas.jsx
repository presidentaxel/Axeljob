import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import FreeCanvasBlock from './FreeCanvasBlock.jsx';
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
import { snapBlockGeometry, snapBlockPosition } from '../../lib/freeCanvasSnap.js';
import '../../styles/FreeCanvas.css';

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
  editingBlockId = null,
  onSelectBlock,
  onBlockPositionChange,
  onBlockResizeChange,
  onDragEnd,
  onCanvasInteractionChange,
  onStartBlockEdit,
  onCommitBlockEdit,
  onImageEdit,
  onSelectedBlockRect,
  showGrid = false,
  snapEnabled = true,
  interactable = true,
}) {
  const viewportRef = useRef(null);
  const blockElementsRef = useRef({});
  const [scale, setScale] = useState(1);
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const [resizingBlockId, setResizingBlockId] = useState(null);
  const [activeGuides, setActiveGuides] = useState([]);
  const dragSessionRef = useRef(null);
  const resizeSessionRef = useRef(null);

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
    resizeSessionRef.current = null;
    setResizingBlockId(null);
    clearGuides();
    setCanvasBusy(false);
  }, [clearGuides, setCanvasBusy]);

  useLayoutEffect(() => {
    if (!selectedBlockId || typeof onSelectedBlockRect !== 'function') {
      if (typeof onSelectedBlockRect === 'function') onSelectedBlockRect(null);
      return;
    }
    const el = blockElementsRef.current[selectedBlockId];
    if (!el) {
      onSelectedBlockRect(null);
      return;
    }
    const update = () => {
      const rect = el.getBoundingClientRect();
      onSelectedBlockRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
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

  const handleBlockPointerDown = useCallback((event, block) => {
    if (editingBlockId === block?.id) return;
    if (block?.locked) return;
    if (!interactable || !block?.id || resizeSessionRef.current) return;
    if (typeof onBlockPositionChange !== 'function') return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof onSelectBlock === 'function') onSelectBlock(block.id);
    dragSessionRef.current = {
      blockId: block.id,
      startMm: { x: block.x, y: block.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setDraggingBlockId(block.id);
    setCanvasBusy(true);
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [interactable, onSelectBlock, onBlockPositionChange, setCanvasBusy, editingBlockId]);

  const handleBlockPointerMove = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session || typeof onBlockPositionChange !== 'function') return;
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    const deltaMm = clientDeltaToMmDelta(dxPx, dyPx, scale);
    const pos = positionAfterDrag(session.startMm, deltaMm);
    const snapped = snapEnabled
      ? snapBlockPosition(pos, layout, session.blockId)
      : { ...pos, guides: [] };
    setActiveGuides(snapped.guides);
    onBlockPositionChange(
      session.blockId,
      { x: snapped.x, y: snapped.y },
      { groupKey: dragGroupKey(session.blockId) },
    );
  }, [scale, layout, onBlockPositionChange, snapEnabled]);

  const handleBlockPointerUp = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
    const wasDragging = Boolean(session);
    endDrag();
    if (wasDragging && typeof onDragEnd === 'function') onDragEnd();
  }, [endDrag, onDragEnd]);

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
    setCanvasBusy(true);
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [interactable, onSelectBlock, onBlockResizeChange, endDrag, setCanvasBusy]);

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
    onBlockResizeChange(
      session.blockId,
      { x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h },
      { groupKey: resizeGroupKey(session.blockId) },
    );
  }, [scale, layout, onBlockResizeChange, snapEnabled]);

  const handleResizePointerUp = useCallback((event) => {
    const session = resizeSessionRef.current;
    if (!session) return;
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
    const wasResizing = Boolean(session);
    endResize();
    if (wasResizing && typeof onDragEnd === 'function') onDragEnd();
  }, [endResize, onDragEnd]);

  const handlePageBackgroundPointerDown = useCallback((event) => {
    if (event.target !== event.currentTarget) return;
    if (typeof onSelectBlock === 'function') onSelectBlock(null);
  }, [onSelectBlock]);

  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  const theme = layout?.theme || {};
  const accent = theme.color_accent || '#1e2a3a';
  const fontHeading = theme.font_heading || 'Inter';
  const scaledHeight = scaledPageHeightPx(scale);

  return (
    <div className="free-canvas" ref={viewportRef}>
      {interactable && (
        <p className="free-canvas-hint-banner" role="status">
          Double-clic sur un bloc texte pour éditer · glisser pour déplacer · poignées pour redimensionner
        </p>
      )}
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
              <div
                className={[
                  'free-canvas-page',
                  interactable ? 'free-canvas-page--interactive' : '',
                  interactable && showGrid ? 'free-canvas-page--grid' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  width: `${PAGE_WIDTH_MM}mm`,
                  height: `${PAGE_HEIGHT_MM}mm`,
                  transform: `scale(${scale})`,
                  fontFamily: fontHeading,
                  ['--free-canvas-accent']: accent,
                }}
                data-page-index={pageIndex}
                onPointerDown={interactable ? handlePageBackgroundPointerDown : undefined}
              >
                {interactable && <SnapGuides guides={activeGuides} />}
                {blocks.map((block) => (
                  <FreeCanvasBlock
                    key={block.id}
                    block={block}
                    cv={cv}
                    selected={selectedBlockId === block.id}
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
                    locked={Boolean(block.locked)}
                    onBlockElementRef={(blockId, el) => {
                      if (el) blockElementsRef.current[blockId] = el;
                      else delete blockElementsRef.current[blockId];
                    }}
                  />
                ))}
                {blocks.length === 0 && pageIndex === 0 && (
                  <p className="free-canvas-page-empty">Page blanche — ajoutez des blocs (bientôt)</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
