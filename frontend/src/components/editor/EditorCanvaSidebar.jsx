import { useRef, useState } from 'react';
import {
  HiArrowUpTray,
  HiDocumentDuplicate,
  HiSparkles,
  HiSquares2X2,
  HiSwatch,
  HiWrench,
} from 'react-icons/hi2';
import { compressImageFile } from '../../lib/compressImageForCanvas.js';
import { CANVAS_ICON_ENTRIES, createIconBlockPreset } from '../../lib/canvasIconLibrary.js';
import { createImageBlockPreset } from '../../lib/freeCanvasBlockPresets.js';
import { INSERT_TOOLBAR_ITEMS } from '../../lib/freeCanvasBlockPresets.js';
import { deleteLayoutProposal, listLayoutProposals } from '../../lib/layoutProposalsStorage.js';
import CanvasIconGlyph from './CanvasIconGlyph.jsx';
import '../../styles/EditorCanvaSidebar.css';

const SECTIONS = [
  { id: 'models', label: 'Modèles', icon: HiDocumentDuplicate },
  { id: 'elements', label: 'Éléments', icon: HiSquares2X2 },
  { id: 'text', label: 'Texte', icon: HiSwatch },
  { id: 'icons', label: 'Icônes', icon: HiSparkles },
  { id: 'import', label: 'Importer', icon: HiArrowUpTray },
  { id: 'tools', label: 'Outils', icon: HiWrench },
];

const TEXT_PRESETS = [
  { type: 'title', label: 'Titre de section' },
  { type: 'text', label: 'Paragraphe' },
];

const TEMPLATE_THUMB_STYLES = {
  modern: 'linear-gradient(135deg, #2d3748 0%, #3182ce 100%)',
  minimal: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)',
  classic: 'linear-gradient(135deg, #1e3a5f 0%, #64748b 100%)',
  executive: 'linear-gradient(135deg, #0f172a 0%, #475569 100%)',
  creative: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
  bold: 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)',
  elegant: 'linear-gradient(135deg, #292524 0%, #a8a29e 100%)',
};

const IMAGE_SHAPES = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'rounded', label: 'Arrondi' },
  { value: 'circle', label: 'Cercle' },
];

