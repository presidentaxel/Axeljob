import { useState, useEffect, useRef } from 'react';
import { HiStar, HiOutlineStar } from 'react-icons/hi2';

const PREVIEW_THUMBNAILS = {
  classic:   { bg: '#1e2a3a', sidebar: '#f4f4f2', accent: '#1e2a3a', layout: 'right-sidebar' },
  modern:    { bg: '#2d3748', sidebar: '#2d3748', accent: '#3182ce', layout: 'left-sidebar' },
  minimal:   { bg: '#ffffff', sidebar: null,      accent: '#111827', layout: 'single' },
  executive: { bg: '#0f172a', sidebar: '#f8f6f0', accent: '#b8860b', layout: 'right-sidebar' },
  elegant:   { bg: '#ffffff', sidebar: null,      accent: '#4a5568', layout: 'single-centered' },
  creative:  { bg: '#6366f1', sidebar: '#6366f1', accent: '#f59e0b', layout: 'left-sidebar' },
  bold:      { bg: '#1e293b', sidebar: '#f1f5f9', accent: '#dc2626', layout: 'right-sidebar' },
};

export const FAVORITES_STORAGE_KEY = 'cv_template_favorites';

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
    </div>
  );
}

function TemplateCard({ template, isSelected, isFavorite, onSelect, onToggleFavorite }) {
  const handleClick = () => {
    onSelect(template);
  };
  const handleStarClick = (e) => {
    e.stopPropagation();
    onToggleFavorite(template.id);
  };

  const handleCardKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`tpl-modal-card${isSelected ? ' tpl-modal-card--active' : ''}`}
      onClick={handleClick}
      onKeyDown={handleCardKeyDown}
      title={template.description}
    >
      <div className="tpl-modal-card-preview">
        <MiniPreview templateId={template.id} isActive={isSelected} />
      </div>
      <span className="tpl-modal-card-name">{template.name}</span>
      <button
        type="button"
        className="tpl-modal-card-fav"
        onClick={handleStarClick}
        title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        {isFavorite ? <HiStar size={16} /> : <HiOutlineStar size={16} />}
      </button>
    </div>
  );
}

export default function TemplateModal({
  open,
  onClose,
  templates,
  templateId,
  onChangeTemplate,
  favoriteIds,
  onToggleFavorite,
  initialTab,
}) {
  const [tab, setTab] = useState('library');
  const ref = useRef(null);

  useEffect(() => {
    if (open && initialTab) setTab(initialTab);
  }, [open, initialTab]);

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

  const handleSelect = (t) => {
    onChangeTemplate(t.id);
    onClose();
  };

  const isCustomTemplate = (t) => t.tags?.includes('custom') || (t.id && String(t.id).startsWith('custom_'));
  const libraryTemplates = templates.filter((t) => !isCustomTemplate(t));
  const customTemplates = templates.filter(isCustomTemplate);
  const favoritesList = libraryTemplates.filter((t) => favoriteIds.includes(t.id));

  return (
    <div className="tpl-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tpl-modal-title">
      <div className="tpl-modal" ref={ref}>
        <div className="tpl-modal-header">
          <h2 id="tpl-modal-title" className="tpl-modal-title">Choisir un template</h2>
          <button type="button" className="tpl-modal-close" onClick={onClose} aria-label="Fermer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="tpl-modal-tabs">
          <button
            type="button"
            className={`tpl-modal-tab${tab === 'library' ? ' tpl-modal-tab--active' : ''}`}
            onClick={() => setTab('library')}
          >
            Bibliothèque de templates
          </button>
          <button
            type="button"
            className={`tpl-modal-tab${tab === 'mine' ? ' tpl-modal-tab--active' : ''}`}
            onClick={() => setTab('mine')}
          >
            Mes templates
          </button>
        </div>
        <div className="tpl-modal-body">
          {tab === 'library' && (
            <div className="tpl-modal-library">
              <div className="tpl-modal-grid">
                {libraryTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    isSelected={templateId === t.id}
                    isFavorite={favoriteIds.includes(t.id)}
                    onSelect={handleSelect}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
              {libraryTemplates.length === 0 && (
                <p className="tpl-modal-mine-empty">
                  Les templates intégrés (Classic, Modern, Minimal, etc.) devraient s'afficher ici. Rechargez la page si la liste est vide.
                </p>
              )}
            </div>
          )}
          {tab === 'mine' && (
            <div className="tpl-modal-mine">
              {customTemplates.length > 0 && (
                <div className="tpl-modal-mine-section">
                  <h3 className="tpl-modal-mine-section-title">Mes templates personnalisés</h3>
                  <div className="tpl-modal-grid">
                    {customTemplates.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        isSelected={templateId === t.id}
                        isFavorite={favoriteIds.includes(t.id)}
                        onSelect={handleSelect}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="tpl-modal-mine-section">
                <h3 className="tpl-modal-mine-section-title">Favoris (bibliothèque)</h3>
                <div className="tpl-modal-grid">
                  {favoritesList.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      isSelected={templateId === t.id}
                      isFavorite={true}
                      onSelect={handleSelect}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
                {favoritesList.length === 0 && (
                  <p className="tpl-modal-mine-empty">
                    Aucun favori. Ajoute des favoris depuis la bibliothèque (étoile).
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
