import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  apiGet,
  apiPost,
  apiPostBlob,
  apiPostFile,
  apiPut,
  getDownloadPermissionHint,
  prepareAppleDownloadWindow,
  saveBlobWithPreferredMethod,
} from '../../api';
import CvImportLoadingOverlay from '../CvImportLoadingOverlay.jsx';
import {
  cvFromImportPayload,
  extractImportApiResponse,
  finishImportLoadingAnimation,
  startImportLoadingAnimation,
} from '../../lib/cvImportUtils.js';
import {
  buildFullCanvasImportLayout,
  recommendTemplateLabel,
  summarizeImportAdaptation,
} from '../../lib/canvasCvImportAdapter.js';
import {
  applyCvFieldsFromRoot,
  readBlockContentFromRoot,
} from '../../lib/canvasInlineEdit.js';
import { applyAtsLayoutOptimizations } from '../../lib/atsLayoutOptimize.js';
import { saveLayoutProposal } from '../../lib/layoutProposalsStorage.js';
import {
  BLANK_CANVAS_CONTEXT_KEY,
  canvasContextLabel,
  getActiveCanvasContext,
  getCanvasDraftPrefs,
  listCanvasDrafts,
  loadCanvasDraft,
  saveCanvasDraft,
  setActiveCanvasContext,
  setCanvasDraftPrefs,
  templateCanvasContextKey,
} from '../../lib/canvasLayoutDrafts.js';
import {
  detectTransferCandidates,
  mergeTransferredBlocks,
} from '../../lib/canvasLayoutTransfer.js';
import { defaultCv } from '../../data/cvDefault';
import { blockSupportsStyleToolbar } from '../../lib/canvasBlockToolbar.js';
import { getLastBlockIdOnPage } from '../../lib/freeCanvasBlockPresets.js';
import {
  createCanvasLayoutBlank,
  createCanvasLayoutForTemplate,
} from '../../lib/layoutTemplatePresets.js';
import {
  addBlockToPage,
  appendBlankPage,
  bringToFront,
  canAppendBlankPage,
  createBlankLayoutV3,
  createStarterLayoutV3,
  duplicateBlock,
  findBlock,
  isEmptyLayoutV3,
  migrateLayoutToV3,
  removeBlock,
  removePage,
  sendToBack,
  setBlockPosition,
  updateBlock,
  updateBlockStyle,
  isAutoHeightBlockType,
  isSemanticBlockType,
} from '../../lib/cvLayoutModelV3.js';
import { resetTemplateOptionsToDefaults } from '../../lib/templateOptionsSchema.js';
import { reflowColumnBlocksOnPage } from '../../lib/layoutReflow.js';
import { moveBlockToPage } from '../../lib/canvasPageTransfer.js';
import { useAutoSave } from '../../lib/useAutoSave.js';
import { useLayoutHistory } from '../../lib/useLayoutHistory.js';
import FreeCanvas from './FreeCanvas.jsx';

import AutoSaveIndicator from './AutoSaveIndicator.jsx';
import EditorAtsScoreBadge from './EditorAtsScoreBadge.jsx';
import EditorCanvaSidebar from './EditorCanvaSidebar.jsx';
import EditorBlockChromeToolbar from './EditorBlockChromeToolbar.jsx';
import EditorFloatingTextToolbar from './EditorFloatingTextToolbar.jsx';
import EditorImageEditPopover from './EditorImageEditPopover.jsx';
import EditorCanvaTransferModal from './EditorCanvaTransferModal.jsx';
import EditorCvImportModal from './EditorCvImportModal.jsx';

import {
  buildCanvasPdfFilename,
  sameLayout,
  blockSupportsEditHint,
  dismissCanvasEditHint,
  dismissSemanticEditNote,
  editHintMessageForBlock,
  isCanvasEditHintDismissed,
  isSemanticEditNoteDismissed,
} from '../../lib/canvasEditorUtils.js';

import '../../styles/CvEditorBeta.css';
import '../../styles/EditorCanvaSidebar.css';
import '../../styles/EditorInspector.css';
import '../../styles/EditorCvImportModal.css';

/**
 * Editeur de CV Beta - canvas libre uniquement (L3).
 */