export default function EditorCanvaSidebar({
  disabled = false,
  templatesList = [],
  showGrid = false,
  snapEnabled = true,
  onShowGridChange,
  onSnapEnabledChange,
  onInsertBlock,
  onInsertImageBlock,
  onInsertIconBlock,
  onPickBlank,
  onApplyTemplateTheme,
  onLoadProposal,
  onSaveProposal,
}) {
  const [openSection, setOpenSection] = useState('elements');
  const [proposalName, setProposalName] = useState('');
  const [proposals, setProposals] = useState(() => listLayoutProposals());
  const [imageShape, setImageShape] = useState('rect');
  const [iconColor, setIconColor] = useState('#1e293b');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const refreshProposals = () => setProposals(listLayoutProposals());

  const handleSaveProposal = () => {
    if (typeof onSaveProposal !== 'function') return;
    onSaveProposal(proposalName.trim() || 'mon modèle');
    setProposalName('');
    refreshProposals();
  };

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const dataUrl = await compressImageFile(file);
      const preset = createImageBlockPreset(dataUrl, { shape: imageShape });
      if (preset) onInsertImageBlock?.(preset);
    } catch (err) {
      console.error('[canvas] import image', err);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const toggleSection = (id) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  return (
    <aside className="editor-canva-shell" aria-label="Outils canvas">
      <nav className="editor-canva-rail" role="tablist">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = openSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'editor-canva-rail__btn editor-canva-rail__btn--active' : 'editor-canva-rail__btn'}
              title={section.label}
              onClick={() => toggleSection(section.id)}
            >
              {Icon ? <Icon size={22} aria-hidden /> : null}
              <span className="editor-canva-rail__label">{section.label}</span>
            </button>
          );
        })}
      </nav>
      {openSection && (
        <div className="editor-canva-drawer" role="tabpanel">
          {openSection === 'models' && (
            <>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--primary editor-canva-drawer__btn--full"
                disabled={disabled}
                onClick={onPickBlank}
              >
                Page blanche
              </button>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--full"
                disabled={disabled}
                onClick={handleSaveProposal}
              >
                Enregistrer les modifs
              </button>
              <input
                type="text"
                className="editor-canva-drawer__input"
                placeholder="Nom (défaut : mon modèle)"
                value={proposalName}
                onChange={(ev) => setProposalName(ev.target.value)}
              />
              <p className="editor-canva-drawer__hint">
                L’enregistrement crée une copie locale : le modèle HTML chargé dans l’app n’est pas modifié.
              </p>
              <h4 className="editor-canva-drawer__subtitle">Modèles CV</h4>
              <div className="editor-canva-template-grid">
                {(templatesList || []).map((t) => {
                  if (!t?.id) return null;
                  const bg = TEMPLATE_THUMB_STYLES[t.id] || 'linear-gradient(135deg, #e2e8f0, #94a3b8)';
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="editor-canva-template-card"
                      disabled={disabled}
                      title={t.description || t.name}
                      onClick={() => onApplyTemplateTheme?.(t)}
                    >
                      <span className="editor-canva-template-card__thumb" style={{ background: bg }} />
                      <span className="editor-canva-template-card__name">{t.name || t.id}</span>
                    </button>
                  );
                })}
              </div>
              {proposals.length > 0 && (
                <>
                  <h4 className="editor-canva-drawer__subtitle">Mes propositions</h4>
                  {proposals.map((p) => (
                    <div key={p.id} className="editor-canva-drawer__proposal">
                      <strong>{p.name}</strong>
                      <div className="editor-canva-drawer__proposal-actions">
                        <button type="button" disabled={disabled} onClick={() => onLoadProposal?.(p.layout)}>Appliquer</button>
                        <button type="button" onClick={() => { deleteLayoutProposal(p.id); refreshProposals(); }}>×</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {openSection === 'elements' && (
            <>
              <h3 className="editor-canva-drawer__title">Éléments</h3>
              <div className="editor-canva-drawer__grid">
                {INSERT_TOOLBAR_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="editor-canva-drawer__tile"
                    disabled={disabled}
                    title={item.description}
                    onClick={() => onInsertBlock?.(item.type)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {openSection === 'text' && (
            <>
              <h3 className="editor-canva-drawer__title">Texte</h3>
              <div className="editor-canva-drawer__grid">
                {TEXT_PRESETS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="editor-canva-drawer__tile"
                    disabled={disabled}
                    onClick={() => onInsertBlock?.(item.type)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {openSection === 'icons' && (
            <>
              <h3 className="editor-canva-drawer__title">Icônes</h3>
              <label className="editor-canva-drawer__field editor-canva-drawer__field--row">
                Couleur
                <input type="color" value={iconColor} onChange={(e) => setIconColor(e.target.value)} />
              </label>
              <div className="editor-canva-icon-grid">
                {CANVAS_ICON_ENTRIES.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    className="editor-canva-icon-tile"
                    disabled={disabled}
                    title={entry.label}
                    onClick={() => {
                      const preset = createIconBlockPreset(entry.name, iconColor);
                      onInsertIconBlock?.(preset);
                    }}
                  >
                    <CanvasIconGlyph name={entry.name} color={iconColor} size={22} />
                  </button>
                ))}
              </div>
            </>
          )}
          {openSection === 'import' && (
            <>
              <h3 className="editor-canva-drawer__title">Image</h3>
              <label className="editor-canva-drawer__field">
                Forme du cadre
                <select value={imageShape} onChange={(e) => setImageShape(e.target.value)}>
                  {IMAGE_SHAPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--primary editor-canva-drawer__btn--full"
                disabled={disabled || importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? 'Compression…' : 'Choisir une image…'}
              </button>
              <p className="editor-canva-drawer__hint">
                L’image est compressée automatiquement. Double-cliquez sur le bloc pour recadrer.
              </p>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
            </>
          )}
          {openSection === 'tools' && (
            <>
              <h3 className="editor-canva-drawer__title">Outils</h3>
              <label className="editor-canva-drawer__toggle">
                <input type="checkbox" checked={showGrid} onChange={(e) => onShowGridChange?.(e.target.checked)} />
                Afficher la grille
              </label>
              <label className="editor-canva-drawer__toggle">
                <input type="checkbox" checked={snapEnabled} onChange={(e) => onSnapEnabledChange?.(e.target.checked)} />
                Magnétisme (snap)
              </label>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
