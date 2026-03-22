import { useState, useEffect, useRef, useCallback } from 'react';

const TOUR_STORAGE_KEY = 'cv_bot_tour_done';
const MARGIN = 12;
const TOOLTIP_W = 320;

function tooltipWidthPx() {
  return Math.min(TOOLTIP_W, window.innerWidth - 2 * MARGIN);
}

/** Centre sous / au-dessus de la zone cible, en restant dans le viewport. */
function clampLeftCenteredUnder(elRect) {
  const vw = window.innerWidth;
  const tw = tooltipWidthPx();
  const ideal = elRect.left + elRect.width / 2 - tw / 2;
  return Math.max(MARGIN, Math.min(ideal, vw - tw - MARGIN));
}

export default function GuidedTour({ steps, onComplete, onStepChange, tourKey = 'main' }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_STORAGE_KEY + '_' + tourKey);
    if (done) return;
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [tourKey]);

  const updateSpotlight = useCallback(() => {
    if (!visible || currentStep >= steps.length) return;
    const step = steps[currentStep];
    const el = document.querySelector(step.selector);
    if (!el) { setSpotlightRect(null); return; }
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
  }, [visible, currentStep, steps]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [updateSpotlight]);

  useEffect(() => {
    if (!visible) {
      onStepChange?.(null, -1);
      return;
    }
    if (currentStep >= steps.length) return;
    onStepChange?.(steps[currentStep], currentStep);
  }, [visible, currentStep, steps, onStepChange]);

  const finish = useCallback(() => {
    setVisible(false);
    localStorage.setItem(TOUR_STORAGE_KEY + '_' + tourKey, '1');
    onComplete?.();
  }, [tourKey, onComplete]);

  const next = () => {
    if (currentStep + 1 >= steps.length) { finish(); return; }
    setCurrentStep(currentStep + 1);
  };

  if (!visible || currentStep >= steps.length) return null;

  const step = steps[currentStep];
  const pos = step.position || 'bottom';

  let tooltipStyle = {};
  if (spotlightRect) {
    const { elRect } = spotlightRect;
    const tw = tooltipWidthPx();
    const vh = window.innerHeight;
    const estH = 200;
    const clampTop = (t) => Math.max(MARGIN, Math.min(t, vh - estH - MARGIN));

    if (pos === 'bottom') {
      tooltipStyle = { top: elRect.bottom + MARGIN, left: clampLeftCenteredUnder(elRect) };
    } else if (pos === 'top') {
      tooltipStyle = {
        bottom: vh - elRect.top + MARGIN,
        left: clampLeftCenteredUnder(elRect),
      };
    } else if (pos === 'right') {
      let left = elRect.right + MARGIN;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - tw - MARGIN));
      tooltipStyle = { top: clampTop(elRect.top + elRect.height / 2 - 40), left };
    } else {
      let left = elRect.left - MARGIN - tw;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - tw - MARGIN));
      tooltipStyle = { top: clampTop(elRect.top + elRect.height / 2 - 40), left };
    }
  }

  return (
    <div className="guided-tour-overlay" onClick={(e) => { if (e.target === e.currentTarget) finish(); }}>
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
      <div className="guided-tour-tooltip" ref={tooltipRef} style={tooltipStyle}>
        <div className="guided-tour-tooltip-header">
          <span className="guided-tour-step-count">{currentStep + 1}/{steps.length}</span>
          <button className="guided-tour-skip" onClick={finish}>Passer</button>
        </div>
        <h4 className="guided-tour-title">{step.title}</h4>
        <p className="guided-tour-content">{step.content}</p>
        <div className="guided-tour-actions">
          {currentStep > 0 && (
            <button className="guided-tour-btn guided-tour-btn--prev" onClick={() => setCurrentStep(currentStep - 1)}>
              Précédent
            </button>
          )}
          <button className="guided-tour-btn guided-tour-btn--next" onClick={next}>
            {currentStep + 1 >= steps.length ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
