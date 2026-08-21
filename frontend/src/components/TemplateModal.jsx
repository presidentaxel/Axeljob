import { useEffect, useRef } from 'react';
import {
  hasUsableBetaCanvasLayout,
  isBetaCanvasTemplateId,
  withBetaCanvasTemplate,
} from '../lib/betaCanvasTemplate.js';

const PREVIEW_THUMBNAILS = {
  classic:   { bg: '#1e2a3a', sidebar: '#f4f4f2', accent: '#1e2a3a', layout: 'right-sidebar' },
  modern:    { bg: '#2d3748', sidebar: '#2d3748', accent: '#3182ce', layout: 'left-sidebar' },
  minimal:   { bg: '#ffffff', sidebar: null,      accent: '#111827', layout: 'single' },
  executive: { bg: '#0f172a', sidebar: '#f8f6f0', accent: '#b8860b', layout: 'right-sidebar' },
  elegant:   { bg: '#ffffff', sidebar: null,      accent: '#4a5568', layout: 'single-centered' },
  creative:  { bg: '#6366f1', sidebar: '#6366f1', accent: '#f59e0b', layout: 'left-sidebar' },
  bold:      { bg: '#1e293b', sidebar: '#f1f5f9', accent: '#dc2626', layout: 'right-sidebar' },
  beta:      { bg: '#17171c', sidebar: '#f4f1ea', accent: '#e85d4c', layout: 'beta-canvas' },
};

function MiniPreview({ templateId, isActive }) {
  const isCustom = templateId && String(templateId).startsWith('custom_');
  const t = PREVIEW_THUMBNAILS[templateId] || (isCustom ? { bg: '#4f46e5', sidebar: '#e0e7ff', accent: '#4f46e5', layout: 'right-sidebar' } : PREVIEW_THUMBNAILS.classic);
  return (
    <div className={`tpl-mini${isActive ? ' tpl-mini--active' : ''}`}>
      {t.layout === 'right-sidebar' && (
        <div className="tpl-mini-inner">
          <div className="tpl-mini-hdr" style={{ background: t.bg }} />
          <div className="tpl-mini-cols">
            <div className="tpl-mini-main">
              <div className="tpl-mini-ln" style={{ background: t.accent, width: '65%', height: 2.5 }} />
              <div className="tpl-mini-ln" style={{ width: '88%' }} />
              <div className="tpl-mini-ln" style={{ width: '75%' }} />
            </div>
            <div className="tpl-mini-side" style={{ background: t.sidebar }} />
          </div>
        </div>
      )}
      {t.layout === 'left-sidebar' && (
        <div className="tpl-mini-inner">
          <div className="tpl-mini-cols" style={{ height: '100%' }}>
            <div className="tpl-mini-side tpl-mini-side--left" style={{ background: t.sidebar }} />
            <div className="tpl-mini-main">
              <div className="tpl-mini-ln" style={{ background: t.accent, width: '55%', height: 2.5 }} />
              <div className="tpl-mini-ln" style={{ width: '88%' }} />
              <div className="tpl-mini-ln" style={{ width: '72%' }} />
            </div>
          </div>
        </div>
      )}
      {t.layout === 'single' && (
        <div className="tpl-mini-inner" style={{ borderTop: `2px solid ${t.accent}` }}>
          <div className="tpl-mini-main" style={{ padding: '3px 4px' }}>
            <div className="tpl-mini-ln" style={{ background: t.accent, width: '45%', height: 3 }} />
            <div className="tpl-mini-ln" style={{ width: '92%' }} />
            <div className="tpl-mini-ln" style={{ width: '80%' }} />
          </div>
        </div>
      )}
      {t.layout === 'single-centered' && (
        <div className="tpl-mini-inner" style={{ borderBottom: `1px solid ${t.accent}` }}>
          <div className="tpl-mini-main" style={{ padding: '3px 4px', textAlign: 'center' }}>
            <div className="tpl-mini-ln" style={{ background: t.accent, width: '40%', height: 3, margin: '0 auto 2px' }} />
            <div className="tpl-mini-ln" style={{ width: '70%', margin: '0 auto 1px' }} />
            <div className="tpl-mini-ln" style={{ width: '85%', margin: '0 auto' }} />
          </div>
        </div>
      )}
      {t.layout === 'beta-canvas' && (
        <div className="tpl-mini-inner" style={{ background: t.sidebar || '#f4f1ea' }}>
          <div className="tpl-mini-hdr" style={{ background: t.bg, height: 8 }} />
          <div style={{ padding: '3px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <div className="tpl-mini-ln" style={{ background: t.accent, width: '100%', height: 6, borderRadius: 1 }} />
            <div className="tpl-mini-ln" style={{ width: '100%', height: 6 }} />
            <div className="tpl-mini-ln" style={{ width: '100%', height: 4 }} />
            <div className="tpl-mini-ln" style={{ width: '70%', height: 4 }} />
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, isSelected, onSelect, disabled, badge }) {
  const handleClick = () => {
    if (disabled) return;
    onSelect(template);
  };

  const handleCardKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={`tpl-modal-card${isSelected ? ' tpl-modal-card--active' : ''}${disabled ? ' tpl-modal-card--disabled' : ''}`}
      onClick={handleClick}
      onKeyDown={handleCardKeyDown}
      title={disabled ? (template.disabledReason || template.description) : template.description}
    >
      <div className="tpl-modal-card-preview">
        <MiniPreview templateId={template.id} isActive={isSelected} />
      </div>
      <span className="tpl-modal-card-name">
        {template.name}
        {badge ? <span className="tpl-modal-card-badge">{badge}</span> : null}
      </span>
    </div>
  );
}

function isCustomTemplate(t) {
  return t?.tags?.includes('custom') || (t?.id && String(t.id).startsWith('custom_'));
}

export default function TemplateModal({
  open,
  onClose,
  templates,
  templateId,
  onChangeTemplate,
  profileLayout = null,
  onBetaUnavailable = null,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const catalog = withBetaCanvasTemplate(templates).filter((t) => !isCustomTemplate(t));
  const betaReady = hasUsableBetaCanvasLayout(profileLayout);

  const handleSelect = (t) => {
    if (isBetaCanvasTemplateId(t.id) && !betaReady) {
      if (typeof onBetaUnavailable === 'function') onBetaUnavailable();
      return;
    }
    onChangeTemplate(t.id);
    onClose();
  };

  return (
    <div className="tpl-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tpl-modal-title">
      <div className="tpl-modal" ref={ref}>
        <div className="tpl-modal-header">
          <h2 id="tpl-modal-title" className="tpl-modal-title">Choisir un template</h2>
          <button type="button" className="tpl-modal-close" onClick={onClose} aria-label="Fermer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="tpl-modal-body">
          <div className="tpl-modal-library">
            <div className="tpl-modal-grid">
              {catalog.map((t) => {
                const isBeta = isBetaCanvasTemplateId(t.id);
                const disabled = isBeta && !betaReady;
                return (
                  <TemplateCard
                    key={t.id}
                    template={{
                      ...t,
                      disabledReason: disabled
                        ? 'Crée d’abord un design dans Profil → mode Beta.'
                        : t.description,
                    }}
                    isSelected={templateId === t.id}
                    onSelect={handleSelect}
                    disabled={disabled}
                    badge={isBeta ? 'Canvas' : null}
                  />
                );
              })}
            </div>
            {catalog.length === 0 && (
              <p className="tpl-modal-empty">
                Les templates intégrés (Classic, Modern, Minimal, etc.) devraient s&apos;afficher ici. Rechargez la page si la liste est vide.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
