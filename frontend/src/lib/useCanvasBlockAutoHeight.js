import { useLayoutEffect } from 'react';
import { BLOCK_MIN_HEIGHT_MM } from './cvLayoutModelV3.js';
import { MM_TO_PX } from './freeCanvasScale.js';

/** Marge mm sous le contenu pour éviter la coupe de la dernière ligne. */
export const BLOCK_CONTENT_HEIGHT_PAD_MM = 1.5;

/**
 * Mesure le contenu d'un bloc et synchronise sa hauteur (mm) via callback.
 * ResizeObserver + MutationObserver pour réagir au CV, à l'édition et au formatage.
 */
export function useCanvasBlockAutoHeight({
  innerRef,
  enabled,
  blockId,
  contentKey,
  onReportHeight,
}) {
  useLayoutEffect(() => {
    if (!enabled || !innerRef?.current || typeof onReportHeight !== 'function') return undefined;

    const el = innerRef.current;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hMm = Math.max(
          BLOCK_MIN_HEIGHT_MM,
          el.scrollHeight / MM_TO_PX + BLOCK_CONTENT_HEIGHT_PAD_MM,
        );
        onReportHeight(hMm);
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [enabled, blockId, contentKey, onReportHeight, innerRef]);
}
