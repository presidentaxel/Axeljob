import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiGet, apiPostBlob, apiPut } from '../../api';
import {
  applyCvFieldsFromRoot,
  readBlockContentFromRoot,
} from '../../lib/canvasInlineEdit.js';
import { applyAtsLayoutOptimizations } from '../../lib/atsLayoutOptimize.js';
import { saveLayoutProposal } from '../../lib/layoutProposalsStorage.js';
import { defaultCv } from '../../data/cvDefault';
import { blockSupportsStyleToolbar } from '../../lib/canvasBlockToolbar.js';
import { getLastBlockIdOnPage } from '../../lib/freeCanvasBlockPresets.js';
import {
  createCanvasLayoutBlank,
  createCanvasLayoutForTemplate,
} from '../../lib/layoutTemplatePresets.js';
import {
  addBlockToPage,
  bringToFront,
  createBlankLayoutV3,
  duplicateBlock,
  findBlock,
  isEmptyLayoutV3,
  migrateLayoutToV3,
  removeBlock,
  sendToBack,
  setBlockPosition,
  updateBlock,
  updateBlockStyle,
} from '../../lib/cvLayoutModelV3.js';
import { applyLayoutPagination, layoutHasPageOverflow } from '../../lib/layoutPagination.js';
import { useAutoSave } from '../../lib/useAutoSave.js';
import { useLayoutHistory } from '../../lib/useLayoutHistory.js';
import CvEditablePreview from '../CvEditablePreview.jsx';
import FreeCanvas from './FreeCanvas.jsx';

import AutoSaveIndicator from './AutoSaveIndicator.jsx';
import EditorAtsScoreBadge from './EditorAtsScoreBadge.jsx';
import EditorBlockChromeToolbar from './EditorBlockChromeToolbar.jsx';
import EditorCanvaSidebar from './EditorCanvaSidebar.jsx';
import EditorFloatingTextToolbar from './EditorFloatingTextToolbar.jsx';
import EditorImageEditPopover from './EditorImageEditPopover.jsx';
import EditorInspectorDrawer from './EditorInspectorDrawer.jsx';
import EditorTemplateSelector from './EditorTemplateSelector.jsx';

import '../../styles/CvEditorBeta.css';
import '../../styles/EditorCanvaSidebar.css';
import '../../styles/EditorInspector.css';

/**
 * Classe injectee sur `<body>` quand l editeur Beta est monte. Permet aux
 * styles de CvEditorBeta.css de masquer le `page-header` et de neutraliser
 * le padding/margin du `page-content` parent (qui vient d App.jsx),
 * **sans toucher a App.jsx**.
 */
const BODY_FULLSCREEN_CLASS = 'cv-editor-beta-fullscreen';

/**
 * Editeur de CV Beta — squelette L1 (cf. docs/editor-vision.md).
 *
 *  1. Charge le CV via `GET /api/cv?profile=1`.
 *  2. Affiche en plein ecran via `CvEditablePreview` (contentEditable).
 *  3. Auto-sauvegarde via `PUT /api/cv` (debounce 1.5s, retry exponentiel,
 *     beforeunload guard) — voir `lib/autoSaveScheduler.js`.
 *  4. Badge score ATS qui se met a jour si le template change.
 *  5. Selecteur de template dans la topbar editeur.
 *
 * Cohabitation avec ProfileView.jsx (mode stable) : pas d effet de bord
 * global, pas de mutation de stores partages.
 */

