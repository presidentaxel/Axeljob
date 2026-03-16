import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../api';
import TemplateModal, { FAVORITES_STORAGE_KEY } from './TemplateModal';

function getDefaultOptions(options) {
  const defaults = {};
  (options || []).forEach((opt) => {
    if (opt.key !== undefined) defaults[opt.key] = opt.default;
  });
  defaults.show_photo = true;
  defaults.show_mots_cles_ats = true;
  return defaults;
}

function OptionsPopover({ options, templateOptions, onChangeOptions, onClose }) {
  const ref = useRef(null);
  const defaultOptions = getDefaultOptions(options);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const COLOR_PRESETS = ['#1e2a3a', '#2d3748', '#3182ce', '#6366f1', '#059669', '#dc2626', '#7c3aed', '#111827', '#b8860b', '#f59e0b'];

  const handleReset = () => {
    onChangeOptions(defaultOptions);
  };

  return (
    <div className="tpl-popover" ref={ref}>
      <div className="tpl-popover-arrow" />
      {options.map(opt => (
        <div key={opt.key} className="tpl-opt-row">
          <span className="tpl-opt-label">{opt.label}</span>
          <div className="tpl-opt-control">
            {opt.type === 'color' && (
              <div className="tpl-colors">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    className={`tpl-cdot${(templateOptions?.[opt.key] || opt.default) === c ? ' tpl-cdot--on' : ''}`}
                    style={{ background: c }}
                    onClick={() => onChangeOptions({ ...templateOptions, [opt.key]: c })}
                  />
                ))}
                <label className="tpl-cinput-wrap">
                  <input
                    type="color"
                    value={templateOptions?.[opt.key] || opt.default || '#000000'}
                    onChange={e => onChangeOptions({ ...templateOptions, [opt.key]: e.target.value })}
                    className="tpl-cinput"
                  />
                </label>
              </div>
            )}
            {opt.type === 'select' && (
              <select
                className="tpl-sel"
                value={templateOptions?.[opt.key] || opt.default}
                onChange={e => onChangeOptions({ ...templateOptions, [opt.key]: e.target.value })}
              >
                {(opt.choices || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {opt.type === 'boolean' && (
              <button
                className={`tpl-toggle${(templateOptions?.[opt.key] ?? opt.default) ? ' tpl-toggle--on' : ''}`}
                onClick={() => onChangeOptions({ ...templateOptions, [opt.key]: !(templateOptions?.[opt.key] ?? opt.default) })}
              >
                <span className="tpl-toggle-knob" />
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="tpl-popover-reset">
        <button type="button" className="tpl-popover-reset-btn" onClick={handleReset}>
          Réglages d’origine
        </button>
      </div>
    </div>
  );
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch (_) {}
}

export default function TemplatePicker({ templates: templatesProp, templateId, templateOptions, onChangeTemplate, onChangeOptions, userPlan, onUpgradeClick, openOptionsFromSupport, openModalToTab, onOpenFromUrlConsumed }) {
  const [templatesLocal, setTemplatesLocal] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(loadFavorites);
  const useProp = templatesProp !== undefined;
  const templates = useProp && Array.isArray(templatesProp) ? templatesProp : templatesLocal;
  const loading = useProp ? templates.length === 0 : templatesLocal.length === 0;
  const currentMeta = templates.find(t => t.id === templateId) || templates[0] || {};
  const options = currentMeta.options || [];

  useEffect(() => {
    if (useProp) return;
    apiGet('/api/templates')
      .then(data => setTemplatesLocal(Array.isArray(data) ? data : []))
      .catch(() => setTemplatesLocal([]));
  }, [useProp]);

  useEffect(() => {
    if (openOptionsFromSupport && options.length > 0) setShowOptions(true);
  }, [openOptionsFromSupport, options.length]);

  const openedFromUrlRef = useRef(false);
  useEffect(() => {
    if (openModalToTab !== 'mine' || openedFromUrlRef.current || modalOpen) return;
    openedFromUrlRef.current = true;
    setInitialTab('mine');
    setModalOpen(true);
    onOpenFromUrlConsumed?.();
  }, [openModalToTab, modalOpen, onOpenFromUrlConsumed]);

  const toggleFavorite = useCallback((id) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveFavorites(next);
      return next;
    });
  }, []);

  if (loading && templates.length === 0) return null;

  return (
    <div className="tpl-bar">
      <div className="tpl-bar-left">
        <button
          type="button"
          className="tpl-btn-open-modal"
          onClick={() => setModalOpen(true)}
          title="Choisir un template"
        >
          <span className="tpl-btn-open-modal-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </span>
          <span className="tpl-btn-open-modal-label">Template</span>
          <span className="tpl-btn-open-modal-current">{currentMeta.name || templateId}</span>
          <svg className="tpl-btn-open-modal-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      {options.length > 0 && (
        <div className="tpl-bar-right">
          <button
            className={`tpl-gear${showOptions ? ' tpl-gear--open' : ''}`}
            onClick={() => setShowOptions(!showOptions)}
            title="Personnaliser le template"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {showOptions && (
            <OptionsPopover
              options={options}
              templateOptions={templateOptions}
              onChangeOptions={onChangeOptions}
              onClose={() => setShowOptions(false)}
            />
          )}
        </div>
      )}
      <TemplateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setInitialTab(null); }}
        templates={templates}
        templateId={templateId}
        onChangeTemplate={onChangeTemplate}
        userPlan={userPlan}
        onUpgradeClick={onUpgradeClick}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
        initialTab={initialTab}
      />
    </div>
  );
}
