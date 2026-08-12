import { useEffect, useRef, useState } from 'react';
import {
  HiArrowUpTray,
  HiArrowsPointingOut,
  HiDocumentText,
  HiSwatch,
  HiTrash,
} from 'react-icons/hi2';
import { uploadCanvasImageFile } from '../../lib/uploadCanvasAsset.js';
import {
  addUserCanvasImage,
  CANVAS_IMAGE_DROP_MIME,
  listUserCanvasImages,
  removeUserCanvasImage,
  syncUserCanvasImagesFromLayout,
  toSafeCanvasImageSrc,
} from '../../lib/canvasImageLibrary.js';
import { CANVAS_ICON_ENTRIES, createIconBlockPreset } from '../../lib/canvasIconLibrary.js';
import { ELEMENT_SHAPE_ITEMS, createShapeBlockPreset } from '../../lib/canvasShapePresets.js';
import { TEXT_PRESET_ITEMS, createTextBlockPreset } from '../../lib/canvasTextPresets.js';
import {
  CV_SECTION_ITEMS,
  createCvSectionBlockPreset,
} from '../../lib/canvasCvSectionPresets.js';
import {
  createImageBlockPreset,
} from '../../lib/freeCanvasBlockPresets.js';
import { listAllBlocks } from '../../lib/cvLayoutModelV3.js';
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

/** Rail principal AXE-31 : 4 familles guidantes. */
const SECTIONS = [
  { id: 'sections', label: 'Sections CV', icon: HiDocumentText },
  { id: 'design', label: 'Design', icon: HiSwatch },
  { id: 'import', label: 'Importer', icon: HiArrowUpTray },
  { id: 'position', label: 'Position', icon: HiArrowsPointingOut },
];

const DESIGN_TABS = [
  { id: 'models', label: 'Modèles' },
  { id: 'decoration', label: 'Décoration' },
  { id: 'tools', label: 'Outils' },
];

const TEXT_PRESETS = TEXT_PRESET_ITEMS;

const STYLE_PANEL_SECTIONS = new Set(['fonts', 'colors', 'effects', 'shape-style']);
const RAIL_SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

function layoutHasContent(layout) {
  return listAllBlocks(layout).length > 0;
}

function confirmDestructive(message) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  return window.confirm(message);
}

