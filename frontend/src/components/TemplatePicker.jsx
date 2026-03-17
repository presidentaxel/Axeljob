import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../api';
import TemplateModal, { FAVORITES_STORAGE_KEY } from './TemplateModal';

const TYPO_DEFAULTS = {
  font_size_name: 15,
  font_size_title: 10,
  font_size_section: 9.5,
  font_size_body: 9,
  font_size_bullet: 9,
  font_size_sidebar_title: 8,
  font_size_sidebar_item: 8,
  color_body: '#1a1a1a',
  color_section_title: '#1e2a3a',
  photo_size: 72,
};

const TYPO_PRESETS = {
  compact: { font_size_name: 14, font_size_title: 9.5, font_size_section: 9, font_size_body: 8.5, font_size_bullet: 8.5, font_size_sidebar_title: 7.5, font_size_sidebar_item: 7.5 },
  default: TYPO_DEFAULTS,
  readable: { font_size_name: 16, font_size_title: 11, font_size_section: 10.5, font_size_body: 10, font_size_bullet: 10, font_size_sidebar_title: 9, font_size_sidebar_item: 9 },
};

const TYPO_FIELDS = [
  { key: 'font_size_name', label: 'Nom (en-tête)', min: 10, max: 24, step: 0.5, unit: 'pt' },
  { key: 'font_size_title', label: 'Titre professionnel', min: 8, max: 16, step: 0.5, unit: 'pt' },
  { key: 'font_size_section', label: 'Titres de section', min: 8, max: 14, step: 0.5, unit: 'pt' },
  { key: 'font_size_body', label: 'Texte (corps)', min: 7, max: 13, step: 0.5, unit: 'pt' },
  { key: 'font_size_bullet', label: 'Listes à puces', min: 7, max: 12, step: 0.5, unit: 'pt' },
  { key: 'font_size_sidebar_title', label: 'Sidebar – titres', min: 6, max: 12, step: 0.5, unit: 'pt' },
  { key: 'font_size_sidebar_item', label: 'Sidebar – texte', min: 6, max: 11, step: 0.5, unit: 'pt' },
  { key: 'photo_size', label: 'Taille de la photo', min: 48, max: 140, step: 2, unit: 'px' },
];

function getDefaultOptions(options) {
  const defaults = { ...TYPO_DEFAULTS };
  (options || []).forEach((opt) => {
    if (opt.key !== undefined) defaults[opt.key] = opt.default;
  });
  defaults.show_photo = true;
  defaults.show_mots_cles_ats = true;
  return defaults;
}

function OptionsPopover({ options, templateOptions, onChangeOptions, onClose }) {
  const ref = useRef(null);
  const [typoOpen, setTypoOpen] = useState(false);
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

  const applyTypoPreset = (presetKey) => {
    const preset = TYPO_PRESETS[presetKey];
    onChangeOptions({ ...templateOptions, ...preset });
  };

  const getTypoValue = (key) => {
    const v = templateOptions?.[key];
    if (v != null) return Number(v);
    return TYPO_DEFAULTS[key] != null ? TYPO_DEFAULTS[key] : (key === 'photo_size' ? 72 : 9);
  };

  const setTypoValue = (key, value) => {
    const n = parseFloat(value, 10);
    if (!Number.isNaN(n)) onChangeOptions({ ...templateOptions, [key]: n });
  };

  const getColorValue = (key) => templateOptions?.[key] || TYPO_DEFAULTS[key] || '#1a1a1a';
  const setColorValue = (key, value) => onChangeOptions({ ...templateOptions, [key]: value });

  return (
    <div className="tpl-popover tpl-popover--with-typo" ref={ref}>
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

      <div className="tpl-typo-section">
        <div className="tpl-typo-section-title">Typo & couleurs</div>
        <div className="tpl-typo-presets">
          <button type="button" className="tpl-typo-preset-btn" onClick={() => applyTypoPreset('compact')} title="Texte plus compact">
            Compact
          </button>
          <button type="button" className="tpl-typo-preset-btn tpl-typo-preset-btn--default" onClick={() => applyTypoPreset('default')} title="Tailles par défaut">
            Défaut
          </button>
          <button type="button" className="tpl-typo-preset-btn" onClick={() => applyTypoPreset('readable')} title="Texte plus lisible">
            Lisible
          </button>
        </div>
        <button
          type="button"
          className="tpl-typo-toggle"
          onClick={() => setTypoOpen(!typoOpen)}
          aria-expanded={typoOpen}
        >
          {typoOpen ? 'Masquer le réglage fin' : 'Personnaliser par section'}
          <span className={`tpl-typo-chevron ${typoOpen ? 'tpl-typo-chevron--open' : ''}`}>▼</span>
        </button>
        {typoOpen && (
          <div className="tpl-typo-fields">
            {TYPO_FIELDS.map(({ key, label, min, max, step, unit = 'pt' }) => (
              <div key={key} className="tpl-typo-row">
                <label className="tpl-typo-label">{label}</label>
                <div className="tpl-typo-control">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={getTypoValue(key)}
                    onChange={e => setTypoValue(key, e.target.value)}
                    className="tpl-typo-range"
                  />
                  <span className="tpl-typo-value">{getTypoValue(key)} {unit}</span>
                </div>
              </div>
            ))}
            <div className="tpl-typo-row">
              <span className="tpl-typo-label">Couleur du texte (corps)</span>
              <label className="tpl-cinput-wrap tpl-typo-color-wrap">
                <input
                  type="color"
                  value={getColorValue('color_body')}
                  onChange={e => setColorValue('color_body', e.target.value)}
                  className="tpl-cinput"
                />
              </label>
            </div>
            <div className="tpl-typo-row">
              <span className="tpl-typo-label">Couleur des titres de section</span>
              <label className="tpl-cinput-wrap tpl-typo-color-wrap">
                <input
                  type="color"
                  value={getColorValue('color_section_title')}
                  onChange={e => setColorValue('color_section_title', e.target.value)}
                  className="tpl-cinput"
                />
              </label>
            </div>
          </div>
        )}
      </div>

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
      <div className="tpl-bar-right">
        <button
          className={`tpl-gear${showOptions ? ' tpl-gear--open' : ''}`}
          onClick={() => setShowOptions(!showOptions)}
          title="Personnaliser le template (couleurs, typo)"
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
