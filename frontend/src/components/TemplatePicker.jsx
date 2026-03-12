import { useState, useEffect, useRef } from 'react';
import { HiLockClosed } from 'react-icons/hi2';
import { apiGet } from '../api';

const PREVIEW_THUMBNAILS = {
  classic:   { bg: '#1e2a3a', sidebar: '#f4f4f2', accent: '#1e2a3a', layout: 'right-sidebar' },
  modern:    { bg: '#2d3748', sidebar: '#2d3748', accent: '#3182ce', layout: 'left-sidebar' },
  minimal:   { bg: '#ffffff', sidebar: null,      accent: '#111827', layout: 'single' },
  executive: { bg: '#0f172a', sidebar: '#f8f6f0', accent: '#b8860b', layout: 'right-sidebar' },
  elegant:   { bg: '#ffffff', sidebar: null,      accent: '#4a5568', layout: 'single-centered' },
  creative:  { bg: '#6366f1', sidebar: '#6366f1', accent: '#f59e0b', layout: 'left-sidebar' },
  bold:      { bg: '#1e293b', sidebar: '#f1f5f9', accent: '#dc2626', layout: 'right-sidebar' },
};

function MiniPreview({ templateId, isActive }) {
  const t = PREVIEW_THUMBNAILS[templateId] || PREVIEW_THUMBNAILS.classic;
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

function OptionsPopover({ options, templateOptions, onChangeOptions, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const COLOR_PRESETS = ['#1e2a3a', '#2d3748', '#3182ce', '#6366f1', '#059669', '#dc2626', '#7c3aed', '#111827', '#b8860b', '#f59e0b'];

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
    </div>
  );
}

export default function TemplatePicker({ templateId, templateOptions, onChangeTemplate, onChangeOptions, userPlan, onUpgradeClick }) {
  const [templates, setTemplates] = useState([]);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/api/templates')
      .then(data => { setTemplates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading && templates.length === 0) return null;

  const currentMeta = templates.find(t => t.id === templateId) || templates[0] || {};
  const options = currentMeta.options || [];

  const freeTemplates = templates.filter(t => !t.premium);
  const premiumTemplates = templates.filter(t => t.premium);

  const handleTemplateClick = (t) => {
    if (t.premium && userPlan !== 'pro') {
      if (onUpgradeClick) onUpgradeClick();
      return;
    }
    onChangeTemplate(t.id);
  };

  return (
    <div className="tpl-bar">
      <div className="tpl-bar-left">
        {freeTemplates.map(t => (
          <button
            key={t.id}
            className={`tpl-chip${templateId === t.id ? ' tpl-chip--active' : ''}`}
            onClick={() => handleTemplateClick(t)}
            title={t.description}
          >
            <MiniPreview templateId={t.id} isActive={templateId === t.id} />
            <span className="tpl-chip-label">{t.name}</span>
          </button>
        ))}
        {premiumTemplates.length > 0 && (
          <>
            <span className="tpl-separator" />
            {premiumTemplates.map(t => (
              <button
                key={t.id}
                className={`tpl-chip${templateId === t.id ? ' tpl-chip--active' : ''}${userPlan !== 'pro' ? ' tpl-chip--locked' : ''}`}
                onClick={() => handleTemplateClick(t)}
                title={t.description}
              >
                <MiniPreview templateId={t.id} isActive={templateId === t.id} />
                <span className="tpl-chip-label">{t.name}</span>
                {userPlan !== 'pro' && <HiLockClosed className="tpl-lock" size={12} aria-hidden />}
              </button>
            ))}
          </>
        )}
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
    </div>
  );
}
