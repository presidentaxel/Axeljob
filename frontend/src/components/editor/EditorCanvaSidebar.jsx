import { useEffect, useRef, useState } from 'react';
import {
  HiArrowUpTray,
  HiArrowsPointingOut,
  HiDocumentDuplicate,
  HiSparkles,
  HiSquares2X2,
  HiSwatch,
  HiTrash,
  HiWrench,
} from 'react-icons/hi2';
import { compressImageFile } from '../../lib/compressImageForCanvas.js';
import {
  addUserCanvasImage,
  CANVAS_IMAGE_DROP_MIME,
  listUserCanvasImages,
  removeUserCanvasImage,
  syncUserCanvasImagesFromLayout,
} from '../../lib/canvasImageLibrary.js';
import { CANVAS_ICON_ENTRIES, createIconBlockPreset } from '../../lib/canvasIconLibrary.js';
import { ELEMENT_SHAPE_ITEMS, createShapeBlockPreset } from '../../lib/canvasShapePresets.js';
import { TEXT_PRESET_ITEMS, createTextBlockPreset } from '../../lib/canvasTextPresets.js';
import {
  createImageBlockPreset,
} from '../../lib/freeCanvasBlockPresets.js';
import CanvasShapeSvg from './CanvasShapeSvg.jsx';
import {
  EditorCanvaColorPanel,
  EditorCanvaEffectsPanel,
  EditorCanvaFontPanel,
  EditorCanvaShapePanel,
} from './EditorCanvaStylePanels.jsx';
import { deleteLayoutProposal, listLayoutProposals } from '../../lib/layoutProposalsStorage.js';
import CanvasIconGlyph from './CanvasIconGlyph.jsx';
import EditorCanvaPositionDrawer from './EditorCanvaPositionDrawer.jsx';
import TemplateMiniPreview from './TemplateMiniPreview.jsx';
import '../../styles/EditorCanvaSidebar.css';

const SECTIONS = [
  { id: 'models', label: 'Modèles', icon: HiDocumentDuplicate },
  { id: 'elements', label: 'Éléments', icon: HiSquares2X2 },
  { id: 'text', label: 'Texte', icon: HiSwatch },
  { id: 'icons', label: 'Icônes', icon: HiSparkles },
  { id: 'import', label: 'Image', icon: HiArrowUpTray },
  { id: 'position', label: 'Position', icon: HiArrowsPointingOut },
  { id: 'tools', label: 'Outils', icon: HiWrench },
];

const TEXT_PRESETS = TEXT_PRESET_ITEMS;

const STYLE_PANEL_SECTIONS = new Set(['fonts', 'colors', 'effects', 'shape-style']);

function ImageHistoryTile({ entry, disabled, onBeginPlacement, onRemove }) {
  const preset = createImageBlockPreset(entry.dataUrl);
  const onPointerDown = (e) => {
    if (disabled || !preset) return;
    e.preventDefault();
    onBeginPlacement?.(preset);
  };
  const onDragStart = (e) => {
    if (disabled || !entry.dataUrl) return;
    e.dataTransfer.setData(CANVAS_IMAGE_DROP_MIME, entry.dataUrl);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className="editor-canva-image-history__item">
      <button
        type="button"
        className="editor-canva-image-history__thumb"
        disabled={disabled}
        draggable={!disabled}
        title={entry.label || 'Glisser sur le canevas ou cliquer pour placer'}
        onPointerDown={onPointerDown}
        onClick={(e) => e.preventDefault()}
        onDragStart={onDragStart}
      >
        <img src={entry.dataUrl} alt="" draggable={false} />
      </button>
      <button
        type="button"
        className="editor-canva-image-history__remove"
        disabled={disabled}
        title="Retirer de l’historique"
        aria-label="Retirer de l’historique"
        onClick={() => onRemove?.(entry.id)}
      >
        <HiTrash size={14} aria-hidden />
      </button>
    </div>
  );
}