export default function CvEditorBeta({
  session: _session,
  templateId,
  templateOptions,
  templatesList,
  onTemplateIdChange,
  onTemplateOptionsChange,
}) {
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  /** `guided` = L1 CvEditablePreview ; `free` = canvas libre (P3.2+). */
  const [editorViewMode, setEditorViewMode] = useState('guided');
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [selectedBlockRect, setSelectedBlockRect] = useState(null);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showCanvasGrid, setShowCanvasGrid] = useState(false);
  const [canvasSnapEnabled, setCanvasSnapEnabled] = useState(true);
  const [imageEditBlockId, setImageEditBlockId] = useState(null);
  const [sidebarSection, setSidebarSection] = useState('elements');
  const [placementPreset, setPlacementPreset] = useState(null);
  const layoutRef = useRef(null);

  const layoutHistory = useLayoutHistory(() => createBlankLayoutV3(), {
    keyboardShortcuts: editorViewMode === 'free',
  });
  const {
    layout,
    commit: commitLayout,
    undo: undoLayout,
    redo: redoLayout,
    reset: resetLayout,
    canUndo: canUndoLayout,
    canRedo: canRedoLayout,
  } = layoutHistory;

  layoutRef.current = layout;

  /**
   * Note (mai 2026) : l UI de mise en page modulaire (P2.4b) a ete
   * retiree apres feedback utilisateur. La place naturelle de ce
   * controle est dans le futur L3 / canvas libre (P3) ou l user
   * compose son CV librement, pas dans un drawer lateral.
   *
   * Ce qui reste en hibernation jusqu a P3 :
   *  - le modele de zones v2 (`lib/cvLayoutModelV2.js`) + ses tests ;
   *  - la persistance backend (`cv_base.data.layout`) : les early
   *    adopters qui ont deja un layout sauvegarde ne perdent rien.
   *
   * Cote front, on n hydrate plus de state `layout` car il n a plus
   * de consommateur UI. On ne le supprime pas en base : la
   * preservation cote backend (`save_cv_base`) garde la valeur
   * existante meme quand le PUT n envoie pas la cle (cf. P2.3).
   */

  /**
   * Template courant deduit de `templatesList` + `templateId` pour
   * alimenter le drawer inspecteur (lecture de `options`). Si introuvable
   * (template charge async, id manquant), le drawer affiche un etat vide.
   */
  const activeTemplate = useMemo(() => {
    if (!Array.isArray(templatesList)) return null;
    return templatesList.find((t) => t && t.id === templateId) || null;
  }, [templatesList, templateId]);

  /**
   * `saveFn` est defini en `useCallback` pour pouvoir etre retenu via
   * `saveFnKey` : quand templateId/templateOptions changent, on cree une
   * nouvelle reference, et le scheduler est re-initialise (via la cle).
   * Cela garantit qu un PUT en cours utilise toujours les bons template_*.
   *
   * Le PUT n inclut pas la cle `layout` -> la preservation cote backend
   * (`save_cv_base`) garde la valeur existante en base intacte.
   */
  const saveFn = useCallback(async (payload) => {
    const body = {
      ...payload,
      template_id: templateId,
      template_options: templateOptions,
    };
    // En mode canvas libre, on persiste le layout v3 present.
    // En mode guide, on omet `layout` -> preservation backend (P2.3).
    if (editorViewMode === 'free' && layout && !isEmptyLayoutV3(layout)) {
      body.layout = layout;
    }
    return apiPut('/api/cv', body);
  }, [templateId, templateOptions, editorViewMode, layout]);

  const autoSave = useAutoSave({
    saveFn,
    saveFnKey: `${templateId}|${JSON.stringify(templateOptions || {})}`,
  });

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    document.body.classList.add(BODY_FULLSCREEN_CLASS);
    return () => {
      document.body.classList.remove(BODY_FULLSCREEN_CLASS);
    };
  }, []);

  useEffect(() => {
    if (editorViewMode === 'free') {
      setInspectorOpen(false);
      setEditingBlockId(null);
    } else {
      setSelectedBlockRect(null);
      setEditingBlockId(null);
    }
  }, [editorViewMode]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setLoadError(null);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        if (aborted) return;
        const incoming = data && typeof data === 'object' ? data : {};
        const { layout: rawLayout, ...cvPayload } = incoming;
        const baseCv = typeof defaultCv === 'function' ? defaultCv() : defaultCv;
        setCv({ ...baseCv, ...cvPayload });
        // Pas de layout en base -> page blanche + picker (blank vs starter).
        // Sinon migration v1/v2/v3 vers la forme canonique v3.
        const hydratedLayout = rawLayout
          ? migrateLayoutToV3(rawLayout)
          : createBlankLayoutV3();
        resetLayout(hydratedLayout);
        setLoading(false);
      })
      .catch((err) => {
        if (aborted) return;
        setLoadError(err?.message || 'Impossible de charger le CV');
        const baseCv = typeof defaultCv === 'function' ? defaultCv() : defaultCv;
        setCv({ ...baseCv });
        resetLayout(createBlankLayoutV3());
        setLoading(false);
      });
    return () => { aborted = true; };
  }, [resetLayout]);

  const handleCvChange = useCallback((nextCv) => {
    setCv(nextCv);
    autoSave.schedule(nextCv);
  }, [autoSave]);

  const handleRetry = useCallback(() => {
    autoSave.flush();
  }, [autoSave]);

  const handleInspectorToggle = useCallback(() => {
    setInspectorOpen((prev) => !prev);
  }, []);

  const handleInspectorClose = useCallback(() => {
    setInspectorOpen(false);
  }, []);

  const handleTemplateOptionsChange = useCallback((nextOptions) => {
    if (typeof onTemplateOptionsChange === 'function') {
      onTemplateOptionsChange(nextOptions);
    }
  }, [onTemplateOptionsChange]);

  const handlePickBlankCanvas = useCallback(() => {
    setPlacementPreset(null);
    const next = createCanvasLayoutBlank();
    resetLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId || editorViewMode !== 'free') return null;
    const found = findBlock(layout, selectedBlockId);
    return found?.block ?? null;
  }, [layout, selectedBlockId, editorViewMode]);

  const handleSelectBlock = useCallback((blockId) => {
    setSelectedBlockId(blockId);
  }, []);

  const handleBlockPositionChange = useCallback((blockId, pos, commitOptions) => {
    const next = setBlockPosition(layout, blockId, pos);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleBlockResizeChange = useCallback((blockId, patch, commitOptions) => {
    const next = updateBlock(layout, blockId, patch);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleBlockAutoHeight = useCallback((blockId, newHmm) => {
    const found = findBlock(layout, blockId);
    if (!found?.block || newHmm <= (found.block.h ?? 0)) return;
    const next = updateBlock(layout, blockId, { h: newHmm });
    commitLayout(next, { groupKey: 'autoheight' });
  }, [layout, commitLayout]);

  const handleDragEndPersist = useCallback(() => {
    setCanvasBusy(false);
    if (editorViewMode === 'free') {
      const current = layoutRef.current;
      if (layoutHasPageOverflow(current)) {
        const paginated = applyLayoutPagination(current);
        commitLayout(paginated, { groupKey: 'pagination:auto' });
      }
    }
    if (cv) autoSave.schedule(cv);
  }, [editorViewMode, commitLayout, cv, autoSave]);

  const handleBeginPlacement = useCallback((preset) => {
    if (!preset) return;
    setPlacementPreset(preset);
  }, []);

  const handleCancelPlacement = useCallback(() => {
    setPlacementPreset(null);
  }, []);

  const handlePlaceBlockAt = useCallback((pageIndex, xMm, yMm) => {
    if (!placementPreset) return;
    const w = placementPreset.w ?? 20;
    const h = placementPreset.h ?? 10;
    const partial = {
      ...placementPreset,
      x: Math.max(0, xMm - w / 2),
      y: Math.max(0, yMm - h / 2),
    };
    const next = addBlockToPage(layout, pageIndex, partial);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) setSelectedBlockId(newId);
    setPlacementPreset(null);
    if (cv) autoSave.schedule(cv);
  }, [placementPreset, layout, commitLayout, cv, autoSave]);

  const handleOpenPositionPanel = useCallback(() => {
    setSidebarSection('position');
  }, []);

  const handleDuplicateSelectedBlock = useCallback(() => {
    if (!selectedBlockId) return;
    const next = duplicateBlock(layout, selectedBlockId);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, 0);
    if (newId) setSelectedBlockId(newId);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleImageEdit = useCallback((blockId) => {
    setSelectedBlockId(blockId);
    setImageEditBlockId(blockId);
    setEditingBlockId(null);
  }, []);

  const handleApplyCanvasTemplate = useCallback((template) => {
    if (!template) return;
    setPlacementPreset(null);
    const next = createCanvasLayoutForTemplate(template);
    resetLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  const handleToggleBlockLock = useCallback(() => {
    if (!selectedBlockId) return;
    const found = findBlock(layout, selectedBlockId);
    if (!found?.block) return;
    const next = updateBlock(layout, selectedBlockId, { locked: !found.block.locked });
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockPatch = useCallback((patch) => {
    if (!selectedBlockId) return;
    const next = updateBlock(layout, selectedBlockId, patch);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockPatchById = useCallback((blockId, patch) => {
    if (!blockId) return;
    const next = updateBlock(layout, blockId, patch);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleBlockStylePatch = useCallback((stylePatch) => {
    if (!selectedBlockId) return;
    let next = updateBlockStyle(layout, selectedBlockId, stylePatch);
    if (stylePatch.stroke_width != null) {
      const found = findBlock(layout, selectedBlockId);
      if (found?.block?.type === 'shape:line') {
        next = updateBlock(next, selectedBlockId, { h: stylePatch.stroke_width });
      }
    }
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockBringToFront = useCallback((blockId) => {
    const id = blockId || selectedBlockId;
    if (!id) return;
    const next = bringToFront(layout, id);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockSendToBack = useCallback((blockId) => {
    const id = blockId || selectedBlockId;
    if (!id) return;
    const next = sendToBack(layout, id);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockZStep = useCallback((blockId, delta) => {
    if (!blockId) return;
    const found = findBlock(layout, blockId);
    if (!found?.block) return;
    const z = Math.max(0, (found.block.z ?? 0) + delta);
    const next = updateBlock(layout, blockId, { z });
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleDeleteSelectedBlock = useCallback(() => {
    if (!selectedBlockId) return;
    const next = removeBlock(layout, selectedBlockId);
    commitLayout(next);
    setSelectedBlockId(null);
    setEditingBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleStartBlockEdit = useCallback((blockId) => {
    setSelectedBlockId(blockId);
    setEditingBlockId(blockId);
  }, []);

  const handleCommitBlockEdit = useCallback((blockId, rootEl) => {
    if (!blockId || !layout) {
      setEditingBlockId(null);
      return;
    }
    const found = findBlock(layout, blockId);
    if (!found?.block) {
      setEditingBlockId(null);
      return;
    }
    const { block } = found;
    if (block.type === 'text' || block.type === 'title') {
      const content = readBlockContentFromRoot(rootEl, block.type);
      const next = updateBlock(layout, blockId, { content });
      commitLayout(next);
    } else if (cv && rootEl) {
      const nextCv = applyCvFieldsFromRoot(cv, rootEl);
      handleCvChange(nextCv);
    }
    setEditingBlockId(null);
  }, [layout, cv, commitLayout, handleCvChange]);

  const handleSwitchToFreeCanvas = useCallback(() => {
    setEditorViewMode('free');
  }, []);

  const handleOptimizeAtsLayout = useCallback(() => {
    if (!layout) return;
    const next = applyAtsLayoutOptimizations(layout);
    commitLayout(next, { groupKey: 'ats:optimize' });
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleExportLayoutPdf = useCallback(async () => {
    if (!cv || !layout || pdfExporting) return;
    setPdfExporting(true);
    try {
      const { blob, filename } = await apiPostBlob('/api/pdf', {
        cv,
        template_id: templateId,
        layout,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'cv-canvas.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[cv-editor-beta] export PDF layout', err);
    } finally {
      setPdfExporting(false);
    }
  }, [cv, layout, templateId, pdfExporting]);

  const handleSaveLayoutProposal = useCallback((name) => {
    if (!layout) return;
    saveLayoutProposal(name, layout);
  }, [layout]);

  const handleLoadLayoutProposal = useCallback((proposalLayout) => {
    if (!proposalLayout) return;
    const next = migrateLayoutToV3(proposalLayout);
    resetLayout(next);
    setSelectedBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  useEffect(() => {
    if (editorViewMode !== 'free') return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (document.activeElement?.isContentEditable && editingBlockId) return;
      if (!selectedBlockId) return;
      e.preventDefault();
      handleDeleteSelectedBlock();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editorViewMode, selectedBlockId, editingBlockId, handleDeleteSelectedBlock]);

  if (loading) {
    return (
      <div className="cv-editor-beta cv-editor-beta--loading">
        <p>Chargement du CV…</p>
      </div>
    );
  }

  return (
    <div className="cv-editor-beta">
      <header className="cv-editor-beta-topbar">
        <div className="cv-editor-beta-topbar-left">
          <span className="cv-editor-beta-badge">Mode Beta</span>
          <div className="cv-editor-beta-view-toggle" role="group" aria-label="Mode d’édition">
            <button
              type="button"
              className={
                editorViewMode === 'guided'
                  ? 'cv-editor-beta-view-btn cv-editor-beta-view-btn--active'
                  : 'cv-editor-beta-view-btn'
              }
              onClick={() => setEditorViewMode('guided')}
              aria-pressed={editorViewMode === 'guided'}
            >
              Édition guidée
            </button>
            <button
              type="button"
              className={
                editorViewMode === 'free'
                  ? 'cv-editor-beta-view-btn cv-editor-beta-view-btn--active'
                  : 'cv-editor-beta-view-btn'
              }
              onClick={() => setEditorViewMode('free')}
              aria-pressed={editorViewMode === 'free'}
            >
              Canvas libre
            </button>
          </div>
          {editorViewMode === 'guided' && (
            <button
              type="button"
              className="cv-editor-beta-bridge-btn"
              onClick={handleSwitchToFreeCanvas}
              title="Composer la mise en page en blocs"
            >
              Mise en page libre
            </button>
          )}
          {editorViewMode === 'free' && (
            <div className="cv-editor-beta-history-btns">
              <button
                type="button"
                className="cv-editor-beta-history-btn"
                onClick={undoLayout}
                disabled={!canUndoLayout}
                title="Annuler (Ctrl+Z)"
              >
                Annuler
              </button>
              <button
                type="button"
                className="cv-editor-beta-history-btn"
                onClick={redoLayout}
                disabled={!canRedoLayout}
                title="Rétablir (Ctrl+Shift+Z)"
              >
                Rétablir
              </button>
            </div>
          )}
          {editorViewMode === 'guided' && (
            <EditorTemplateSelector
              templates={templatesList}
              templateId={templateId}
              onTemplateIdChange={onTemplateIdChange}
            />
          )}
        </div>
        <div className="cv-editor-beta-topbar-right">
          <AutoSaveIndicator state={autoSave.state} onRetry={handleRetry} />
          <EditorAtsScoreBadge
            templateId={editorViewMode === 'free' ? undefined : templateId}
            layout={editorViewMode === 'free' ? layout : undefined}
            cv={cv}
            paused={editorViewMode === 'free' && canvasBusy}
          />
          {editorViewMode === 'free' && (
            <>
              <button
                type="button"
                className="cv-editor-beta-history-btn"
                onClick={handleOptimizeAtsLayout}
                disabled={loading || !layout}
                title="Réordonner les blocs pour la lecture ATS"
              >
                Optimiser ATS
              </button>
              <button
                type="button"
                className="cv-editor-beta-history-btn"
                onClick={handleExportLayoutPdf}
                disabled={loading || !layout || pdfExporting}
                title="Exporter le PDF depuis le layout canvas"
              >
                {pdfExporting ? 'PDF…' : 'PDF canvas'}
              </button>
            </>
          )}
          {editorViewMode === 'guided' && (
            <button
              type="button"
              className={
                inspectorOpen
                  ? 'editor-inspector-toggle-btn editor-inspector-toggle-btn--active'
                  : 'editor-inspector-toggle-btn'
              }
              onClick={handleInspectorToggle}
              aria-expanded={inspectorOpen}
              aria-controls="cv-editor-beta-inspector"
              title="Ouvrir l’inspecteur de style"
            >
              <span className="editor-inspector-toggle-icon" aria-hidden="true">⚙</span>
              <span>Inspecteur</span>
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="cv-editor-beta-error" role="alert">
          {loadError}
        </div>
      )}

      <div
        className={
          editorViewMode === 'free'
            ? 'cv-editor-beta-workspace cv-editor-beta-workspace--canva'
            : 'cv-editor-beta-workspace'
        }
      >
        {editorViewMode === 'free' && (
          <EditorCanvaSidebar
            disabled={loading || !layout}
            openSection={sidebarSection}
            onOpenSectionChange={setSidebarSection}
            placementActive={Boolean(placementPreset)}
            layout={layout}
            selectedBlockId={selectedBlockId}
            templatesList={templatesList}
            showGrid={showCanvasGrid}
            snapEnabled={canvasSnapEnabled}
            onShowGridChange={setShowCanvasGrid}
            onSnapEnabledChange={setCanvasSnapEnabled}
            onBeginPlacement={handleBeginPlacement}
            onSelectBlock={handleSelectBlock}
            onBlockPatch={handleBlockPatchById}
            onBlockBringToFront={handleBlockBringToFront}
            onBlockSendToBack={handleBlockSendToBack}
            onBlockZStep={handleBlockZStep}
            onPickBlank={handlePickBlankCanvas}
            onApplyCanvasTemplate={handleApplyCanvasTemplate}
            onLoadProposal={handleLoadLayoutProposal}
            onSaveProposal={handleSaveLayoutProposal}
          />
        )}
        <div className="cv-editor-beta-canva-column">
        <main className="cv-editor-beta-canvas">
          {editorViewMode === 'guided' ? (
            <CvEditablePreview
              cv={cv}
              baseCv={cv}
              onChange={handleCvChange}
              templateId={templateId}
              templateOptions={templateOptions}
            />
          ) : (
            <>
              <FreeCanvas
                layout={layout}
                cv={cv}
                selectedBlockId={selectedBlockId}
                editingBlockId={editingBlockId}
                showGrid={showCanvasGrid}
                snapEnabled={canvasSnapEnabled}
                placementPreset={placementPreset}
                onPlaceBlockAt={handlePlaceBlockAt}
                onCancelPlacement={handleCancelPlacement}
                onSelectBlock={handleSelectBlock}
                onBlockPositionChange={handleBlockPositionChange}
                onBlockResizeChange={handleBlockResizeChange}
                onDragEnd={handleDragEndPersist}
                onCanvasInteractionChange={setCanvasBusy}
                onStartBlockEdit={handleStartBlockEdit}
                onCommitBlockEdit={handleCommitBlockEdit}
                onImageEdit={handleImageEdit}
                onSelectedBlockRect={setSelectedBlockRect}
                onBlockAutoHeight={handleBlockAutoHeight}
              />
              {selectedBlock && selectedBlockRect && (
                <EditorBlockChromeToolbar
                  block={selectedBlock}
                  anchorRect={selectedBlockRect}
                  locked={Boolean(selectedBlock.locked)}
                  onDelete={handleDeleteSelectedBlock}
                  onDuplicate={handleDuplicateSelectedBlock}
                  onToggleLock={handleToggleBlockLock}
                />
              )}
              {selectedBlock && selectedBlockRect && blockSupportsStyleToolbar(selectedBlock.type) && (
                <EditorFloatingTextToolbar
                  block={selectedBlock}
                  anchorRect={selectedBlockRect}
                  isEditing={editingBlockId === selectedBlock.id}
                  onBlockStylePatch={handleBlockStylePatch}
                  onOpenPositionPanel={handleOpenPositionPanel}
                />
              )}
              {imageEditBlockId && selectedBlock?.type === 'image' && selectedBlockRect && (
                <EditorImageEditPopover
                  block={selectedBlock}
                  anchorRect={selectedBlockRect}
                  onBlockPatch={handleBlockPatch}
                  onBlockStylePatch={handleBlockStylePatch}
                  onClose={() => setImageEditBlockId(null)}
                />
              )}
            </>
          )}
        </main>
        </div>
        {editorViewMode === 'guided' && (
          <div id="cv-editor-beta-inspector" className="cv-editor-beta-inspector-slot">
            <EditorInspectorDrawer
              open={inspectorOpen}
              template={activeTemplate}
              templateOptions={templateOptions}
              onTemplateOptionsChange={handleTemplateOptionsChange}
              onClose={handleInspectorClose}
              cv={cv}
              onCvChange={handleCvChange}
              selectedBlock={null}
              onBlockPatch={handleBlockPatch}
              onBlockStylePatch={handleBlockStylePatch}
              onBlockBringToFront={handleBlockBringToFront}
              onBlockSendToBack={handleBlockSendToBack}
            />
          </div>
        )}
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>
          {editorViewMode === 'free'
            ? 'Canvas libre · double-clic pour éditer · sidebar Canva · Ctrl+Z'
            : 'Édition guidée · « Mise en page libre » pour composer en blocs'}
        </span>
      </footer>
    </div>
  );
}