function ImageHistoryTile({ entry, disabled, onBeginPlacement, onRemove }) {
  const safeSrc = toSafeCanvasImageSrc(entry?.dataUrl);
  const preset = safeSrc ? createImageBlockPreset(safeSrc) : null;
  const onPointerDown = (e) => {
    if (disabled || !preset) return;
    e.preventDefault();
    onBeginPlacement?.(preset);
  };
  const onDragStart = (e) => {
    if (disabled || !safeSrc) return;
    e.dataTransfer.setData(CANVAS_IMAGE_DROP_MIME, safeSrc);
    e.dataTransfer.effectAllowed = 'copy';
  };
  if (!safeSrc) return null;
  // Pas d'URL dynamique dans img/src ni style backgroundImage (CodeQL js/xss-through-dom).
  return (
    <div className="editor-canva-image-history__item">
      <button
        type="button"
        className="editor-canva-image-history__thumb editor-canva-image-history__thumb--safe"
        disabled={disabled}
        draggable={!disabled}
        title={entry.label || 'Glisser sur le canevas ou cliquer pour placer'}
        onPointerDown={onPointerDown}
        onClick={(e) => e.preventDefault()}
        onDragStart={onDragStart}
      >
        <span className="editor-canva-image-history__thumb-label" aria-hidden>
          {(entry.label || 'IMG').slice(0, 3).toUpperCase()}
        </span>
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
  openSection = 'sections',
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
  const [designTab, setDesignTab] = useState('models');
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

  const prevSectionRef = useRef(openSection);
  useEffect(() => {
    const prev = prevSectionRef.current;
    prevSectionRef.current = openSection;
    const wasDesign = prev === 'design' || prev === 'models';
    const isDesign = openSection === 'design' || openSection === 'models';
    if (openSection === 'models' || (isDesign && !wasDesign)) {
      setDesignTab('models');
    }
  }, [openSection]);

  const handleSaveProposal = () => {
    if (typeof onSaveProposal !== 'function') return;
    onSaveProposal(proposalName.trim() || 'mon modèle');
    setProposalName('');
    refreshProposals();
  };

  const handlePickBlankSafe = () => {
    if (layoutHasContent(layout)) {
      const ok = confirmDestructive(
        'Remplacer le canvas actuel par une page blanche ? Les blocs présents seront retirés de cette vue (le CV de base n’est pas effacé).',
      );
      if (!ok) return;
    }
    onPickBlank?.();
  };

  const handleApplyTemplateSafe = (template) => {
    if (!template) return;
    if (layoutHasContent(layout)) {
      const name = template.name || template.id || 'ce modèle';
      const ok = confirmDestructive(
        `Appliquer le modèle « ${name} » ? La mise en page actuelle de ce canvas sera remplacée (brouillon local sauvegardé si possible).`,
      );
      if (!ok) return;
    }
    onApplyCanvasTemplate?.(template);
  };

  const handleLoadProposalSafe = (proposalLayout) => {
    if (layoutHasContent(layout)) {
      const ok = confirmDestructive(
        'Appliquer cette proposition locale ? La mise en page actuelle de ce canvas sera remplacée.',
      );
      if (!ok) return;
    }
    onLoadProposal?.(proposalLayout);
  };

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const url = await uploadCanvasImageFile(file);
      addUserCanvasImage(url, { label: file.name || '' });
      refreshImageHistory();
      const preset = createImageBlockPreset(url);
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

  const railActiveId = RAIL_SECTION_IDS.has(openSection)
    ? openSection
    : (STYLE_PANEL_SECTIONS.has(openSection) ? null : openSection);

  const showDesignDrawer = openSection === 'design' || openSection === 'models';
  const effectiveDesignTab = openSection === 'models' ? 'models' : designTab;

  return (
    <aside className={`editor-canva-shell${placementActive ? ' editor-canva-shell--placing' : ''}`} aria-label="Outils canvas">
      {placementActive && (
        <p className="editor-canva-shell__place-hint" role="status">
          Cliquez sur le canevas pour placer l’élément · Échap pour annuler
        </p>
      )}
      <nav className="editor-canva-rail" role="tablist" aria-label="Familles d’outils">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = railActiveId === section.id;
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
            openSection === 'fonts' ? 'editor-canva-drawer--fill' : '',
          ].filter(Boolean).join(' ')}
          role="tabpanel"
        >
          {openSection === 'sections' && (
            <>
              <h3 className="editor-canva-drawer__title">Sections CV</h3>
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Blocs liés à ton CV de base (contenu partagé avec le mode Stable). Clique puis place sur le canevas.
              </p>
              <div className="editor-canva-drawer__grid editor-canva-drawer__grid--sections">
                {CV_SECTION_ITEMS.map((item) => {
                  const preset = createCvSectionBlockPreset(item.type);
                  return (
                    <PlacementTile
                      key={item.type}
                      disabled={disabled}
                      preset={preset}
                      onBeginPlacement={onBeginPlacement}
                      className="editor-canva-drawer__tile editor-canva-drawer__tile--section"
                      title={item.description}
                    >
                      <span className="editor-canva-drawer__tile-label">{item.label}</span>
                      <span className="editor-canva-drawer__tile-hint">{item.description}</span>
                    </PlacementTile>
                  );
                })}
              </div>
            </>
          )}

          {showDesignDrawer && (
            <>
              <h3 className="editor-canva-drawer__title">Design</h3>
              <div className="editor-canva-design-tabs" role="tablist" aria-label="Sous-sections Design">
                {DESIGN_TABS.map((tab) => {
                  const active = effectiveDesignTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={
                        active
                          ? 'editor-canva-design-tabs__btn editor-canva-design-tabs__btn--active'
                          : 'editor-canva-design-tabs__btn'
                      }
                      onClick={() => {
                        setDesignTab(tab.id);
                        if (openSection !== 'design') onOpenSectionChange?.('design');
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {effectiveDesignTab === 'models' && (
                <>
                  <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                    Choisis un modèle pour structurer la page. Les actions ci-dessous remplacent la mise en page du canvas.
                  </p>
                  <button
                    type="button"
                    className="editor-canva-drawer__btn editor-canva-drawer__btn--full"
                    disabled={disabled}
                    onClick={handlePickBlankSafe}
                  >
                    Page blanche
                  </button>
                  <button
                    type="button"
                    className="editor-canva-drawer__btn editor-canva-drawer__btn--full"
                    disabled={disabled}
                    onClick={handleSaveProposal}
                    title="Enregistre une proposition de mise en page sur ce navigateur uniquement (pas le CV cloud)."
                  >
                    Sauver la mise en page (local)
                  </button>
                  <input
                    type="text"
                    className="editor-canva-drawer__input"
                    placeholder="Nom de la proposition locale"
                    value={proposalName}
                    onChange={(ev) => setProposalName(ev.target.value)}
                    aria-label="Nom de la proposition locale"
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
                          onClick={() => handleApplyTemplateSafe(t)}
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
                      <h4 className="editor-canva-drawer__subtitle">Mes propositions locales</h4>
                      {proposals.map((p) => (
                        <div key={p.id} className="editor-canva-drawer__proposal">
                          <strong>{p.name}</strong>
                          <div className="editor-canva-drawer__proposal-actions">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => handleLoadProposalSafe(p.layout)}
                            >
                              Appliquer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                deleteLayoutProposal(p.id);
                                refreshProposals();
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {effectiveDesignTab === 'decoration' && (
                <>
                  <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                    Éléments décoratifs (non liés au contenu CV). Pour ajouter du contenu métier, utilise « Sections CV ».
                  </p>
                  <h4 className="editor-canva-drawer__subtitle">Formes</h4>
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
                  <h4 className="editor-canva-drawer__subtitle">Texte libre</h4>
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
                      <EditorCanvaFontPanel
                        block={selectedBlock}
                        onBlockStylePatch={onBlockStylePatch}
                        fontFamilies={fontFamilies}
                      />
                    </>
                  )}
                  <h4 className="editor-canva-drawer__subtitle">Icônes</h4>
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

              {effectiveDesignTab === 'tools' && (
                <>
                  <h4 className="editor-canva-drawer__subtitle">Aide à la composition</h4>
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

          {openSection === 'import' && (
            <>
              <h3 className="editor-canva-drawer__title">Importer une image</h3>
              <p className="editor-canva-drawer__hint editor-canva-drawer__hint--subtle">
                Images décoratives uniquement (PNG, JPG…). L’import d’un CV PDF ou Word n’est pas encore disponible ici.
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
        </div>
      )}
    </aside>
  );
}
