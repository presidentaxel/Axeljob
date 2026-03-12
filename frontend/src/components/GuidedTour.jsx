import { useState, useEffect, useRef, useCallback } from 'react';

const TOUR_STORAGE_KEY = 'cv_bot_tour_done';

export default function GuidedTour({ steps, onComplete, tourKey = 'main' }) {
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
      top: rect.top - pad + window.scrollY,
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
    if (pos === 'bottom') {
      tooltipStyle = { top: elRect.bottom + 12, left: Math.max(12, elRect.left + elRect.width / 2 - 160) };
    } else if (pos === 'top') {
      tooltipStyle = { bottom: window.innerHeight - elRect.top + 12, left: Math.max(12, elRect.left + elRect.width / 2 - 160) };
    } else if (pos === 'right') {
      tooltipStyle = { top: elRect.top + elRect.height / 2 - 40, left: elRect.right + 12 };
    } else {
      tooltipStyle = { top: elRect.top + elRect.height / 2 - 40, right: window.innerWidth - elRect.left + 12 };
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
