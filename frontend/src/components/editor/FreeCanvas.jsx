import { useLayoutEffect, useRef, useState } from 'react';
import FreeCanvasBlock from './FreeCanvasBlock.jsx';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../../lib/cvLayoutModelV3.js';
import { computePageScale, scaledPageHeightPx } from '../../lib/freeCanvasScale.js';
import '../../styles/FreeCanvas.css';

/**
 * Canvas libre read-only (P3.2) : affiche un layout v3 sur une ou plusieurs
 * pages A4, blocs en position absolue (mm). Pas de drag / resize / edition
 * pour l instant — objectif : voir le resultat du modele v3 + contenu CV.
 *
 * Props :
 *  - layout : layout v3 sanitize (pages[].blocks[])
 *  - cv : objet CV (contenu)
 *  - selectedBlockId : optionnel, surligne un bloc (prep P3.3)
 *  - readOnlyLabel : afficher le bandeau "lecture seule"
 */
export default function FreeCanvas({
  layout,
  cv,
  selectedBlockId = null,
  readOnlyLabel = true,
}) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(1);

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

  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  const theme = layout?.theme || {};
  const accent = theme.color_accent || '#1e2a3a';
  const fontHeading = theme.font_heading || 'Inter';

  const scaledHeight = scaledPageHeightPx(scale);

  return (
    <div className="free-canvas" ref={viewportRef}>
      {readOnlyLabel && (
        <p className="free-canvas-readonly-banner" role="status">
          Canvas libre — aperçu lecture seule (déplacement et redimensionnement à venir)
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
                className="free-canvas-page"
                style={{
                  width: `${PAGE_WIDTH_MM}mm`,
                  height: `${PAGE_HEIGHT_MM}mm`,
                  transform: `scale(${scale})`,
                  fontFamily: fontHeading,
                  ['--free-canvas-accent']: accent,
                }}
                data-page-index={pageIndex}
              >
                {blocks.map((block) => (
                  <FreeCanvasBlock
                    key={block.id}
                    block={block}
                    cv={cv}
                    selected={selectedBlockId === block.id}
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
