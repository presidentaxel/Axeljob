import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

/** Même grille que le template classique / Supabase sans colonne options (repli frontend). */
const LAYOUT_OPTIONS_FALLBACK = [
  { key: 'header_color', type: 'color', default: '#1e2a3a', label: 'Couleur en-tête' },
  { key: 'sidebar_color', type: 'color', default: '#f4f4f2', label: 'Couleur sidebar' },
  { key: 'accent_color', type: 'color', default: '#1e2a3a', label: 'Couleur accent' },
  { key: 'font', type: 'select', choices: ['Plus Jakarta Sans', 'Inter', 'Georgia'], default: 'Plus Jakarta Sans', label: 'Police titres' },
  { key: 'show_photo', type: 'boolean', default: true, label: 'Afficher la photo' },
  { key: 'show_mots_cles_ats', type: 'boolean', default: true, label: 'Mots-clés ATS' },
];

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

const TYPO_FIELD_BY_KEY = Object.fromEntries(TYPO_FIELDS.map((f) => [f.key, f]));

const TYPO_GROUPS = [
  { id: 'header', title: 'En-tête & photo', keys: ['font_size_name', 'font_size_title', 'photo_size'] },
  { id: 'main', title: 'Zone principale', keys: ['font_size_section', 'font_size_body', 'font_size_bullet'] },
  { id: 'sidebar', title: 'Colonne latérale', keys: ['font_size_sidebar_title', 'font_size_sidebar_item'] },
];

/** Libellés plus parlants pour les couleurs (clés classiques des templates). */
const LAYOUT_COLOR_COPY = {
  header_color: { title: 'Bandeau du haut', hint: 'Fond derrière ton nom et ton titre' },
  sidebar_color: { title: 'Colonne latérale', hint: 'Fond compétences, langues, etc.' },
  accent_color: { title: 'Couleur d’accent', hint: 'Titres, repères visuels' },
};

const TOGGLE_COPY = {
  show_photo: { title: 'Photo sur le CV', hint: 'Masque complètement la photo si tu préfères' },
  show_mots_cles_ats: { title: 'Bloc mots-clés ATS', hint: 'Section dédiée aux mots-clés pour les logiciels de tri' },
};

const FONT_HINT = 'S’applique aux titres et à l’en-tête.';

function getDefaultOptions(options) {
  const defaults = { ...TYPO_DEFAULTS };
  (options || []).forEach((opt) => {
    if (opt.key !== undefined) defaults[opt.key] = opt.default;
  });
  defaults.show_photo = true;
  defaults.show_mots_cles_ats = true;
  return defaults;
}

const COLOR_PRESETS = ['#1e2a3a', '#2d3748', '#3182ce', '#6366f1', '#059669', '#dc2626', '#7c3aed', '#111827', '#b8860b', '#f59e0b'];

function resizeOptionsPreviewIframe(iframe) {
  try {
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return;
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.documentElement.offsetHeight,
      doc.body?.scrollHeight ?? 0,
      doc.body?.offsetHeight ?? 0
    );
    if (height > 0) iframe.style.height = `${height}px`;
  } catch (_) { /* not ready */ }
}

/** Préréglages + zone explicite « couleur au choix » (sélecteur natif). */
function LayoutColorControl({ optionKey, optionDefault, templateOptions, onChangeOptions, headingTitle, headingHint }) {
  const current = (templateOptions?.[optionKey] || optionDefault || '#000000').toLowerCase();
  const normalizedPresets = COLOR_PRESETS.map((c) => c.toLowerCase());
  const isPreset = normalizedPresets.includes(current);

  return (
    <div className="tpl-colors-block">
      {(headingTitle || headingHint) && (
        <div className="tpl-colors-heading">
          {headingTitle && <span className="tpl-colors-heading-title">{headingTitle}</span>}
          {headingHint && <span className="tpl-colors-heading-hint">{headingHint}</span>}
        </div>
      )}
      <div className="tpl-colors-custom">
        <label className={`tpl-colors-custom-field${isPreset ? '' : ' tpl-colors-custom-field--active'}`}>
          <span className="tpl-colors-custom-swatch" style={{ background: current }} aria-hidden />
          <span className="tpl-colors-custom-hex">{current}</span>
          <input
            type="color"
            value={current}
            onChange={(e) => onChangeOptions({ ...templateOptions, [optionKey]: e.target.value })}
            className="tpl-colors-custom-input"
            aria-labelledby={`tpl-custom-color-${optionKey}`}
          />
        </label>
      </div>
    </div>
  );
}