function PlacementTile({ disabled, preset, onBeginPlacement, className, title, children }) {
  const onPointerDown = (e) => {
    if (disabled || !preset) return;
    e.preventDefault();
    onBeginPlacement?.(preset);
  };
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      onPointerDown={onPointerDown}
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function EditorCanvaSidebar({
  disabled = false,
  openSection = 'elements',
  onOpenSectionChange,
  placementActive = false,
  templatesList = [],
  canvasDrafts = [],
  activeCanvasDraftKey = null,
  layout = null,
  fontFamilies = null,
  selectedBlockId = null,
  selectedBlock = null,
  onBlockStylePatch,
  showGrid = false,
  snapEnabled = true,
  onShowGridChange,
  onSnapEnabledChange,
  onBeginPlacement,
  onSelectBlock,
  onBlockPatch,
  onBlockBringToFront,
  onBlockSendToBack,
  onBlockZStep,
  onReorderLayers,
  onPickBlank,
  onApplyCanvasTemplate,
  onLoadProposal,
  onSaveProposal,
  onOpenTransferFromDraft,
}) {
  const [proposalName, setProposalName] = useState('');
  const [proposals, setProposals] = useState(() => listLayoutProposals());
  const [imageHistory, setImageHistory] = useState(() => listUserCanvasImages());
  const [iconColor, setIconColor] = useState('#1e293b');
  const [importing, setImporting] = useState(false);
  const [transferSourceKey, setTransferSourceKey] = useState('');
  const fileInputRef = useRef(null);

  const refreshProposals = () => setProposals(listLayoutProposals());
  const refreshImageHistory = () => setImageHistory(listUserCanvasImages());
  const transferDraftOptions = (canvasDrafts || []).filter(
    (draft) => draft?.contextKey && draft.contextKey !== activeCanvasDraftKey,
  );

  useEffect(() => {
    if (openSection !== 'import') return;
    syncUserCanvasImagesFromLayout(layout);
    refreshImageHistory();
  }, [openSection, layout]);

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
      addUserCanvasImage(dataUrl, { label: file.name || '' });
      refreshImageHistory();
      const preset = createImageBlockPreset(dataUrl);
      if (preset) onBeginPlacement?.(preset);
    } catch (err) {
      console.error('[canvas] import image', err);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const toggleSection = (id) => {
    onOpenSectionChange?.(openSection === id ? null : id);
  };

  return (
    <aside className={`editor-canva-shell${placementActive ? ' editor-canva-shell--placing' : ''}`} aria-label="Outils canvas">
      {placementActive && (
        <p className="editor-canva-shell__place-hint" role="status">
          Cliquez sur le canevas pour placer l’élément · Échap pour annuler
        </p>
      )}
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
        <div
          className={[
            'editor-canva-drawer',
            openSection === 'text' || openSection === 'fonts' ? 'editor-canva-drawer--fill' : '',
          ].filter(Boolean).join(' ')}
          role="tabpanel"
        >
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
                placeholder="Nom"
                value={proposalName}
                onChange={(ev) => setProposalName(ev.target.value)}
              />
              <h4 className="editor-canva-drawer__subtitle">Modèles CV</h4>
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Le CV affiché est enregistré sur ton compte. Chaque autre modèle
                garde un brouillon local sur ce navigateur (non synchronisé entre
                appareils).
              </p>
              <div className="editor-canva-template-grid">
                {(templatesList || []).map((t) => {
                  if (!t?.id) return null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="editor-canva-template-card"
                      disabled={disabled}
                      title={t.description || t.name}
                      onClick={() => onApplyCanvasTemplate?.(t)}
                    >
                      <span className="editor-canva-template-card__thumb">
                        <TemplateMiniPreview templateId={t.id} />
                      </span>
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
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Formes vectorielles - cliquez puis placez sur le canevas.
              </p>
              <div className="editor-canva-drawer__shape-grid">
                {ELEMENT_SHAPE_ITEMS.map((item) => {
                  const preset = createShapeBlockPreset(item.type);
                  return (
                    <PlacementTile
                      key={item.type}
                      disabled={disabled}
                      preset={preset}
                      onBeginPlacement={onBeginPlacement}
                      className="editor-canva-drawer__shape-tile"
                      title={item.label}
                    >
                      <span className="editor-canva-drawer__shape-preview">
                        <CanvasShapeSvg type={item.type} style={preset?.style} preview />
                      </span>
                      <span className="editor-canva-drawer__shape-label">{item.label}</span>
                    </PlacementTile>
                  );
                })}
              </div>
            </>
          )}
          {openSection === 'text' && (
            <>
              <h3 className="editor-canva-drawer__title">Texte</h3>
              <div className="editor-canva-drawer__grid">
                {TEXT_PRESETS.map((item) => {
                  const preset = createTextBlockPreset(item.type);
                  return (
                    <PlacementTile
                      key={item.type}
                      disabled={disabled}
                      preset={preset}
                      onBeginPlacement={onBeginPlacement}
                      className="editor-canva-drawer__tile"
                    >
                      {item.label}
                    </PlacementTile>
                  );
                })}
              </div>
              {selectedBlock && onBlockStylePatch && (
                <>
                  <h4 className="editor-canva-drawer__subtitle">Police</h4>
                  <EditorCanvaFontPanel block={selectedBlock} onBlockStylePatch={onBlockStylePatch} fontFamilies={fontFamilies} />
                </>
              )}
            </>
          )}
          {openSection === 'fonts' && selectedBlock && (
            <EditorCanvaFontPanel block={selectedBlock} onBlockStylePatch={onBlockStylePatch} fontFamilies={fontFamilies} />
          )}
          {openSection === 'colors' && selectedBlock && (
            <EditorCanvaColorPanel block={selectedBlock} onBlockStylePatch={onBlockStylePatch} />
          )}
          {openSection === 'effects' && selectedBlock && (
            <EditorCanvaEffectsPanel block={selectedBlock} onBlockStylePatch={onBlockStylePatch} />
          )}
          {openSection === 'shape-style' && selectedBlock && (
            <EditorCanvaShapePanel block={selectedBlock} onBlockStylePatch={onBlockStylePatch} />
          )}
          {STYLE_PANEL_SECTIONS.has(openSection) && !selectedBlock && (
            <p className="editor-canva-drawer__hint">Sélectionnez un bloc pour modifier son style.</p>
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
                  <PlacementTile
                    key={entry.name}
                    disabled={disabled}
                    preset={createIconBlockPreset(entry.name, iconColor)}
                    onBeginPlacement={onBeginPlacement}
                    className="editor-canva-icon-tile"
                    title={entry.label}
                  >
                    <CanvasIconGlyph name={entry.name} color={iconColor} size={22} />
                  </PlacementTile>
                ))}
              </div>
            </>
          )}
          {openSection === 'import' && (
            <>
              <h3 className="editor-canva-drawer__title">Image</h3>
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Importez une image, puis placez-la sur le canevas par glisser-déposer ou en cliquant sur une vignette.
              </p>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--primary editor-canva-drawer__btn--full"
                disabled={disabled || importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? 'Compression…' : 'Choisir une image…'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
              {imageHistory.length > 0 && (
                <>
                  <h4 className="editor-canva-drawer__subtitle">Mes images</h4>
                  <div className="editor-canva-image-history">
                    {imageHistory.map((entry) => (
                      <ImageHistoryTile
                        key={entry.id}
                        entry={entry}
                        disabled={disabled}
                        onBeginPlacement={onBeginPlacement}
                        onRemove={(id) => {
                          removeUserCanvasImage(id);
                          refreshImageHistory();
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {openSection === 'position' && (
            <EditorCanvaPositionDrawer
              layout={layout}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              onBlockPatch={onBlockPatch}
              onBlockBringToFront={onBlockBringToFront}
              onBlockSendToBack={onBlockSendToBack}
              onBlockZStep={onBlockZStep}
              onReorderLayers={onReorderLayers}
            />
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
              <h4 className="editor-canva-drawer__subtitle">Transfert</h4>
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Ajoutez des éléments depuis un autre brouillon sans remplacer ce canvas.
              </p>
              <label className="editor-canva-drawer__field">
                Brouillon source
                <select
                  value={transferSourceKey}
                  onChange={(e) => setTransferSourceKey(e.target.value)}
                  disabled={disabled || transferDraftOptions.length === 0}
                >
                  <option value="">Choisir un brouillon</option>
                  {transferDraftOptions.map((draft) => (
                    <option key={draft.contextKey} value={draft.contextKey}>
                      {draft.label || draft.contextKey}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="editor-canva-drawer__btn editor-canva-drawer__btn--full"
                disabled={disabled || !transferSourceKey}
                onClick={() => onOpenTransferFromDraft?.(transferSourceKey)}
              >
                Transférer des éléments
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
