import { useRef, useState } from 'react';
import {
  HiArrowUpTray,
  HiDocumentDuplicate,
  HiSquares2X2,
  HiSwatch,
  HiWrench,
} from 'react-icons/hi2';
import { createImageBlockPreset } from '../../lib/freeCanvasBlockPresets.js';
import { INSERT_TOOLBAR_ITEMS } from '../../lib/freeCanvasBlockPresets.js';
import { deleteLayoutProposal, listLayoutProposals } from '../../lib/layoutProposalsStorage.js';
import '../../styles/EditorCanvaSidebar.css';

const SECTIONS = [
  { id: 'models', label: 'Modèles', icon: HiDocumentDuplicate },
  { id: 'elements', label: 'Éléments', icon: HiSquares2X2 },
  { id: 'text', label: 'Texte', icon: HiSwatch },
  { id: 'import', label: 'Importer', icon: HiArrowUpTray },
  { id: 'tools', label: 'Outils', icon: HiWrench },
];

const TEXT_PRESETS = [
  { type: 'title', label: 'Titre de section' },
  { type: 'text', label: 'Paragraphe' },
];

const IMAGE_SHAPES = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'rounded', label: 'Arrondi' },
  { value: 'circle', label: 'Cercle' },
];

const OBJECT_FITS = [
  { value: 'cover', label: 'Remplir' },
  { value: 'contain', label: 'Contenir' },
];

const OBJECT_POSITIONS = [
  { value: 'center', label: 'Centre' },
  { value: 'top', label: 'Haut' },
  { value: 'bottom', label: 'Bas' },
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droite' },
];

/**
 * Sidebar Canva : rail vertical + panneau latéral au clic.
 */
export default function EditorCanvaSidebar({
  disabled = false,
  showGrid = false,
  snapEnabled = true,
  onShowGridChange,
  onSnapEnabledChange,
  onInsertBlock,
  onInsertImageBlock,
  onPickStarter,
  onPickBlank,
  onLoadProposal,
  onSaveProposal,
}) {
  const [openSection, setOpenSection] = useState('elements');
  const [proposalName, setProposalName] = useState('');
  const [proposals, setProposals] = useState(() => listLayoutProposals());
  const [imageShape, setImageShape] = useState('rect');
  const [objectFit, setObjectFit] = useState('cover');
  const [objectPosition, setObjectPosition] = useState('center');
  const fileInputRef = useRef(null);

  const refreshProposals = () => setProposals(listLayoutProposals());

  const handleSaveProposal = () => {
    if (!proposalName.trim() || typeof onSaveProposal !== 'function') return;
    onSaveProposal(proposalName.trim());
    setProposalName('');
    refreshProposals();
  };

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preset = createImageBlockPreset(reader.result, {
        shape: imageShape,
        object_fit: objectFit,
        object_position: objectPosition,
      });
      if (preset && typeof onInsertImageBlock === 'function') {
        onInsertImageBlock(preset);
      }
      e.target.value = '';
    };
    reader.readAsDataURL(file);
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
              <h3 className="editor-canva-drawer__title">Modèles</h3>
              <div className="editor-canva-drawer__actions">
                <button type="button" className="editor-canva-drawer__btn" disabled={disabled} onClick={onPickStarter}>
                  Blocs pré-placés
                </button>
                <button type="button" className="editor-canva-drawer__btn" disabled={disabled} onClick={onPickBlank}>
                  Page blanche
                </button>
              </div>
              <h4 className="editor-canva-drawer__subtitle">Propositions</h4>
              {proposals.map((p) => (
                <div key={p.id} className="editor-canva-drawer__proposal">
                  <strong>{p.name}</strong>
                  <div className="editor-canva-drawer__proposal-actions">
                    <button type="button" disabled={disabled} onClick={() => onLoadProposal?.(p.layout)}>Appliquer</button>
                    <button type="button" onClick={() => { deleteLayoutProposal(p.id); refreshProposals(); }}>×</button>
                  </div>
                </div>
              ))}
              <input
                type="text"
                className="editor-canva-drawer__input"
                placeholder="Nom de la proposition"
                value={proposalName}
                onChange={(ev) => setProposalName(ev.target.value)}
              />
              <button
                type="button"
                className="editor-canva-drawer__btn"
                disabled={disabled || !proposalName.trim()}
                onClick={handleSaveProposal}
              >
                Enregistrer ce layout
              </button>
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
          {openSection === 'import' && (
            <>
              <h3 className="editor-canva-drawer__title">Image</h3>
              <p className="editor-canva-drawer__hint">Importez une image et choisissez son cadrage dans le bloc.</p>
              <label className="editor-canva-drawer__field">
                Forme
                <select value={imageShape} onChange={(ev) => setImageShape(ev.target.value)}>
                  {IMAGE_SHAPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="editor-canva-drawer__field">
                Remplissage
                <select value={objectFit} onChange={(ev) => setObjectFit(ev.target.value)}>
                  {OBJECT_FITS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="editor-canva-drawer__field">
                Centrage
                <select value={objectPosition} onChange={(ev) => setObjectPosition(ev.target.value)}>
                  {OBJECT_POSITIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--primary"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
              >
                Choisir une image…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageFile}
              />
            </>
          )}
          {openSection === 'tools' && (
            <>
              <h3 className="editor-canva-drawer__title">Outils</h3>
              <label className="editor-canva-drawer__toggle">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => onShowGridChange?.(e.target.checked)}
                />
                Afficher la grille
              </label>
              <label className="editor-canva-drawer__toggle">
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(e) => onSnapEnabledChange?.(e.target.checked)}
                />
                Magnétisme (snap)
              </label>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