function TypoColorRow({ colorKey, title, hint, getColorValue, setColorValue }) {
  const current = (getColorValue(colorKey) || '#1a1a1a').toLowerCase();

  return (
    <div className="tpl-typo-color-card">
      <div className="tpl-typo-color-card-text">
        <span className="tpl-typo-color-card-title">{title}</span>
        {hint && <span className="tpl-typo-color-card-hint">{hint}</span>}
      </div>
      <label className="tpl-colors-custom-field tpl-colors-custom-field--active tpl-colors-custom-field--compact">
        <span className="tpl-colors-custom-swatch" style={{ background: current }} aria-hidden />
        <span className="tpl-colors-custom-hex">{current}</span>
        <input
          type="color"
          value={current}
          onChange={(e) => setColorValue(colorKey, e.target.value)}
          className="tpl-colors-custom-input"
          aria-label={title}
        />
      </label>
    </div>
  );
}

function SettingToggleRow({ title, hint, on, onToggle }) {
  return (
    <div className="tpl-toggle-row">
      <div className="tpl-toggle-row-text">
        <span className="tpl-toggle-row-title">{title}</span>
        {hint && <span className="tpl-toggle-row-hint">{hint}</span>}
      </div>
      <button
        type="button"
        className={`tpl-toggle${on ? ' tpl-toggle--on' : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
      >
        <span className="tpl-toggle-knob" />
      </button>
    </div>
  );
}

function TypoSliderRow({ field, getTypoValue, setTypoValue }) {
  const { key, label, min, max, step, unit = 'pt' } = field;
  return (
    <div className="tpl-slider-row">
      <div className="tpl-slider-row-top">
        <label className="tpl-slider-row-label" htmlFor={`tpl-slider-${key}`}>{label}</label>
        <span className="tpl-slider-row-value">{getTypoValue(key)} {unit}</span>
      </div>
      <input
        id={`tpl-slider-${key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={getTypoValue(key)}
        onChange={(e) => setTypoValue(key, e.target.value)}
        className="tpl-slider-row-input"
      />
    </div>
  );
}

function OptionsPanel({ options, templateOptions, onChangeOptions }) {
  const defaultOptions = getDefaultOptions(options);
  const colorOpts = options.filter((o) => o.type === 'color');
  const selectOpts = options.filter((o) => o.type === 'select');
  const boolOpts = options.filter((o) => o.type === 'boolean');
  const otherOpts = options.filter((o) => !['color', 'select', 'boolean'].includes(o.type));

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
    <div className="tpl-options-panel">
      {colorOpts.length > 0 && (
        <section className="tpl-settings-card" aria-labelledby="tpl-card-colors">
          <div className="tpl-settings-divider-stack">
            {colorOpts.map((opt) => {
              const copy = LAYOUT_COLOR_COPY[opt.key] || { title: opt.label, hint: null };
              return (
                <div key={opt.key} className="tpl-settings-field">
                  <LayoutColorControl
                    headingTitle={copy.title}
                    headingHint={copy.hint}
                    optionKey={opt.key}
                    optionDefault={opt.default}
                    templateOptions={templateOptions}
                    onChangeOptions={onChangeOptions}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="tpl-settings-card" aria-labelledby="tpl-card-text">

        {selectOpts.map((opt) => (
          <div key={opt.key} className="tpl-settings-field tpl-settings-field--select">
            <span className="tpl-settings-field-label">{opt.label}</span>
            {opt.key === 'font' && (
              <span className="tpl-settings-field-hint">{FONT_HINT}</span>
            )}
            <select
              className="tpl-sel tpl-sel--comfortable"
              value={templateOptions?.[opt.key] || opt.default}
              onChange={(e) => onChangeOptions({ ...templateOptions, [opt.key]: e.target.value })}
            >
              {(opt.choices || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="tpl-density-block">
          <span className="tpl-density-block-label">Densité du contenu</span>
          <p className="tpl-density-block-hint">Trois profils pour ajuster toutes les tailles d’un coup.</p>
          <div className="tpl-density-grid">
            <button type="button" className="tpl-density-tile" onClick={() => applyTypoPreset('compact')}>
              <span className="tpl-density-tile-title">Compact</span>
              <span className="tpl-density-tile-sub">Plus de texte sur la page</span>
            </button>
            <button type="button" className="tpl-density-tile tpl-density-tile--accent" onClick={() => applyTypoPreset('default')}>
              <span className="tpl-density-tile-title">Équilibré</span>
              <span className="tpl-density-tile-sub">Réglages par défaut</span>
            </button>
            <button type="button" className="tpl-density-tile" onClick={() => applyTypoPreset('readable')}>
              <span className="tpl-density-tile-title">Confort</span>
              <span className="tpl-density-tile-sub">Plus grand, plus aéré</span>
            </button>
          </div>
        </div>

        <details className="tpl-settings-details">
          <summary className="tpl-settings-details-summary">
            <span className="tpl-settings-details-chevron" aria-hidden>▸</span>
            <span className="tpl-settings-details-text">
              <span className="tpl-settings-details-title">Tailles précises par zone</span>
              <span className="tpl-settings-details-sub">Nom, listes, colonne latérale, couleurs du texte…</span>
            </span>
          </summary>
          <div className="tpl-settings-details-panel">
            {TYPO_GROUPS.map((group) => (
              <div key={group.id} className="tpl-typo-group">
                <h4 className="tpl-typo-group-title">{group.title}</h4>
                {group.keys.map((key) => {
                  const field = TYPO_FIELD_BY_KEY[key];
                  if (!field) return null;
                  return (
                    <TypoSliderRow
                      key={key}
                      field={field}
                      getTypoValue={getTypoValue}
                      setTypoValue={setTypoValue}
                    />
                  );
                })}
              </div>
            ))}
            <div className="tpl-typo-group">
              <h4 className="tpl-typo-group-title">Couleurs du texte</h4>
              <TypoColorRow
                colorKey="color_body"
                title="Corps du CV"
                hint="Paragraphes, expériences, listes"
                getColorValue={getColorValue}
                setColorValue={setColorValue}
              />
              <TypoColorRow
                colorKey="color_section_title"
                title="Titres de section"
                hint="« Expérience », « Formation », etc."
                getColorValue={getColorValue}
                setColorValue={setColorValue}
              />
            </div>
          </div>
        </details>
      </section>

      {boolOpts.length > 0 && (
        <section className="tpl-settings-card" aria-labelledby="tpl-card-visible">
          <h3 id="tpl-card-visible" className="tpl-settings-card-title">Affichage sur le CV</h3>
          <p className="tpl-settings-card-lead">Active ou masque des blocs entiers.</p>
          <div className="tpl-toggle-stack">
            {boolOpts.map((opt) => {
              const copy = TOGGLE_COPY[opt.key] || { title: opt.label, hint: null };
              const on = templateOptions?.[opt.key] ?? opt.default;
              return (
                <SettingToggleRow
                  key={opt.key}
                  title={copy.title}
                  hint={copy.hint}
                  on={on}
                  onToggle={() => onChangeOptions({ ...templateOptions, [opt.key]: !on })}
                />
              );
            })}
          </div>
        </section>
      )}

      {otherOpts.map((opt) => (
        <section key={opt.key} className="tpl-settings-card">
          <h3 className="tpl-settings-card-title">{opt.label}</h3>
          <p className="tpl-settings-card-lead">Option du template.</p>
        </section>
      ))}

      <div className="tpl-options-panel-reset">
        <button type="button" className="tpl-popover-reset-btn tpl-popover-reset-btn--wide" onClick={handleReset}>
          Tout remettre comme au départ
        </button>
      </div>
    </div>
  );
}

function TemplateOptionsModal({
  open,
  onClose,
  options,
  templateOptions,
  onChangeOptions,
  previewHtml,
  previewLoading,
}) {
  const previewIframeRef = useRef(null);
  const previewScrollRef = useRef(null);
  const [previewFit, setPreviewFit] = useState({ scale: 1, w: 794, h: 600 });

  const measurePreviewFit = useCallback(() => {
    const scrollEl = previewScrollRef.current;
    const iframe = previewIframeRef.current;
    if (!scrollEl || !iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) return;
      let w = Math.max(
        doc.documentElement.scrollWidth || 0,
        doc.body?.scrollWidth || 0,
        794
      );
      iframe.style.width = `${w}px`;
      iframe.style.maxWidth = 'none';
      resizeOptionsPreviewIframe(iframe);
      const h = Math.max(
        iframe.offsetHeight || 0,
        parseFloat(iframe.style.height) || 0,
        400
      );
      const pad = 16;
      const avail = Math.max(120, scrollEl.clientWidth - pad);
      const scale = w > 0 ? Math.min(1, avail / w) : 1;
      setPreviewFit({ scale, w, h });
    } catch (_) {
      /* cross-origin / not ready */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !previewHtml) return;
    const el = previewScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => measurePreviewFit());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, previewHtml, measurePreviewFit]);

  useEffect(() => {
    if (!open || !previewHtml) return;
    const t = requestAnimationFrame(() => measurePreviewFit());
    return () => cancelAnimationFrame(t);
  }, [open, previewHtml, templateOptions, measurePreviewFit]);

  if (!open) return null;

  const { scale, w, h } = previewFit;

  return createPortal(
    <div
      className="tpl-options-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpl-options-modal-title"
      onClick={onClose}
    >
      <div
        className="tpl-options-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tpl-options-modal-header">
          <h2 id="tpl-options-modal-title" className="tpl-options-modal-title">Personnaliser le CV</h2>
          <p className="tpl-options-modal-sub">Les changements s’appliquent tout de suite à l’aperçu ; rien à valider.</p>
          <button type="button" className="tpl-options-modal-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <div className="tpl-options-modal-body">
          <aside className="tpl-options-modal-settings">
            <OptionsPanel options={options} templateOptions={templateOptions} onChangeOptions={onChangeOptions} />
          </aside>
          <div className="tpl-options-modal-preview">
            <div className="tpl-options-modal-preview-bar">
              <span className="tpl-options-modal-preview-title">Aperçu</span>
              <span className="tpl-options-modal-preview-hint">La page est réduite automatiquement pour montrer toute la largeur du CV.</span>
            </div>
            <div ref={previewScrollRef} className="tpl-options-modal-preview-scroll">
              {previewLoading && (
                <div className="tpl-options-modal-preview-loading">Génération de l’aperçu…</div>
              )}
              {!previewLoading && !previewHtml && (
                <div className="tpl-options-modal-preview-empty">
                  Aucun aperçu pour l’instant (complète ton profil ou charge un CV sur l’onglet principal).
                </div>
              )}
              {!previewLoading && previewHtml && (
                <div
                  className="tpl-preview-scaled-clip"
                  style={{
                    width: w * scale,
                    height: h * scale,
                  }}
                >
                  <div
                    className="tpl-preview-scaled-inner"
                    style={{
                      width: w,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <iframe
                      ref={previewIframeRef}
                      title="Aperçu du CV - personnalisation"
                      srcDoc={previewHtml}
                      className="tpl-options-modal-iframe"
                      onLoad={(e) => {
                        resizeOptionsPreviewIframe(e.target);
                        requestAnimationFrame(() => measurePreviewFit());
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
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

export default function TemplatePicker({
  templates: templatesProp,
  templateId,
  templateOptions,
  onChangeTemplate,
  onChangeOptions,
  userPlan,
  onUpgradeClick,
  openOptionsFromSupport,
  openModalToTab,
  onOpenFromUrlConsumed,
  optionsPreviewHtml = '',
  optionsPreviewLoading = false,
}) {
  const [templatesLocal, setTemplatesLocal] = useState([]);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(loadFavorites);
  const useProp = templatesProp !== undefined;
  const templates = useProp && Array.isArray(templatesProp) ? templatesProp : templatesLocal;
  const loading = useProp ? templates.length === 0 : templatesLocal.length === 0;
  const currentMeta = templates.find(t => t.id === templateId) || templates[0] || {};
  const rawLayoutOptions = currentMeta.options || [];
  const isCustomTemplate = (templateId || '').startsWith('custom_');
  const options = (isCustomTemplate && rawLayoutOptions.length === 0) ? LAYOUT_OPTIONS_FALLBACK : rawLayoutOptions;

  useEffect(() => {
    if (useProp) return;
    apiGet('/api/templates')
      .then(data => setTemplatesLocal(Array.isArray(data) ? data : []))
      .catch(() => setTemplatesLocal([]));
  }, [useProp]);

  useEffect(() => {
    if (openOptionsFromSupport) setOptionsModalOpen(true);
  }, [openOptionsFromSupport]);

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
          type="button"
          className={`tpl-gear${optionsModalOpen ? ' tpl-gear--open' : ''}`}
          onClick={() => setOptionsModalOpen(true)}
          title="Personnaliser le template (couleurs, typo)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <TemplateOptionsModal
          open={optionsModalOpen}
          onClose={() => setOptionsModalOpen(false)}
          options={options}
          templateOptions={templateOptions}
          onChangeOptions={onChangeOptions}
          previewHtml={optionsPreviewHtml}
          previewLoading={optionsPreviewLoading}
        />
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
