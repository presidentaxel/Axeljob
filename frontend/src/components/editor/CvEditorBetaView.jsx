import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiGet, apiPostBlob, apiPut } from '../../api';
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
} from '../../lib/cvLayoutModelV3.js';
import { reflowColumnBlocksOnPage } from '../../lib/layoutReflow.js';
import { moveBlockToPage } from '../../lib/canvasPageTransfer.js';
import { useAutoSave } from '../../lib/useAutoSave.js';
import { useLayoutHistory } from '../../lib/useLayoutHistory.js';
import FreeCanvas from './FreeCanvas.jsx';

import AutoSaveIndicator from './AutoSaveIndicator.jsx';
import EditorAtsScoreBadge from './EditorAtsScoreBadge.jsx';
import EditorCanvaSidebar from './EditorCanvaSidebar.jsx';
import EditorFloatingTextToolbar from './EditorFloatingTextToolbar.jsx';
import EditorImageEditPopover from './EditorImageEditPopover.jsx';
import EditorCanvaTransferModal from './EditorCanvaTransferModal.jsx';

import '../../styles/CvEditorBeta.css';
import '../../styles/EditorCanvaSidebar.css';
import '../../styles/EditorInspector.css';

/**
 * Editeur de CV Beta — canvas libre uniquement (L3).
 */

function cvHasMeaningfulContent(cv) {
  if (!cv || typeof cv !== 'object') return false;
  const scalarKeys = [
    'prenom',
    'nom',
    'email',
    'telephone',
    'linkedin',
    'titre_professionnel',
    'resume',
  ];
  if (scalarKeys.some((key) => String(cv[key] || '').trim())) return true;
  return ['experiences', 'formations', 'certifications', 'projets'].some(
    (key) => Array.isArray(cv[key]) && cv[key].length > 0,
  ) || Boolean(
    cv.competences
    && typeof cv.competences === 'object'
    && Object.values(cv.competences).some((value) => (
      Array.isArray(value) ? value.length > 0 : String(value || '').trim()
    )),
  );
}