function CvEditorBeta({
  session: _session,
  refreshKey = 0,
  templateId,
  templateOptions,
  templatesList,
  onTemplateIdChange,
  onTemplateOptionsChange,
}) {
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  /** Échec GET /api/cv au montage : bloque l’éditeur (pas d’auto-save sur profil vide). */
  const [profileLoadError, setProfileLoadError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState([]);
  const selectedBlockId = selectedBlockIds.length ? selectedBlockIds[selectedBlockIds.length - 1] : null;
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [selectedBlockRect, setSelectedBlockRect] = useState(null);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showCanvasGrid, setShowCanvasGrid] = useState(false);
  const [canvasSnapEnabled, setCanvasSnapEnabled] = useState(true);
  const [imageEditBlockId, setImageEditBlockId] = useState(null);
  const [sidebarSection, setSidebarSection] = useState('elements');
  const [placementPreset, setPlacementPreset] = useState(null);
  const [startupPromptOpen, setStartupPromptOpen] = useState(false);
  const [pdfExportError, setPdfExportError] = useState('');
  const [atsOptimizeMessage, setAtsOptimizeMessage] = useState('');
  const autoHeightPendingRef = useRef(new Map());
  const autoHeightTimerRef = useRef(null);
  const suppressAutoHeightUntilRef = useRef(0);
  const [canvasResizing, setCanvasResizing] = useState(false);
  const layoutRef = useRef(null);
  const autoSaveRef = useRef(null);
  const [activeLayoutContextKey, setActiveLayoutContextKey] = useState(() => getActiveCanvasContext());
  const [canvasDrafts, setCanvasDrafts] = useState(() => listCanvasDrafts(templatesList));
  const [transferRequest, setTransferRequest] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importStepIndex, setImportStepIndex] = useState(0);
  const [importError, setImportError] = useState('');
  const [importToast, setImportToast] = useState('');
  const [editHintOpen, setEditHintOpen] = useState(false);
  const [semanticEditNoteOpen, setSemanticEditNoteOpen] = useState(false);
  const importCleanupRef = useRef(null);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const templatesListRef = useRef(templatesList);
  templatesListRef.current = templatesList;

  const handleLayoutHistoryChange = useCallback(() => {
    if (!cv || profileLoadError) return;
    autoSaveRef.current?.schedule(cv);
  }, [cv, profileLoadError]);

  const layoutHistory = useLayoutHistory(() => createBlankLayoutV3(), {
    keyboardShortcuts: true,
    onHistoryChange: handleLayoutHistoryChange,
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

  const saveFn = useCallback(async (payload) => {
    if (!payload || profileLoadError) {
      throw new Error('Profil non chargé — réessayez.');
    }
    const body = {
      ...payload,
      template_id: payload.template_id ?? templateId,
      template_options: payload.template_options ?? templateOptions,
    };
    const layoutToSave = payload.layout !== undefined ? payload.layout : layoutRef.current;
    if (layoutToSave !== undefined) {
      body.layout = layoutToSave && !isEmptyLayoutV3(layoutToSave) ? layoutToSave : null;
    }
    return apiPut('/api/cv', body);
  }, [templateId, templateOptions, profileLoadError]);

  const autoSave = useAutoSave({
    saveFn,
    saveFnKey: `${templateId}|${JSON.stringify(templateOptions || {})}`,
  });
  autoSaveRef.current = autoSave;

  const refreshCanvasDrafts = useCallback(() => {
    setCanvasDrafts(listCanvasDrafts(templatesList));
  }, [templatesList]);

  useEffect(() => {
    refreshCanvasDrafts();
  }, [refreshCanvasDrafts]);

  const buildTemplateCanvasLayout = useCallback((template) => {
    let next = template ? createCanvasLayoutForTemplate(template) : createCanvasLayoutBlank();
    for (let pi = 0; pi < (next.pages?.length || 0); pi += 1) {
      next = reflowColumnBlocksOnPage(next, pi);
    }
    return next;
  }, []);

  const saveCurrentCanvasDraft = useCallback(() => {
    const currentLayout = layoutRef.current;
    if (!currentLayout) return null;
    const label = canvasContextLabel(activeLayoutContextKey, templatesList);
    const saved = saveCanvasDraft(activeLayoutContextKey, currentLayout, { label });
    refreshCanvasDrafts();
    return saved;
  }, [activeLayoutContextKey, templatesList, refreshCanvasDrafts]);

  useEffect(() => {
    if (!layout || !cv || profileLoadError) return undefined;
    const id = setTimeout(() => {
      saveCanvasDraft(activeLayoutContextKey, layout, {
        label: canvasContextLabel(activeLayoutContextKey, templatesList),
      });
      refreshCanvasDrafts();
    }, 250);
    return () => clearTimeout(id);
  }, [layout, activeLayoutContextKey, templatesList, refreshCanvasDrafts, cv, profileLoadError]);

  const openCanvasContext = useCallback((contextKey, nextLayout) => {
    const hydrated = migrateLayoutToV3(nextLayout || createCanvasLayoutBlank());
    resetLayout(hydrated);
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    setImageEditBlockId(null);
    setPlacementPreset(null);
    setStartupPromptOpen(false);
    setActiveLayoutContextKey(contextKey);
    setActiveCanvasContext(contextKey);
    saveCanvasDraft(contextKey, hydrated, { label: canvasContextLabel(contextKey, templatesList) });
    refreshCanvasDrafts();
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, templatesList, refreshCanvasDrafts, cv, autoSave]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setProfileLoadError(null);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        if (aborted) return;
        const incoming = data && typeof data === 'object' ? data : {};
        const { layout: rawLayout, ...cvPayload } = incoming;
        const baseCv = typeof defaultCv === 'function' ? defaultCv() : defaultCv;
        const mergedCv = { ...baseCv, ...cvPayload };
        setCv(mergedCv);
        const hydratedLayout = rawLayout
          ? migrateLayoutToV3(rawLayout)
          : createBlankLayoutV3();
        const contextKey = getActiveCanvasContext();
        const templates = templatesListRef.current;
        setActiveLayoutContextKey(contextKey);
        setActiveCanvasContext(contextKey);
        if (rawLayout) {
          saveCanvasDraft(contextKey, hydratedLayout, {
            label: canvasContextLabel(contextKey, templates),
          });
          setCanvasDrafts(listCanvasDrafts(templates));
        }
        resetLayout(hydratedLayout);
        setStartupPromptOpen(!rawLayout);
        setLoading(false);
      })
      .catch((err) => {
        if (aborted) return;
        setProfileLoadError(err?.message || 'Impossible de charger le CV. Vérifie ta connexion puis réessaie.');
        setCv(null);
        setLoading(false);
      });
    return () => { aborted = true; };
  }, [resetLayout, refreshKey, profileLoadAttempt]);

  // Libellés des brouillons locaux quand la liste templates arrive (async) —
  // sans re-fetch ni reset du layout en cours (fix B).
  useEffect(() => {
    if (loading || profileLoadError || !cv) return;
    setCanvasDrafts(listCanvasDrafts(templatesList));
  }, [templatesList, loading, profileLoadError, cv]);

  const handleCvChange = useCallback((nextCv) => {
    if (profileLoadError || !nextCv) return;
    setCv(nextCv);
    autoSave.schedule(nextCv);
  }, [autoSave, profileLoadError]);

  const handleRetry = useCallback(() => {
    autoSave.flush();
  }, [autoSave]);

  const requestCanvasContextSwitch = useCallback(({ contextKey, label, baseLayout }) => {
    if (!contextKey || !baseLayout) return;
    const currentLayout = layoutRef.current;
    saveCurrentCanvasDraft();
    const draft = loadCanvasDraft(contextKey);
    const targetLayout = draft?.layout || baseLayout;
    const candidates = currentLayout && contextKey !== activeLayoutContextKey
      ? detectTransferCandidates(currentLayout, baseLayout)
      : [];
    if (getCanvasDraftPrefs().showTransferPrompt && candidates.length > 0) {
      setTransferRequest({
        mode: 'switch',
        contextKey,
        label,
        targetLayout,
        candidates,
      });
      return;
    }
    openCanvasContext(contextKey, targetLayout);
  }, [activeLayoutContextKey, saveCurrentCanvasDraft, openCanvasContext]);

  const handlePickBlankCanvas = useCallback(() => {
    requestCanvasContextSwitch({
      contextKey: BLANK_CANVAS_CONTEXT_KEY,
      label: 'Page blanche',
      baseLayout: createCanvasLayoutBlank(),
    });
  }, [requestCanvasContextSwitch]);

  const applyImportedCvToCanvas = useCallback(async (nextCv, {
    layoutHints = {},
    visionLayout = null,
    visionMeta = {},
  } = {}) => {
    const templates = templatesList || [];
    const {
      layout: finalLayout,
      recommendedTemplateId,
      analysis,
      blockCount,
      importSource,
    } = buildFullCanvasImportLayout(nextCv, templates, {
      templateId,
      layoutHints,
      visionLayout,
      visionMeta,
    });
    const recTemplate = templates.find((t) => t?.id === recommendedTemplateId) || templates[0];
    const contextKey = templateCanvasContextKey(recTemplate?.id || BLANK_CANVAS_CONTEXT_KEY);
    const nextTemplateOptions = recTemplate
      ? resetTemplateOptionsToDefaults(recTemplate)
      : templateOptions;
    if (recommendedTemplateId && onTemplateIdChange) {
      onTemplateIdChange(recommendedTemplateId);
    }
    if (recTemplate && onTemplateOptionsChange) {
      onTemplateOptionsChange(nextTemplateOptions);
    }
    setCv(nextCv);
    setStartupPromptOpen(false);
    setImportModalOpen(false);
    setImportError('');
    resetLayout(finalLayout);
    layoutRef.current = finalLayout;
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    setImageEditBlockId(null);
    setPlacementPreset(null);
    setActiveLayoutContextKey(contextKey);
    setActiveCanvasContext(contextKey);
    saveCanvasDraft(contextKey, finalLayout, {
      label: canvasContextLabel(contextKey, templates),
    });
    refreshCanvasDrafts();
    try {
      await autoSave.flush();
      await saveFn({
        ...nextCv,
        layout: finalLayout,
        template_id: recommendedTemplateId || templateId,
        template_options: nextTemplateOptions,
      });
    } catch (err) {
      setLoadError(err?.message || 'Import réussi mais enregistrement échoué.');
    }
    const label = recommendTemplateLabel(recTemplate?.id, templates);
    let sourceNote = '';
    if (importSource === 'structural') {
      sourceNote = ' · copie fidèle du PDF';
    } else if (importSource === 'vision-guided') {
      sourceNote = ' · analyse visuelle PDF';
    } else if (visionMeta?.source === 'gemini_vision') {
      sourceNote = ' · vision partielle';
    }
    if (importSource === 'structural') {
      setImportToast(`${blockCount} éléments importés${sourceNote}`);
    } else {
      setImportToast(`${summarizeImportAdaptation(analysis, label, blockCount, {
        fromVision: importSource === 'vision-guided',
      })}${sourceNote}`);
    }
  }, [
    templatesList,
    templateId,
    resetLayout,
    refreshCanvasDrafts,
    saveFn,
    autoSave,
    onTemplateIdChange,
    onTemplateOptionsChange,
    templateOptions,
  ]);

  const runCvImport = useCallback(async (importFn) => {
    setImportLoading(true);
    setImportStepIndex(0);
    setImportError('');
    if (importCleanupRef.current) importCleanupRef.current();
    importCleanupRef.current = startImportLoadingAnimation(setImportStepIndex);
    try {
      const result = await importFn();
      finishImportLoadingAnimation(setImportStepIndex);
      const {
        cv: rawCv,
        layoutHints,
        visionLayout,
        visionMeta,
      } = extractImportApiResponse(result);
      const nextCv = cvFromImportPayload(rawCv);
      await applyImportedCvToCanvas(nextCv, { layoutHints, visionLayout, visionMeta });
    } catch (err) {
      setImportError(err?.message || 'Erreur lors de l\'import.');
    } finally {
      setImportLoading(false);
      if (importCleanupRef.current) {
        importCleanupRef.current();
        importCleanupRef.current = null;
      }
    }
  }, [applyImportedCvToCanvas]);

  const handleImportFile = useCallback((file) => {
    if (!file) return;
    runCvImport(() => apiPostFile('/api/cv/import', file));
  }, [runCvImport]);

  const handleImportText = useCallback((text) => {
    if (!text?.trim()) return;
    runCvImport(() => apiPost('/api/cv/import-text', { text: text.trim() }));
  }, [runCvImport]);

  useEffect(() => {
    if (!importToast) return undefined;
    const id = setTimeout(() => setImportToast(''), 6000);
    return () => clearTimeout(id);
  }, [importToast]);

  useEffect(() => () => {
    if (importCleanupRef.current) importCleanupRef.current();
  }, []);

  const handleGenerateStarterCanvas = useCallback(() => {
    const selectedTemplate = (templatesList || []).find((t) => t?.id === templateId);
    if (selectedTemplate) {
      requestCanvasContextSwitch({
        contextKey: templateCanvasContextKey(selectedTemplate.id),
        label: selectedTemplate.name || selectedTemplate.id,
        baseLayout: buildTemplateCanvasLayout(selectedTemplate),
      });
      return;
    }
    requestCanvasContextSwitch({
      contextKey: BLANK_CANVAS_CONTEXT_KEY,
      label: 'Page blanche',
      baseLayout: createStarterLayoutV3(),
    });
  }, [templatesList, templateId, requestCanvasContextSwitch, buildTemplateCanvasLayout]);

  const handleAddCanvasPage = useCallback(() => {
    if (!layout || !canAppendBlankPage(layout)) return;
    const next = appendBlankPage(layout);
    commitLayout(next, { groupKey: 'page:add' });
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleRemoveCanvasPage = useCallback((pageIndex) => {
    if (!layout || !Array.isArray(layout.pages) || layout.pages.length <= 1) return;
    const removedPage = layout.pages[pageIndex];
    const selectedWasOnRemovedPage = selectedBlockIds.some(
      (id) => removedPage?.blocks?.some((block) => block?.id === id),
    );
    const next = removePage(layout, pageIndex);
    commitLayout(next, { groupKey: `page:remove:${pageIndex}` });
    if (selectedWasOnRemovedPage) setSelectedBlockIds([]);
    setEditingBlockId(null);
    setImageEditBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockIds, commitLayout, cv, autoSave]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    const found = findBlock(layout, selectedBlockId);
    return found?.block ?? null;
  }, [layout, selectedBlockId]);

  const handleSelectBlock = useCallback((blockId, options = {}) => {
    const { additive = false, replaceIds = null } = options;
    if (replaceIds != null) {
      const ids = [...new Set(replaceIds.filter(Boolean))];
      setSelectedBlockIds(ids);
      const primary = ids.at(-1);
      if (primary && !isCanvasEditHintDismissed()) {
        const found = findBlock(layoutRef.current, primary);
        if (blockSupportsEditHint(found?.block)) setEditHintOpen(true);
      }
      return;
    }
    if (!blockId) {
      setSelectedBlockIds([]);
      return;
    }
    if (additive) {
      setSelectedBlockIds((prev) => (
        prev.includes(blockId) ? prev.filter((id) => id !== blockId) : [...prev, blockId]
      ));
    } else {
      setSelectedBlockIds([blockId]);
    }
    if (!isCanvasEditHintDismissed()) {
      const found = findBlock(layoutRef.current, blockId);
      if (blockSupportsEditHint(found?.block)) setEditHintOpen(true);
    }
  }, []);

  const handleDismissEditHint = useCallback(() => {
    dismissCanvasEditHint();
    setEditHintOpen(false);
  }, []);

  const handleDismissSemanticEditNote = useCallback(() => {
    dismissSemanticEditNote();
    setSemanticEditNoteOpen(false);
  }, []);

  const closeEditHintIfOpen = useCallback(() => {
    if (!editHintOpen) return;
    dismissCanvasEditHint();
    setEditHintOpen(false);
  }, [editHintOpen]);

  const handleBlockPositionChange = useCallback((blockId, pos, commitOptions) => {
    const next = setBlockPosition(layout, blockId, pos);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleBlockMove = useCallback((blockId, pos, targetPageIndex, commitOptions) => {
    const found = findBlock(layout, blockId);
    if (!found?.block) return;
    const ti = typeof targetPageIndex === 'number' ? targetPageIndex : found.pageIndex;
    const next = moveBlockToPage(layout, blockId, ti, pos);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleBlockResizeChange = useCallback((blockId, patch, commitOptions) => {
    const next = updateBlock(layoutRef.current, blockId, patch);
    commitLayout(next, commitOptions);
  }, [commitLayout]);

  const flushAutoHeights = useCallback(() => {
    const pending = autoHeightPendingRef.current;
    if (!pending.size) return;
    let next = layoutRef.current;
    let changed = false;
    for (const [blockId, newHmm] of pending.entries()) {
      const found = findBlock(next, blockId);
      if (!found?.block) continue;
      const cur = found.block.h ?? 0;
      if (Math.abs(newHmm - cur) < 0.4) continue;
      next = updateBlock(next, blockId, { h: newHmm });
      changed = true;
    }
    pending.clear();
    if (!changed) return;
    for (let pi = 0; pi < (next.pages?.length || 0); pi += 1) {
      next = reflowColumnBlocksOnPage(next, pi);
    }
    // `replace` : recalcul de hauteur automatique -> pas une action undo-able
    // distincte (sinon Ctrl+Z annulerait un ajustement, pas un geste user).
    commitLayout(next, { replace: true });
    if (cv) autoSave.schedule(cv);
  }, [commitLayout, cv, autoSave]);

  const handleBlockAutoHeight = useCallback((blockId, newHmm) => {
    if (Date.now() < suppressAutoHeightUntilRef.current) return;
    autoHeightPendingRef.current.set(blockId, newHmm);
    if (autoHeightTimerRef.current) clearTimeout(autoHeightTimerRef.current);
    autoHeightTimerRef.current = setTimeout(() => {
      autoHeightTimerRef.current = null;
      flushAutoHeights();
    }, 120);
  }, [flushAutoHeights]);

  const handleResizeStart = useCallback(() => {
    setCanvasResizing(true);
    suppressAutoHeightUntilRef.current = Date.now() + 2000;
  }, []);

  const handleResizeEnd = useCallback((blockId) => {
    setCanvasResizing(false);
    suppressAutoHeightUntilRef.current = Date.now() + 400;
    if (blockId) {
      const found = findBlock(layoutRef.current, blockId);
      if (found?.block && isAutoHeightBlockType(found.block.type)) {
        autoHeightPendingRef.current.delete(blockId);
      }
    }
  }, []);

  useEffect(() => () => {
    if (autoHeightTimerRef.current) clearTimeout(autoHeightTimerRef.current);
  }, []);

  const handleDragEndPersist = useCallback(() => {
    setCanvasBusy(false);
    if (cv) autoSave.schedule(cv);
  }, [cv, autoSave]);

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
    delete partial.placementMode;
    const next = addBlockToPage(layout, pageIndex, partial);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) setSelectedBlockIds([newId]);
    setPlacementPreset(null);
    if (cv) autoSave.schedule(cv);
  }, [placementPreset, layout, commitLayout, cv, autoSave]);

  const handlePlaceBlockRect = useCallback((pageIndex, rect) => {
    if (!placementPreset) return;
    const partial = {
      ...placementPreset,
      x: rect.x,
      y: rect.y,
      w: Math.max(rect.w, 12),
      h: Math.max(rect.h, 8),
    };
    const enterEdit = partial.type === 'text';
    delete partial.placementMode;
    const next = addBlockToPage(layout, pageIndex, partial);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) {
      setSelectedBlockIds([newId]);
      if (enterEdit) setEditingBlockId(newId);
    }
    setPlacementPreset(null);
    if (cv) autoSave.schedule(cv);
  }, [placementPreset, layout, commitLayout, cv, autoSave]);

  const handleOpenPositionPanel = useCallback(() => {
    setSidebarSection('position');
  }, []);

  const handleOpenFontPanel = useCallback(() => {
    setSidebarSection('fonts');
  }, []);

  const handleOpenColorPanel = useCallback(() => {
    setSidebarSection('colors');
  }, []);

  const handleOpenEffectsPanel = useCallback(() => {
    setSidebarSection('effects');
  }, []);

  const handleOpenShapePanel = useCallback(() => {
    setSidebarSection('shape-style');
  }, []);

  const handleImageEdit = useCallback((blockId) => {
    setSelectedBlockIds([blockId]);
    setImageEditBlockId(blockId);
    setEditingBlockId(null);
    closeEditHintIfOpen();
  }, [closeEditHintIfOpen]);

  const handleApplyCanvasTemplate = useCallback((template) => {
    if (!template) return;
    requestCanvasContextSwitch({
      contextKey: templateCanvasContextKey(template.id),
      label: template.name || template.id,
      baseLayout: buildTemplateCanvasLayout(template),
    });
  }, [requestCanvasContextSwitch, buildTemplateCanvasLayout]);

  const handleBlockContentPatch = useCallback((patch) => {
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
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleNudgeSelectedBlock = useCallback((dx, dy) => {
    if (!selectedBlockId) return;
    const found = findBlock(layout, selectedBlockId);
    if (!found?.block || found.block.locked) return;
    const next = setBlockPosition(layout, selectedBlockId, {
      x: (found.block.x || 0) + dx,
      y: (found.block.y || 0) + dy,
    });
    commitLayout(next, { groupKey: `nudge:${selectedBlockId}` });
    if (cv) autoSave.schedule(cv);
  }, [selectedBlockId, layout, commitLayout, cv, autoSave]);

  const handleDuplicateSelectedBlock = useCallback(() => {
    if (!selectedBlockId) return;
    const next = duplicateBlock(layout, selectedBlockId);
    commitLayout(next, { groupKey: `duplicate:${selectedBlockId}` });
    const found = findBlock(next, selectedBlockId);
    const blocks = next?.pages?.[found?.pageIndex]?.blocks || [];
    const duplicated = blocks[blocks.length - 1];
    if (duplicated?.id) setSelectedBlockIds([duplicated.id]);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleToggleSelectedBlockLock = useCallback(() => {
    if (!selectedBlockId || !selectedBlock) return;
    const next = updateBlock(layout, selectedBlockId, { locked: !selectedBlock.locked });
    commitLayout(next, { groupKey: `lock:${selectedBlockId}` });
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, selectedBlock, commitLayout, cv, autoSave]);

  const handleStartBlockEdit = useCallback((blockId) => {
    setSelectedBlockIds([blockId]);
    setEditingBlockId(blockId);
    closeEditHintIfOpen();
  }, [closeEditHintIfOpen]);

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
      if (isSemanticBlockType(block.type) && !isSemanticEditNoteDismissed()) {
        setSemanticEditNoteOpen(true);
      }
    }
    setEditingBlockId(null);
  }, [layout, cv, commitLayout, handleCvChange]);

  const handleOptimizeAtsLayout = useCallback(() => {
    if (!layout) return;
    const next = applyAtsLayoutOptimizations(layout);
    if (sameLayout(layout, next)) {
      setAtsOptimizeMessage('Layout deja optimise pour la lecture ATS.');
      return;
    }
    commitLayout(next, { groupKey: 'ats:optimize' });
    setAtsOptimizeMessage('Optimisation appliquee : contenu devant, bandeaux derriere. Ctrl+Z pour annuler.');
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  useEffect(() => {
    if (!atsOptimizeMessage) return undefined;
    const id = setTimeout(() => setAtsOptimizeMessage(''), 4500);
    return () => clearTimeout(id);
  }, [atsOptimizeMessage]);

  const handleExportLayoutPdf = useCallback(async () => {
    if (!cv || !layout || pdfExporting) return;
    setPdfExporting(true);
    setPdfExportError('');
    const preopenedWindow = prepareAppleDownloadWindow();
    try {
      const { blob, filename } = await apiPostBlob('/api/pdf', {
        cv,
        template_id: templateId,
        layout,
      });
      await saveBlobWithPreferredMethod(
        blob,
        filename || buildCanvasPdfFilename(cv),
        { preopenedWindow },
      );
    } catch (err) {
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      console.error('[cv-editor-beta] export PDF layout', err);
      setPdfExportError(`${err?.message || 'Impossible de telecharger le PDF.'}${getDownloadPermissionHint()}`);
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
    setSelectedBlockIds([]);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  const handleConfirmTransfer = useCallback(({ rememberChoice = false } = {}) => {
    if (!transferRequest) return;
    if (rememberChoice) setCanvasDraftPrefs({ showTransferPrompt: false });
    const merged = mergeTransferredBlocks(
      transferRequest.targetLayout || layoutRef.current,
      transferRequest.candidates,
    );
    if (transferRequest.mode === 'switch') {
      openCanvasContext(transferRequest.contextKey, merged);
    } else {
      resetLayout(merged);
      saveCanvasDraft(activeLayoutContextKey, merged, {
        label: canvasContextLabel(activeLayoutContextKey, templatesList),
      });
      refreshCanvasDrafts();
      if (cv) autoSave.schedule(cv);
    }
    setTransferRequest(null);
  }, [
    transferRequest,
    openCanvasContext,
    resetLayout,
    activeLayoutContextKey,
    templatesList,
    refreshCanvasDrafts,
    cv,
    autoSave,
  ]);

  const handleIgnoreTransfer = useCallback(({ rememberChoice = false } = {}) => {
    if (!transferRequest) return;
    if (rememberChoice) setCanvasDraftPrefs({ showTransferPrompt: false });
    if (transferRequest.mode === 'switch') {
      openCanvasContext(transferRequest.contextKey, transferRequest.targetLayout);
    }
    setTransferRequest(null);
  }, [transferRequest, openCanvasContext]);

  const handleCancelTransfer = useCallback(() => {
    setTransferRequest(null);
  }, []);

  const handleOpenTransferFromDraft = useCallback((sourceContextKey) => {
    if (!sourceContextKey || sourceContextKey === activeLayoutContextKey) return;
    saveCurrentCanvasDraft();
    const source = loadCanvasDraft(sourceContextKey);
    if (!source?.layout) return;
    const candidates = detectTransferCandidates(source.layout, layoutRef.current);
    if (!candidates.length) return;
    setTransferRequest({
      mode: 'manual',
      contextKey: activeLayoutContextKey,
      label: canvasContextLabel(sourceContextKey, templatesList),
      targetLayout: layoutRef.current,
      candidates,
    });
  }, [activeLayoutContextKey, templatesList, saveCurrentCanvasDraft]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (document.activeElement?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const pages = layoutRef.current?.pages;
        if (!Array.isArray(pages) || !pages.length) return;
        e.preventDefault();
        const allIds = pages.flatMap((p) => (
          Array.isArray(p?.blocks) ? p.blocks.map((b) => b?.id).filter(Boolean) : []
        ));
        setSelectedBlockIds(allIds);
        return;
      }
      // Toutes les actions clavier ci-dessous opèrent sur le bloc sélectionné,
      // hors mode édition de texte inline.
      if (!selectedBlockId || editingBlockId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelectedBlock();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedBlockIds([]);
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      handleNudgeSelectedBlock(dx, dy);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBlockId, editingBlockId, handleDeleteSelectedBlock, handleNudgeSelectedBlock, layout]);

  if (loading) {
    return (
      <div className="cv-editor-beta cv-editor-beta--loading">
        <p>Chargement du CV…</p>
      </div>
    );
  }

  if (profileLoadError) {
    return (
      <div className="cv-editor-beta cv-editor-beta--load-error" role="alertdialog" aria-modal="true" aria-labelledby="cv-beta-load-err-title">
        <div className="cv-editor-beta-load-error-card">
          <h2 id="cv-beta-load-err-title">Profil inaccessible</h2>
          <p>{profileLoadError}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setProfileLoadAttempt((k) => k + 1)}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!cv) {
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
        </div>
        <div className="cv-editor-beta-topbar-right">
          <button
            type="button"
            className="cv-editor-beta-history-btn cv-editor-beta-import-btn"
            onClick={() => {
              setImportError('');
              setImportModalOpen(true);
            }}
            disabled={loading || importLoading}
            title="Importer un CV PDF/Word et générer la mise en page Canva"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {importLoading ? 'Import…' : 'Importer CV'}
          </button>
          <AutoSaveIndicator state={autoSave.state} onRetry={handleRetry} />
          <EditorAtsScoreBadge
            layout={layout}
            cv={cv}
            paused={canvasBusy}
          />
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
            title="Télécharger le CV Canva en PDF"
          >
            {pdfExporting ? 'Téléchargement…' : 'Télécharger'}
          </button>
        </div>
      </header>

      {loadError && (
        <div className="cv-editor-beta-error" role="alert">
          {loadError}
        </div>
      )}
      {pdfExportError && (
        <div className="cv-editor-beta-error" role="alert">
          {pdfExportError}
        </div>
      )}
      {atsOptimizeMessage && (
        <div className="cv-editor-beta-info" role="status">
          {atsOptimizeMessage}
        </div>
      )}

      <div className="cv-editor-beta-subchrome">
        {editHintOpen && selectedBlock && blockSupportsEditHint(selectedBlock) && (
          <div className="cv-editor-beta-edit-hint" role="status" aria-live="polite">
            <span className="cv-editor-beta-edit-hint__text">
              {editHintMessageForBlock(selectedBlock)}
            </span>
            <button
              type="button"
              className="cv-editor-beta-edit-hint__dismiss"
              onClick={handleDismissEditHint}
            >
              Compris
            </button>
          </div>
        )}
        {semanticEditNoteOpen && (
          <div className="cv-editor-beta-semantic-note" role="status" aria-live="polite">
            <span className="cv-editor-beta-semantic-note__text">
              Les modifications sur ce bloc mettent à jour ton CV de base (partagé avec le mode Stable).
            </span>
            <button
              type="button"
              className="cv-editor-beta-semantic-note__dismiss"
              onClick={handleDismissSemanticEditNote}
            >
              Compris
            </button>
          </div>
        )}
      </div>

      <div className="cv-editor-beta-workspace cv-editor-beta-workspace--canva">
        <EditorCanvaSidebar
          disabled={loading || !layout}
          openSection={sidebarSection}
          onOpenSectionChange={setSidebarSection}
          placementActive={Boolean(placementPreset)}
          layout={layout}
          selectedBlockId={selectedBlockId}
          selectedBlock={selectedBlock}
          onBlockStylePatch={handleBlockStylePatch}
          templatesList={templatesList}
          canvasDrafts={canvasDrafts}
          activeCanvasDraftKey={activeLayoutContextKey}
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
          onOpenTransferFromDraft={handleOpenTransferFromDraft}
        />
        <div className="cv-editor-beta-canva-column">
          <div className="cv-editor-beta-format-dock" role="presentation">
            <div className="cv-editor-beta-format-slot">
              {selectedBlock && blockSupportsStyleToolbar(selectedBlock.type) && (
                <EditorFloatingTextToolbar
                  block={selectedBlock}
                  isEditing={editingBlockId === selectedBlock.id}
                  onBlockStylePatch={handleBlockStylePatch}
                  onBlockContentPatch={handleBlockContentPatch}
                  onOpenFontPanel={handleOpenFontPanel}
                  onOpenColorPanel={handleOpenColorPanel}
                  onOpenEffectsPanel={handleOpenEffectsPanel}
                  onOpenShapePanel={handleOpenShapePanel}
                  onOpenPositionPanel={handleOpenPositionPanel}
                />
              )}
            </div>
          </div>
          <main className="cv-editor-beta-canvas">
            <FreeCanvas
              layout={layout}
              cv={cv}
              selectedBlockId={selectedBlockId}
              selectedBlockIds={selectedBlockIds}
              editingBlockId={editingBlockId}
              showGrid={showCanvasGrid}
              snapEnabled={canvasSnapEnabled}
              placementPreset={placementPreset}
              onPlaceBlockAt={handlePlaceBlockAt}
              onPlaceBlockRect={handlePlaceBlockRect}
              onCancelPlacement={handleCancelPlacement}
              onSelectBlock={handleSelectBlock}
              onBlockPositionChange={handleBlockPositionChange}
              onBlockMove={handleBlockMove}
              onBlockResizeChange={handleBlockResizeChange}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
              suppressAutoHeight={canvasResizing}
              onDragEnd={handleDragEndPersist}
              onCanvasInteractionChange={setCanvasBusy}
              onStartBlockEdit={handleStartBlockEdit}
              onCommitBlockEdit={handleCommitBlockEdit}
              onImageEdit={handleImageEdit}
              onSelectedBlockRect={setSelectedBlockRect}
              onBlockAutoHeight={handleBlockAutoHeight}
              onAddPage={handleAddCanvasPage}
              onRemovePage={handleRemoveCanvasPage}
            />
            {importToast && (
              <div className="cv-editor-beta-import-toast" role="status">
                Canvas généré - {importToast}
              </div>
            )}
            {startupPromptOpen && (
              <section className="cv-editor-beta-start-panel" aria-label="Demarrer le canvas">
                <span className="cv-editor-beta-start-panel__eyebrow">Démarrer en Beta</span>
                <h2>Importez ou générez votre CV visuel</h2>
                <p>
                  Importez un PDF/Word pour voir instantanément une mise en page Canva
                  adaptée à votre profil, ou générez depuis les données déjà enregistrées.
                </p>
                <div className="cv-editor-beta-start-panel__actions">
                  <button
                    type="button"
                    className="cv-editor-beta-start-panel__import"
                    onClick={() => {
                      setImportError('');
                      setImportModalOpen(true);
                    }}
                  >
                    Importer mon CV
                  </button>
                  <button
                    type="button"
                    className="cv-editor-beta-start-panel__primary"
                    onClick={handleGenerateStarterCanvas}
                  >
                    Générer depuis mon profil
                  </button>
                  <button
                    type="button"
                    className="cv-editor-beta-start-panel__secondary"
                    onClick={handlePickBlankCanvas}
                  >
                    Page blanche
                  </button>
                </div>
                <p className="cv-editor-beta-start-panel__hint">
                  L&apos;import analyse sections, densité et choisit un template - blocs
                  redimensionnés et vides masqués automatiquement.
                </p>
              </section>
            )}
            {transferRequest && (
              <EditorCanvaTransferModal
                request={transferRequest}
                onConfirm={handleConfirmTransfer}
                onIgnore={handleIgnoreTransfer}
                onCancel={handleCancelTransfer}
              />
            )}
            {selectedBlock
              && selectedBlockRect
              && !editingBlockId && (
              <EditorBlockChromeToolbar
                block={selectedBlock}
                anchorRect={selectedBlockRect}
                locked={Boolean(selectedBlock.locked)}
                onDelete={handleDeleteSelectedBlock}
                onDuplicate={handleDuplicateSelectedBlock}
                onToggleLock={handleToggleSelectedBlockLock}
                onMoreMenu={() => {}}
              />
            )}
            {imageEditBlockId && (selectedBlock?.type === 'image' || selectedBlock?.type === 'photo') && (
              <EditorImageEditPopover
                block={selectedBlock}
                cv={cv}
                onBlockStylePatch={handleBlockStylePatch}
                onClose={() => setImageEditBlockId(null)}
              />
            )}
          </main>
        </div>
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>Canvas libre · double-clic pour éditer · glisser pour sélectionner · Ctrl+A tout sélectionner</span>
      </footer>

      <EditorCvImportModal
        open={importModalOpen}
        onClose={() => {
          if (!importLoading) setImportModalOpen(false);
        }}
        onImportFile={handleImportFile}
        onImportText={handleImportText}
        loading={importLoading}
        error={importError}
      />

      {importLoading && (
        <CvImportLoadingOverlay
          stepIndex={importStepIndex}
          title="Import & adaptation Canva en cours"
          subtitle="Analyse en cours — cela peut prendre jusqu'à une minute pour un PDF complexe."
        />
      )}

    </div>
  );
}

export default CvEditorBeta;
