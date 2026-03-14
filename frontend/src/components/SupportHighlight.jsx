import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Affiche un spotlight sur un élément de la page et une bulle explicative (une seule étape).
 * Utilisé depuis la page Support : au clic sur un sujet, on navigue puis on affiche ce composant.
 */
export default function SupportHighlight({ selector, title, content, position = 'bottom', onClose }) {
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [mounted, setMounted] = useState(false);
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
      top: rect.top - pad + window.scrollY,
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

  if (!mounted) return null;

  const pos = position || 'bottom';
  let tooltipStyle = {};
  if (spotlightRect?.elRect) {
    const { elRect } = spotlightRect;
    if (pos === 'bottom') {
      tooltipStyle = { top: elRect.bottom + 12, left: Math.max(12, Math.min(elRect.left + elRect.width / 2 - 160, window.innerWidth - 332)) };
    } else if (pos === 'top') {
      tooltipStyle = { bottom: window.innerHeight - elRect.top + 12, left: Math.max(12, Math.min(elRect.left + elRect.width / 2 - 160, window.innerWidth - 332)) };
    } else if (pos === 'right') {
      tooltipStyle = { top: elRect.top + elRect.height / 2 - 40, left: elRect.right + 12 };
    } else {
      tooltipStyle = { top: elRect.top + elRect.height / 2 - 40, right: window.innerWidth - elRect.left + 12 };
    }
  } else {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

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