function sameLayout(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

function cleanFilenamePart(value) {
  return String(value || '')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCanvasPdfFilename(cv) {
  const identity = [cv?.prenom, cv?.nom].map(cleanFilenamePart).filter(Boolean).join(' ');
  const title = cleanFilenamePart(cv?.titre_professionnel);
  const parts = ['CV', identity, title].filter(Boolean);
  return `${parts.join(' - ') || 'CV'}.pdf`;
}

function CvEditorBeta({
  session: _session,
  templateId,
  templateOptions,
  templatesList,
  onTemplateIdChange: _onTemplateIdChange,
  onTemplateOptionsChange: _onTemplateOptionsChange,
}) {
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
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

  const handleLayoutHistoryChange = useCallback(() => {
    if (cv) autoSaveRef.current?.schedule(cv);
  }, [cv]);

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
    const body = {
      ...payload,
      template_id: templateId,
      template_options: templateOptions,
    };
    if (layout) body.layout = isEmptyLayoutV3(layout) ? null : layout;
    return apiPut('/api/cv', body);
  }, [templateId, templateOptions, layout]);

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
    if (!layout) return undefined;
    const id = setTimeout(() => {
      saveCanvasDraft(activeLayoutContextKey, layout, {
        label: canvasContextLabel(activeLayoutContextKey, templatesList),
      });
      refreshCanvasDrafts();
    }, 250);
    return () => clearTimeout(id);
  }, [layout, activeLayoutContextKey, templatesList, refreshCanvasDrafts]);

  const openCanvasContext = useCallback((contextKey, nextLayout) => {
    const hydrated = migrateLayoutToV3(nextLayout || createCanvasLayoutBlank());
    resetLayout(hydrated);
    setSelectedBlockId(null);
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
    setLoadError(null);
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
        setActiveLayoutContextKey(contextKey);
        setActiveCanvasContext(contextKey);
        if (rawLayout) {
          saveCanvasDraft(contextKey, hydratedLayout, {
            label: canvasContextLabel(contextKey, templatesList),
          });
          refreshCanvasDrafts();
        }
        resetLayout(hydratedLayout);
        setStartupPromptOpen(!rawLayout && cvHasMeaningfulContent(mergedCv));
        setLoading(false);
      })
      .catch((err) => {
        if (aborted) return;
        setLoadError(err?.message || 'Impossible de charger le CV');
        const baseCv = typeof defaultCv === 'function' ? defaultCv() : defaultCv;
        setCv({ ...baseCv });
        setActiveLayoutContextKey(BLANK_CANVAS_CONTEXT_KEY);
        setActiveCanvasContext(BLANK_CANVAS_CONTEXT_KEY);
        resetLayout(createBlankLayoutV3());
        setStartupPromptOpen(false);
        setLoading(false);
      });
    return () => { aborted = true; };
  }, [resetLayout, templatesList, refreshCanvasDrafts]);

  const handleCvChange = useCallback((nextCv) => {
    setCv(nextCv);
    autoSave.schedule(nextCv);
  }, [autoSave]);

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
    setSelectedBlockId(null);
    setEditingBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleRemoveCanvasPage = useCallback((pageIndex) => {
    if (!layout || !Array.isArray(layout.pages) || layout.pages.length <= 1) return;
    const removedPage = layout.pages[pageIndex];
    const selectedWasOnRemovedPage = Boolean(
      selectedBlockId
      && removedPage?.blocks?.some((block) => block?.id === selectedBlockId),
    );
    const next = removePage(layout, pageIndex);
    commitLayout(next, { groupKey: `page:remove:${pageIndex}` });
    if (selectedWasOnRemovedPage) setSelectedBlockId(null);
    setEditingBlockId(null);
    setImageEditBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    const found = findBlock(layout, selectedBlockId);
    return found?.block ?? null;
  }, [layout, selectedBlockId]);

  const handleSelectBlock = useCallback((blockId) => {
    setSelectedBlockId(blockId);
  }, []);

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
    commitLayout(next, { groupKey: 'autoheight' });
  }, [commitLayout]);

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

  const handleImageEdit = useCallback((blockId) => {
    setSelectedBlockId(blockId);
    setImageEditBlockId(blockId);
    setEditingBlockId(null);
  }, []);

  const handleApplyCanvasTemplate = useCallback((template) => {
    if (!template) return;
    requestCanvasContextSwitch({
      contextKey: templateCanvasContextKey(template.id),
      label: template.name || template.id,
      baseLayout: buildTemplateCanvasLayout(template),
    });
  }, [requestCanvasContextSwitch, buildTemplateCanvasLayout]);

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

  const handleDuplicateSelectedBlock = useCallback(() => {
    if (!selectedBlockId) return;
    const next = duplicateBlock(layout, selectedBlockId);
    commitLayout(next, { groupKey: `duplicate:${selectedBlockId}` });
    const found = findBlock(next, selectedBlockId);
    const blocks = next?.pages?.[found?.pageIndex]?.blocks || [];
    const duplicated = blocks[blocks.length - 1];
    if (duplicated?.id) setSelectedBlockId(duplicated.id);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, commitLayout, cv, autoSave]);

  const handleToggleSelectedBlockLock = useCallback(() => {
    if (!selectedBlockId || !selectedBlock) return;
    const next = updateBlock(layout, selectedBlockId, { locked: !selectedBlock.locked });
    commitLayout(next, { groupKey: `lock:${selectedBlockId}` });
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockId, selectedBlock, commitLayout, cv, autoSave]);

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
    try {
      const { blob } = await apiPostBlob('/api/pdf', {
        cv,
        template_id: templateId,
        layout,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildCanvasPdfFilename(cv);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[cv-editor-beta] export PDF layout', err);
      setPdfExportError(err?.message || 'Impossible de telecharger le PDF.');
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
  }, [selectedBlockId, editingBlockId, handleDeleteSelectedBlock]);

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

      <div className="cv-editor-beta-workspace cv-editor-beta-workspace--canva">
        <EditorCanvaSidebar
          disabled={loading || !layout}
          openSection={sidebarSection}
          onOpenSectionChange={setSidebarSection}
          placementActive={Boolean(placementPreset)}
          layout={layout}
          selectedBlockId={selectedBlockId}
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
          <main className="cv-editor-beta-canvas">
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
            {startupPromptOpen && (
              <section className="cv-editor-beta-start-panel" aria-label="Demarrer le canvas">
                <span className="cv-editor-beta-start-panel__eyebrow">Votre profil est pret</span>
                <h2>Choisissez comment demarrer votre CV visuel</h2>
                <p>
                  Votre contenu existe deja. Vous pouvez generer une mise en page
                  propre pour commencer, ou partir d'une page blanche si vous voulez
                  composer librement.
                </p>
                <div className="cv-editor-beta-start-panel__actions">
                  <button
                    type="button"
                    className="cv-editor-beta-start-panel__primary"
                    onClick={handleGenerateStarterCanvas}
                  >
                    Generer depuis mon profil
                  </button>
                  <button
                    type="button"
                    className="cv-editor-beta-start-panel__secondary"
                    onClick={handlePickBlankCanvas}
                  >
                    Partir d'une page blanche
                  </button>
                </div>
                <p className="cv-editor-beta-start-panel__hint">
                  Conseil : commencez par une mise en page generee, puis personnalisez.
                  Le score ATS vous indiquera les risques.
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
            {selectedBlock && blockSupportsStyleToolbar(selectedBlock.type) && (
              <EditorFloatingTextToolbar
                block={selectedBlock}
                isEditing={editingBlockId === selectedBlock.id}
                onBlockStylePatch={handleBlockStylePatch}
                onOpenPositionPanel={handleOpenPositionPanel}
                onDuplicateBlock={handleDuplicateSelectedBlock}
                onToggleLockBlock={handleToggleSelectedBlockLock}
                onDeleteBlock={handleDeleteSelectedBlock}
              />
            )}
            {imageEditBlockId && (selectedBlock?.type === 'image' || selectedBlock?.type === 'photo') && selectedBlockRect && (
              <EditorImageEditPopover
                block={selectedBlock}
                cv={cv}
                theme={layout?.theme}
                anchorRect={selectedBlockRect}
                onBlockPatch={handleBlockPatch}
                onBlockStylePatch={handleBlockStylePatch}
                onClose={() => setImageEditBlockId(null)}
              />
            )}
          </main>
        </div>
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>Canvas libre · double-clic pour éditer · sidebar Canva · Ctrl+Z</span>
      </footer>
    </div>
  );
}

export default CvEditorBeta;
