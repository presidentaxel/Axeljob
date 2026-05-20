import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import FreeCanvasBlock from './FreeCanvasBlock.jsx';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../../lib/cvLayoutModelV3.js';
import {
  clientDeltaToMmDelta,
  dragGroupKey,
  positionAfterDrag,
} from '../../lib/freeCanvasDrag.js';
import { computePageScale, scaledPageHeightPx } from '../../lib/freeCanvasScale.js';
import '../../styles/FreeCanvas.css';

/**
 * Canvas libre (P3.2 read-only, P3.3 drag).
 *
 * Props :
 *  - layout, cv
 *  - selectedBlockId, onSelectBlock(blockId|null)
 *  - onBlockPositionChange(blockId, { x, y }, { groupKey? })
 *  - onDragEnd : optionnel, appele au pointerup apres un drag (ex. auto-save)
 *  - interactable (defaut true) : selection + drag
 */
export default function FreeCanvas({
  layout,
  cv,
  selectedBlockId = null,
  onSelectBlock,
  onBlockPositionChange,
  onDragEnd,
  interactable = true,
}) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [draggingBlockId, setDraggingBlockId] = useState(null);
  const dragSessionRef = useRef(null);

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

  const endDrag = useCallback(() => {
    dragSessionRef.current = null;
    setDraggingBlockId(null);
  }, []);

  const handleBlockPointerDown = useCallback((event, block) => {
    if (!interactable || !block?.id) return;
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
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [interactable, onSelectBlock, onBlockPositionChange]);

  const handleBlockPointerMove = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session || typeof onBlockPositionChange !== 'function') return;
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    const deltaMm = clientDeltaToMmDelta(dxPx, dyPx, scale);
    const pos = positionAfterDrag(session.startMm, deltaMm);
    onBlockPositionChange(session.blockId, pos, { groupKey: dragGroupKey(session.blockId) });
  }, [scale, onBlockPositionChange]);

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
          Glissez les blocs pour les déplacer · contenu rogné dans le cadre (pas de scroll interne) · taille / typo à venir
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
                className={
                  interactable
                    ? 'free-canvas-page free-canvas-page--interactive'
                    : 'free-canvas-page'
                }
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
                {blocks.map((block) => (
                  <FreeCanvasBlock
                    key={block.id}
                    block={block}
                    cv={cv}
                    selected={selectedBlockId === block.id}
                    dragging={draggingBlockId === block.id}
                    interactable={interactable}
                    onPointerDown={handleBlockPointerDown}
                    onPointerMove={handleBlockPointerMove}
                    onPointerUp={handleBlockPointerUp}
                    onPointerCancel={handleBlockPointerUp}
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
