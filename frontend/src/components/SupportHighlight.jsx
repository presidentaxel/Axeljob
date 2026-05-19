import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';

const MARGIN = 12;
const TOOLTIP_W = 320;
/** Hauteur de référence pour le placement ; affinée après rendu. */
const TOOLTIP_H_EST = 210;

/**
 * Choisit un côté où la bulle tient entièrement, sinon bas / haut au centre du viewport cible.
 */
function computeTooltipStyle(elRect, preferred) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.min(TOOLTIP_W, vw - 2 * MARGIN);
  const th = TOOLTIP_H_EST;

  const spaceLeft = elRect.left - MARGIN;
  const spaceRight = vw - elRect.right - MARGIN;
  const spaceBelow = vh - elRect.bottom - MARGIN;
  const spaceAbove = elRect.top - MARGIN;

  const needH = tw + MARGIN;
  const needV = th + MARGIN;

  let side = preferred || 'bottom';

  if (side === 'left') {
    if (spaceLeft < needH && spaceRight >= needH) side = 'right';
    else if (spaceLeft < needH && spaceRight < needH) {
      side = spaceBelow >= needV ? 'bottom' : spaceAbove >= needV ? 'top' : 'bottom';
    }
  } else if (side === 'right') {
    if (spaceRight < needH && spaceLeft >= needH) side = 'left';
    else if (spaceRight < needH && spaceLeft < needH) {
      side = spaceBelow >= needV ? 'bottom' : spaceAbove >= needV ? 'top' : 'bottom';
    }
  }

  if (side === 'bottom' && spaceBelow < needV && spaceAbove > spaceBelow) side = 'top';
  if (side === 'top' && spaceAbove < needV && spaceBelow > spaceAbove) side = 'bottom';

  const clampLeft = (L) => Math.max(MARGIN, Math.min(L, vw - tw - MARGIN));
  const clampTop = (T) => Math.max(MARGIN, Math.min(T, vh - th - MARGIN));

  if (side === 'bottom') {
    let top = elRect.bottom + MARGIN;
    let left = clampLeft(elRect.left + elRect.width / 2 - tw / 2);
    if (top + th > vh - MARGIN) top = Math.max(MARGIN, elRect.top - th - MARGIN);
    return { top: clampTop(top), left, width: tw, transform: undefined };
  }

  if (side === 'top') {
    let top = elRect.top - MARGIN - th;
    let left = clampLeft(elRect.left + elRect.width / 2 - tw / 2);
    return { top: clampTop(top), left, width: tw, transform: undefined };
  }

  if (side === 'right') {
    let left = elRect.right + MARGIN;
    let top = elRect.top + elRect.height / 2 - th / 2;
    left = Math.min(left, vw - tw - MARGIN);
    left = Math.max(MARGIN, left);
    return { top: clampTop(top), left, width: tw, transform: undefined };
  }

  // left (bulle à gauche de la zone mise en avant)
  let left = elRect.left - MARGIN - tw;
  let top = elRect.top + elRect.height / 2 - th / 2;
  left = clampLeft(left);
  return { top: clampTop(top), left, width: tw, transform: undefined };
}

/**
 * Affiche un spotlight sur un élément de la page et une bulle explicative (une seule étape).
 * Utilisé depuis la page Support : au clic sur un sujet, on navigue puis on affiche ce composant.
 */
export default function SupportHighlight({ selector, title, content, position = 'bottom', onClose }) {
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [fineShiftY, setFineShiftY] = useState(0);
  const tooltipRef = useRef(null);

  const updateSpotlight = useCallback(() => {
    if (!selector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 6;
    setSpotlightRect({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      elRect: rect,
    });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selector]);

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true);
    }, 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [mounted, updateSpotlight]);

  const baseTooltipStyle = useMemo(() => {
    if (!spotlightRect?.elRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: undefined };
    }
    return computeTooltipStyle(spotlightRect.elRect, position || 'bottom');
  }, [spotlightRect, position]);

  useLayoutEffect(() => {
    setFineShiftY(0);
  }, [baseTooltipStyle]);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node || typeof baseTooltipStyle.top !== 'number') return;
    const r = node.getBoundingClientRect();
    const vh = window.innerHeight;
    let shift = 0;
    if (r.bottom > vh - MARGIN) shift = vh - MARGIN - r.bottom;
    if (r.top + shift < MARGIN) shift = MARGIN - r.top;
    if (shift !== 0) setFineShiftY(shift);
  }, [baseTooltipStyle, title, content]);

  if (!mounted) return null;

  const tooltipStyle =
    typeof baseTooltipStyle.top === 'number'
      ? { ...baseTooltipStyle, top: baseTooltipStyle.top + fineShiftY }
      : baseTooltipStyle;

  return (
    <div className="guided-tour-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {spotlightRect && (
        <div
          className="guided-tour-spotlight"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}
      <div className="guided-tour-tooltip support-highlight-tooltip" ref={tooltipRef} style={tooltipStyle}>
        <h4 className="guided-tour-title">{title}</h4>
        <p className="guided-tour-content">{content}</p>
        <div className="guided-tour-actions">
          <button type="button" className="guided-tour-btn guided-tour-btn--next" onClick={onClose}>
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
