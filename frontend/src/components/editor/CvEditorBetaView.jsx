import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  apiGet,
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
  buildAdaptedCanvasLayoutForCv,
  countContentBlocks,
  ensureImportLayoutHasContent,
  recommendTemplateLabel,
  resolveImportPersistTemplateId,
  summarizeImportAdaptation,
} from '../../lib/canvasCvImportAdapter.js';
import { buildImportLayoutVariants } from '../../lib/importLayoutVariants.js';
import { scoreImportLayoutVariants } from '../../lib/scoreImportLayoutVariants.js';
import {
  defaultImportVariantId,
  importChooserToastMessage,
  mergeBuiltAndScoredVariants,
  resolveImportVariant,
  sortImportVariantsForChooser,
} from '../../lib/importLayoutChooser.js';
import EditorImportLayoutChooserModal from './EditorImportLayoutChooserModal.jsx';
import '../../styles/EditorImportLayoutChooserModal.css';
import {
  applyCvFieldsFromRoot,
  readBlockContentFromRoot,
} from '../../lib/canvasInlineEdit.js';
import {
  applyIdentitySyncPatch,
  suggestFreeformCvSync,
} from '../../lib/freeCanvasIdentitySync.js';
import { syncCvDualKeys } from '../../lib/cvDualKey.js';
import { resolveCanvasImageSrcForLayout } from '../../lib/uploadCanvasAsset.js';
import {
  applyAtsLayoutOptimizations,
  describeAtsOptimizationChanges,
} from '../../lib/atsLayoutOptimize.js';
import { fetchAtsScoreParsing } from '../../lib/atsScoreClient.js';
import { formatAtsScoreImpact } from '../../lib/atsCoachFixes.js';
import { saveLayoutProposal } from '../../lib/layoutProposalsStorage.js';
import {
  BLANK_CANVAS_CONTEXT_KEY,
  IMPORTED_CANVAS_CONTEXT_KEY,
  canvasContextLabel,
  clearCanvasDraft,
  getActiveCanvasContext,
  listCanvasDrafts,
  loadCanvasDraft,
  saveCanvasDraft,
  setActiveCanvasContext,
  setCanvasDraftPrefs,
  templateCanvasContextKey,
} from '../../lib/canvasLayoutDrafts.js';
import { resolveTemplateContextLayout } from '../../lib/canvasTemplateRestore.js';
import {
  detectTransferCandidates,
  mergeTransferredBlocks,
} from '../../lib/canvasLayoutTransfer.js';
import { defaultCv } from '../../data/cvDefault';
import { blockSupportsStyleToolbar } from '../../lib/canvasBlockToolbar.js';
import { buildCanvasFontFamilies } from '../../lib/canvasFontOptions.js';
import { selectAllInEditableRoot, clearDocumentTextSelection, toggleTextCaseOnBlockContent } from '../../lib/canvasRichTextFormat.js';
import { getLastBlockIdOnPage, createImageBlockPreset } from '../../lib/freeCanvasBlockPresets.js';
import { placementPartialAtPoint } from '../../lib/canvasSidebarPlacement.js';
import { addUserCanvasImage } from '../../lib/canvasImageLibrary.js';
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
  duplicateBlocks,
  findBlock,
  isEmptyLayoutV3,
  layoutPayloadForPersist,
  migrateLayoutToV3,
  moveBlocksBy,
  removeBlocks,
  removePage,
  reorderBlocksZOrder,
  sendToBack,
  setBlockPosition,
  setBlocksPositionFromPrimary,
  swapBlockZWithAdjacent,
  updateBlock,
  updateBlocksStyle,
  isAutoHeightBlockType,
  isSemanticBlockType,
} from '../../lib/cvLayoutModelV3.js';
import { isAtsSafe, sortTemplatesForEditor } from '../../lib/editorTemplateUtils.js';
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
import DesignModeBridgeModal from './DesignModeBridgeModal.jsx';
import DocxExportNoticeModal from './DocxExportNoticeModal.jsx';
import EditorCvImportModal from './EditorCvImportModal.jsx';
import EditorOnboardingTour from './EditorOnboardingTour.jsx';
import HeaderComposerModal from './HeaderComposerModal.jsx';
import SectionComposerModal from './SectionComposerModal.jsx';
import {
  applyStableDesignToCanvas,
  buildStableToBetaOffer,
  canBuildCanvasForTemplate,
  resolveTemplateFromList,
} from '../../lib/designModeBridge.js';
import {
  applyHeaderComposerToLayout,
  mergeHeaderComposerCv,
} from '../../lib/headerComposerPresets.js';
import {
  applySectionComposerToLayout,
  mergeSectionComposerCv,
} from '../../lib/sectionComposerPresets.js';
import '../../styles/HeaderComposerModal.css';

import {
  sameLayout,
  blockSupportsEditHint,
  dismissCanvasEditHint,
  dismissSemanticEditNote,
  editHintMessageForBlock,
  isCanvasEditHintDismissed,
  isSemanticEditNoteDismissed,
} from '../../lib/canvasEditorUtils.js';
import {
  CANVAS_EXPORT_FORMATS,
  buildCanvasExportFilename,
  dismissDocxFidelityNotice,
  formatCanvasExportError,
  isDocxFidelityNoticeDismissed,
} from '../../lib/canvasExportFormats.js';
import {
  dismissEditorOnboarding,
  isEditorOnboardingDismissed,
  shouldShowEditorOnboarding,
} from '../../lib/editorOnboarding.js';
import {
  listNonFaithfulBlocks,
  summarizeNonFaithfulBlocks,
} from '../../lib/canvasPdfFidelity.js';
import {
  canvasNudgeDeltaFromKey,
  CANVAS_DESKTOP_LAYOUT_MQ,
  dismissCanvasDesktopHint,
  isCanvasDesktopHintDismissed,
  isCanvasTypingTarget,
} from '../../lib/freeCanvasSelection.js';

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
  onSaveSuccess,
  isActive = true,
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
  const [sidebarSection, setSidebarSection] = useState('sections');
  const [headerComposerOpen, setHeaderComposerOpen] = useState(false);
  const [sectionComposerType, setSectionComposerType] = useState(null);
  const [placementPreset, setPlacementPreset] = useState(null);
  const [startupPromptOpen, setStartupPromptOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => isEditorOnboardingDismissed());
  const [pdfExportError, setPdfExportError] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [docxNoticeOpen, setDocxNoticeOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [atsOptimizeMessage, setAtsOptimizeMessage] = useState('');
  const [atsOptimizePreview, setAtsOptimizePreview] = useState(null);
  const [atsOptimizePreviewLoading, setAtsOptimizePreviewLoading] = useState(false);
  /** Layout post-apply : Annuler n'est visible que tant que le canvas === ce snapshot. */
  const [atsOptimizeUndoAfter, setAtsOptimizeUndoAfter] = useState(null);
  const atsOptimizePreviewReqRef = useRef(0);
  const atsOptimizeWrapRef = useRef(null);
  const atsOptimizePanelRef = useRef(null);
  const [atsOptimizePanelPos, setAtsOptimizePanelPos] = useState({ top: 0, right: 12 });
  const autoHeightPendingRef = useRef(new Map());
  const autoHeightTimerRef = useRef(null);
  const suppressAutoHeightUntilRef = useRef(0);
  const [canvasResizing, setCanvasResizing] = useState(false);
  const layoutRef = useRef(null);
  const autoSaveRef = useRef(null);
  const [activeLayoutContextKey, setActiveLayoutContextKey] = useState(() => getActiveCanvasContext());
  const [canvasDrafts, setCanvasDrafts] = useState(() => listCanvasDrafts(templatesList));
  const [transferRequest, setTransferRequest] = useState(null);
  const [designBridgeOffer, setDesignBridgeOffer] = useState(null);
  const [designBridgeConfirming, setDesignBridgeConfirming] = useState(false);
  const [designBridgeError, setDesignBridgeError] = useState('');
  const profileTemplateIdRef = useRef('');
  const designBridgeSeededRef = useRef(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importChooser, setImportChooser] = useState(null);
  const [importChooserConfirming, setImportChooserConfirming] = useState(false);
  const [importStepIndex, setImportStepIndex] = useState(0);
  const [importError, setImportError] = useState('');
  const [importToast, setImportToast] = useState('');
  const [editHintOpen, setEditHintOpen] = useState(false);
  const [semanticEditNoteOpen, setSemanticEditNoteOpen] = useState(false);
  /** Hint discret AXE-339 : freeform ressemble à identité/contact. */
  const [identitySyncHint, setIdentitySyncHint] = useState(null);
  const [narrowViewport, setNarrowViewport] = useState(false);
  const [desktopHintDismissed, setDesktopHintDismissed] = useState(() => isCanvasDesktopHintDismissed());
  const importCleanupRef = useRef(null);
  const blocksClipboardRef = useRef([]);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const templatesListRef = useRef(templatesList);
  const templateIdRef = useRef(templateId);
  const blockHistoryShortcutsRef = useRef(false);

  useLayoutEffect(() => {
    templatesListRef.current = templatesList;
  }, [templatesList]);

  useLayoutEffect(() => {
    templateIdRef.current = templateId;
  }, [templateId]);

  useLayoutEffect(() => {
    blockHistoryShortcutsRef.current = Boolean(editingBlockId);
  }, [editingBlockId]);

  const handleLayoutHistoryChange = useCallback((newLayout, action) => {
    if (action === 'undo' || action === 'redo') {
      setSelectedBlockIds((prev) => prev.filter((id) => findBlock(newLayout, id)));
      setEditingBlockId((prev) => (prev && findBlock(newLayout, prev) ? prev : null));
      setImageEditBlockId((prev) => (prev && findBlock(newLayout, prev) ? prev : null));
      setSelectedBlockRect(null);
    }
    if (!cv || profileLoadError) return;
    // Inclure le layout post-undo/redo : layoutRef peut encore être l’ancien
    // jusqu’au prochain render (AXE-29).
    autoSaveRef.current?.schedule({ ...cv, layout: newLayout });
  }, [cv, profileLoadError]);

  const layoutHistory = useLayoutHistory(() => createBlankLayoutV3(), {
    keyboardShortcuts: true,
    onHistoryChange: handleLayoutHistoryChange,
    blockShortcutsRef: blockHistoryShortcutsRef,
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

  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const canvasFontFamilies = useMemo(() => buildCanvasFontFamilies(layout), [layout]);

  const pdfFidelityIssues = useMemo(
    () => listNonFaithfulBlocks(layout, cv),
    [layout, cv],
  );
  const pdfFidelitySummary = useMemo(
    () => summarizeNonFaithfulBlocks(pdfFidelityIssues),
    [pdfFidelityIssues],
  );

  const clearCanvasSelection = useCallback(() => {
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    setImageEditBlockId(null);
    setSelectedBlockRect(null);
  }, []);

  const saveFn = useCallback(async (payload) => {
    if (!payload || profileLoadError) {
      throw new Error('Profil non chargé - réessayez.');
    }
    const body = {
      ...payload,
      template_id: payload.template_id ?? templateId,
      template_options: payload.template_options ?? templateOptions,
    };
    const layoutToSave = payload.layout !== undefined ? payload.layout : layoutRef.current;
    if (layoutToSave !== undefined) {
      body.layout = layoutPayloadForPersist(layoutToSave);
    }
    return apiPut('/api/cv', body);
  }, [templateId, templateOptions, profileLoadError]);

  const autoSave = useAutoSave({
    saveFn,
    saveFnKey: `${templateId}|${JSON.stringify(templateOptions || {})}`,
    isActive,
  });
  useLayoutEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

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
    layoutRef.current = hydrated;
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
    if (cv) {
      const payload = { ...cv, layout: layoutPayloadForPersist(hydrated) };
      autoSave.schedule(payload);
      // Flush immédiat pour Page blanche / génération (AXE-28) — ne pas
      // dépendre du debounce avant une navigation.
      void autoSave.flush();
    }
  }, [resetLayout, templatesList, refreshCanvasDrafts, cv, autoSave]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setProfileLoadError(null);
    designBridgeSeededRef.current = false;
    setDesignBridgeOffer(null);
    setDesignBridgeError('');
    apiGet('/api/cv?profile=1')
      .then((data) => {
        if (aborted) return;
        const incoming = data && typeof data === 'object' ? data : {};
        const { layout: rawLayout, ...cvPayload } = incoming;
        const baseCv = typeof defaultCv === 'function' ? defaultCv() : defaultCv;
        const mergedCv = { ...baseCv, ...cvPayload };
        setCv(mergedCv);
        // Source de vérité pour le pont : template du profil API (pas localStorage).
        profileTemplateIdRef.current = String(mergedCv.template_id || '').trim();
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

  // Libellés des brouillons locaux quand la liste templates arrive (async) -
  // sans re-fetch ni reset du layout en cours (fix B).
  useEffect(() => {
    if (loading || profileLoadError || !cv) return;
    setCanvasDrafts(listCanvasDrafts(templatesList));
  }, [templatesList, loading, profileLoadError, cv]);

  // Recompute l’offre Stable→Beta quand templatesList arrive (souvent après le GET cv).
  useEffect(() => {
    if (loading || profileLoadError || !cv) return;
    if (!Array.isArray(templatesList) || templatesList.length === 0) return;
    if (designBridgeSeededRef.current) return;
    const tid = String(
      profileTemplateIdRef.current || cv.template_id || templateId || '',
    ).trim();
    const offer = buildStableToBetaOffer(layoutRef.current, tid, templatesList);
    designBridgeSeededRef.current = true;
    setDesignBridgeOffer(offer);
  }, [loading, profileLoadError, cv, templatesList, templateId]);

  // Si le canvas n’est plus vide (import / générer / template), retirer l’offre stale.
  useEffect(() => {
    if (!designBridgeOffer || designBridgeOffer.direction !== 'stable_to_beta') return;
    if (isEmptyLayoutV3(layout)) return;
    setDesignBridgeOffer(null);
    setDesignBridgeError('');
  }, [layout, designBridgeOffer]);

  const handleCvChange = useCallback((nextCv) => {
    if (profileLoadError || !nextCv) return;
    const synced = syncCvDualKeys(nextCv);
    setCv(synced);
    autoSave.schedule(synced);
  }, [autoSave, profileLoadError]);

  const handleRetry = useCallback(() => {
    autoSave.flush();
  }, [autoSave]);

  const handlePickBlankCanvas = useCallback(() => {
    // Reset explicite : ignorer le brouillon local et forcer layout null côté API.
    clearCanvasDraft(BLANK_CANVAS_CONTEXT_KEY);
    const blank = createBlankLayoutV3();
    openCanvasContext(BLANK_CANVAS_CONTEXT_KEY, blank);
  }, [openCanvasContext]);

  const handleChooseAtsSafeTemplate = useCallback(() => {
    setStartupPromptOpen(false);
    setSidebarSection('design');
  }, []);

  const handleEmptyAddSection = useCallback(() => {
    setSidebarSection('sections');
    setHeaderComposerOpen(true);
  }, []);

  const handleEmptyChooseTemplate = useCallback(() => {
    setSidebarSection('design');
  }, []);

  const handleOpenHeaderComposer = useCallback(() => {
    setSidebarSection('sections');
    setSectionComposerType(null);
    setHeaderComposerOpen(true);
  }, []);

  const handleOpenSectionComposer = useCallback((type) => {
    setSidebarSection('sections');
    setHeaderComposerOpen(false);
    setSectionComposerType(type || null);
  }, []);

  const handleHeaderComposerConfirm = useCallback((payload) => {
    if (!layout || !payload || profileLoadError) return;
    const nextCv = mergeHeaderComposerCv(cv, payload.values, payload.fields);
    handleCvChange(nextCv);
    const { layout: nextLayout, placedIds } = applyHeaderComposerToLayout(layout, 0, {
      variantId: payload.variantId,
      fields: payload.fields,
    });
    commitLayout(nextLayout);
    // Persister cv + layout ensemble (évite un flush avec l’ancien cv).
    if (nextCv) autoSave.schedule({ ...nextCv, layout: nextLayout });
    if (placedIds.length) {
      setSelectedBlockIds(placedIds);
      setEditingBlockId(null);
      setImageEditBlockId(null);
    }
    setHeaderComposerOpen(false);
    setStartupPromptOpen(false);
  }, [layout, cv, handleCvChange, commitLayout, autoSave, profileLoadError]);

  const handleSectionComposerConfirm = useCallback((payload) => {
    if (!layout || !payload?.sectionType || profileLoadError) return;
    const nextCv = mergeSectionComposerCv(payload.sectionType, cv, payload);
    handleCvChange(nextCv);
    const { layout: nextLayout, placedIds } = applySectionComposerToLayout(
      layout,
      0,
      payload.sectionType,
      {
        variantId: payload.variantId,
        fields: payload.fields,
      },
    );
    commitLayout(nextLayout);
    if (nextCv) autoSave.schedule({ ...nextCv, layout: nextLayout });
    if (placedIds.length) {
      setSelectedBlockIds(placedIds);
      setEditingBlockId(null);
      setImageEditBlockId(null);
    }
    setSectionComposerType(null);
    setStartupPromptOpen(false);
  }, [layout, cv, handleCvChange, commitLayout, autoSave, profileLoadError]);

  const handleDismissOnboarding = useCallback(() => {
    dismissEditorOnboarding();
    setOnboardingDismissed(true);
  }, []);

  const onboardingOpen = shouldShowEditorOnboarding({
    dismissed: onboardingDismissed,
    loading,
    startupPromptOpen,
  });

  const handleGenerateStarterCanvas = useCallback(() => {
    const templates = templatesList || [];
    const current = templates.find((t) => t?.id === templateId);
    const preferred =
      (current && isAtsSafe(current) ? current : null)
      || sortTemplatesForEditor(templates).find(isAtsSafe)
      || current
      || templates[0];

    if (preferred && cv) {
      const adapted = buildAdaptedCanvasLayoutForCv(cv, preferred, {
        templatesList: templates,
        templateId: preferred.id,
      }).layout;
      if (onTemplateIdChange) onTemplateIdChange(preferred.id);
      openCanvasContext(templateCanvasContextKey(preferred.id), adapted);
      return;
    }

    openCanvasContext(
      preferred ? templateCanvasContextKey(preferred.id) : BLANK_CANVAS_CONTEXT_KEY,
      preferred ? buildTemplateCanvasLayout(preferred) : createStarterLayoutV3(),
    );
  }, [
    templatesList,
    templateId,
    cv,
    onTemplateIdChange,
    openCanvasContext,
    buildTemplateCanvasLayout,
  ]);

  const handleApplyStableDesignBridge = useCallback((offer) => {
    const tid = offer?.templateId
      || profileTemplateIdRef.current
      || templateId;
    const template = resolveTemplateFromList(templatesList || [], tid);
    if (!template || !cv) {
      setDesignBridgeError(
        !cv
          ? 'Profil non chargé — réessaie dans un instant.'
          : 'Ce modèle ne peut pas être appliqué ici. Choisis-en un autre.',
      );
      return;
    }
    setDesignBridgeConfirming(true);
    setDesignBridgeError('');
    try {
      const applied = applyStableDesignToCanvas(cv, template, { templatesList });
      if (!applied.ok || !applied.layout) {
        setDesignBridgeError(
          applied.reason === 'no_canvas_spec'
            ? 'Ce modèle ne peut pas être appliqué ici.'
            : 'Impossible d’appliquer ce design.',
        );
        return;
      }
      if (onTemplateIdChange) onTemplateIdChange(template.id);
      openCanvasContext(templateCanvasContextKey(template.id), applied.layout);
      setDesignBridgeOffer(null);
      setDesignBridgeError('');
      setStartupPromptOpen(false);
    } finally {
      setDesignBridgeConfirming(false);
    }
  }, [cv, templateId, templatesList, onTemplateIdChange, openCanvasContext]);

  const handleDismissDesignBridge = useCallback(() => {
    setDesignBridgeOffer(null);
    setDesignBridgeError('');
  }, []);

  const handleApplyStableFromStartup = useCallback(() => {
    const tid = String(
      profileTemplateIdRef.current || templateId || '',
    ).trim();
    const offer = buildStableToBetaOffer(layoutRef.current, tid, templatesList || [], {
      force: true,
    });
    if (!offer) {
      handleChooseAtsSafeTemplate();
      return;
    }
    // Opt-in via modal (warnings + Garder tel quel) — pas d’apply direct.
    setStartupPromptOpen(false);
    setDesignBridgeError('');
    setDesignBridgeOffer(offer);
  }, [templatesList, templateId, handleChooseAtsSafeTemplate]);

  const applyImportedCvToCanvas = useCallback(async (nextCv, {
    layoutHints = {},
    visionLayout = null,
    visionMeta = {},
    importPolicy = null,
    chosenVariant = null,
    annotations = null,
  } = {}) => {
    const templates = templatesList || [];
    let finalLayout;
    let recommendedTemplateId;
    let analysis = null;
    let blockCount;
    let contentBlockCount;
    let importSource;

    if (chosenVariant?.layout) {
      finalLayout = ensureImportLayoutHasContent(chosenVariant.layout, nextCv);
      recommendedTemplateId = chosenVariant.recommendedTemplateId || '';
      contentBlockCount = countContentBlocks(finalLayout);
      blockCount = chosenVariant.blockCount
        || (finalLayout?.pages || []).reduce((n, p) => n + (p?.blocks?.length || 0), 0);
      importSource = chosenVariant.importSource || chosenVariant.id || 'preset';
    } else {
      ({
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
        annotations,
      }));
      finalLayout = ensureImportLayoutHasContent(finalLayout, nextCv);
      contentBlockCount = countContentBlocks(finalLayout);
    }

    // AXE-344 — jamais de succès « décoratif only » (filet sans identité / sections).
    if (!contentBlockCount) {
      setImportError(
        'Import incomplet : aucun contenu affichable. Réessayez avec un PDF texte, ou saisissez le CV manuellement.',
      );
      setImportModalOpen(true);
      setImportChooser(null);
      return;
    }

    recommendedTemplateId = resolveImportPersistTemplateId(
      recommendedTemplateId,
      templateId || 'minimal',
    );

    const recTemplate = templates.find((t) => t?.id === recommendedTemplateId) || templates[0];
    const contextKey = IMPORTED_CANVAS_CONTEXT_KEY;
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
    setImportChooser(null);
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
      onSaveSuccess?.();
    } catch (err) {
      setLoadError(err?.message || 'Import réussi mais enregistrement échoué.');
    }
    if (chosenVariant) {
      setImportToast(importChooserToastMessage(chosenVariant));
    } else {
      const label = recommendTemplateLabel(recTemplate?.id, templates);
      let sourceNote = '';
      if (importSource === 'structural') {
        sourceNote = ' · copie fidèle du PDF';
      } else if (importSource === 'vision-guided') {
        sourceNote = ' · analyse visuelle PDF';
      } else if (visionMeta?.source === 'gemini_vision') {
        sourceNote = ' · vision partielle';
      } else if (importPolicy?.layout_fallback) {
        sourceNote = ' · contenu adapté (pas de copie layout PDF)';
      }
      if (importSource === 'structural') {
        setImportToast(`${contentBlockCount || blockCount} éléments importés${sourceNote}`);
      } else {
        setImportToast(`${summarizeImportAdaptation(analysis, label, contentBlockCount || blockCount, {
          fromVision: importSource === 'vision-guided',
        })}${sourceNote}`);
      }
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
    onSaveSuccess,
    templateOptions,
  ]);

  const runCvImport = useCallback(async (importFn) => {
    setImportModalOpen(false);
    setImportChooser(null);
    setStartupPromptOpen(false);
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
        importPolicy,
        blockAnnotations,
        semanticMeta,
      } = extractImportApiResponse(result);
      const nextCv = cvFromImportPayload(rawCv);
      const templates = templatesList || [];
      const { variants: built } = buildImportLayoutVariants(nextCv, templates, {
        templateId,
        layoutHints,
        visionLayout,
        visionMeta,
        annotations: blockAnnotations,
      });
      let scoredRows = [];
      let bestTotal = null;
      try {
        const scored = await scoreImportLayoutVariants(built, nextCv, {
          includeLayout: true,
        });
        scoredRows = scored.variants || [];
        bestTotal = scored.best_total;
      } catch {
        // Scoring optionnel pour le chooser : on affiche quand même les 3 layouts.
        scoredRows = [];
      }
      const merged = sortImportVariantsForChooser(
        mergeBuiltAndScoredVariants(built, scoredRows),
      );
      if (merged.length === 0) {
        await applyImportedCvToCanvas(nextCv, {
          layoutHints,
          visionLayout,
          visionMeta,
          importPolicy,
          annotations: blockAnnotations,
        });
        return;
      }
      // Affiche déjà le layout par défaut pendant le chooser (évite canvas vide).
      const defaultId = defaultImportVariantId(merged);
      const previewVariant = resolveImportVariant(merged, defaultId) || merged[0];
      if (previewVariant?.layout) {
        const previewLayout = ensureImportLayoutHasContent(previewVariant.layout, nextCv);
        setCv(nextCv);
        resetLayout(previewLayout);
        layoutRef.current = previewLayout;
      }
      setImportChooser({
        cv: nextCv,
        variants: merged,
        bestTotal,
        selectedId: defaultId,
        importPolicy,
        semanticMeta,
        blockAnnotations,
      });
    } catch (err) {
      setImportError(err?.message || 'Erreur lors de l\'import.');
      setImportModalOpen(true);
    } finally {
      setImportLoading(false);
      if (importCleanupRef.current) {
        importCleanupRef.current();
        importCleanupRef.current = null;
      }
    }
  }, [applyImportedCvToCanvas, templatesList, templateId, resetLayout]);

  const handleImportChooserConfirm = useCallback(async (variant) => {
    if (!importChooser?.cv || !variant?.layout) return;
    setImportChooserConfirming(true);
    try {
      await applyImportedCvToCanvas(importChooser.cv, {
        chosenVariant: variant,
        importPolicy: importChooser.importPolicy,
      });
    } finally {
      setImportChooserConfirming(false);
    }
  }, [importChooser, applyImportedCvToCanvas]);

  const handleImportChooserCancel = useCallback(async () => {
    if (!importChooser?.cv) {
      setImportChooser(null);
      return;
    }
    const designOrDefault = resolveImportVariant(
      importChooser.variants,
      'design',
    );
    setImportChooserConfirming(true);
    try {
      if (designOrDefault?.layout) {
        await applyImportedCvToCanvas(importChooser.cv, {
          chosenVariant: designOrDefault,
          importPolicy: importChooser.importPolicy,
        });
      } else {
        setImportChooser(null);
      }
    } finally {
      setImportChooserConfirming(false);
    }
  }, [importChooser, applyImportedCvToCanvas]);

  const handleImportFile = useCallback((file) => {
    if (!file) return;
    runCvImport(() => apiPostFile('/api/cv/import', file));
  }, [runCvImport]);

  useEffect(() => {
    if (!importToast) return undefined;
    const id = setTimeout(() => setImportToast(''), 6000);
    return () => clearTimeout(id);
  }, [importToast]);

  useEffect(() => () => {
    if (importCleanupRef.current) importCleanupRef.current();
  }, []);

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
      clearDocumentTextSelection();
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

  const handleDismissIdentitySyncHint = useCallback(() => {
    setIdentitySyncHint(null);
  }, []);

  const handleApplyIdentitySyncHint = useCallback((patchOverride = null) => {
    const patch = patchOverride || identitySyncHint?.patch;
    if (!patch) {
      setIdentitySyncHint(null);
      return;
    }
    const nextCv = applyIdentitySyncPatch(cv, patch);
    handleCvChange(nextCv);
    setIdentitySyncHint(null);
    if (!isSemanticEditNoteDismissed()) {
      setSemanticEditNoteOpen(true);
    }
  }, [cv, handleCvChange, identitySyncHint]);

  const closeEditHintIfOpen = useCallback(() => {
    if (!editHintOpen) return;
    dismissCanvasEditHint();
    setEditHintOpen(false);
  }, [editHintOpen]);

  const handleBlockPositionChange = useCallback((blockId, pos, commitOptions) => {
    const next = setBlockPosition(layout, blockId, pos);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleBlockMove = useCallback((blockId, pos, targetPageIndex, commitOptions = {}) => {
    const { multi } = commitOptions;
    if (multi?.ids?.length > 1 && multi.startPositions instanceof Map) {
      const found = findBlock(layout, blockId);
      if (!found) return;
      const ti = typeof targetPageIndex === 'number' ? targetPageIndex : found.pageIndex;
      if (ti !== found.pageIndex) {
        const next = moveBlockToPage(layout, blockId, ti, pos);
        commitLayout(next, commitOptions);
        return;
      }
      const next = setBlocksPositionFromPrimary(layout, multi.ids, blockId, pos, multi.startPositions);
      commitLayout(next, commitOptions);
      return;
    }
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

  const commitPlacedPreset = useCallback((pageIndex, xMm, yMm, preset, { enterEdit = false } = {}) => {
    if (!preset) return;
    const { x, y, partial } = placementPartialAtPoint(preset, xMm, yMm);
    const next = addBlockToPage(layout, pageIndex, { ...partial, x, y });
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) {
      setSelectedBlockIds([newId]);
      setImageEditBlockId(null);
      if (enterEdit || partial.type === 'text' || partial.type === 'title') {
        setEditingBlockId(newId);
      } else {
        setEditingBlockId(null);
      }
    }
    setPlacementPreset(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handlePlaceBlockAt = useCallback((pageIndex, xMm, yMm) => {
    if (!placementPreset) return;
    commitPlacedPreset(pageIndex, xMm, yMm, placementPreset);
  }, [placementPreset, commitPlacedPreset]);

  const handleDropBlockPreset = useCallback((pageIndex, xMm, yMm, preset) => {
    commitPlacedPreset(pageIndex, xMm, yMm, preset);
  }, [commitPlacedPreset]);

  const handlePlaceBlockRect = useCallback((pageIndex, rect) => {
    if (!placementPreset) return;
    const partial = {
      ...placementPreset,
      x: rect.x,
      y: rect.y,
      w: Math.max(rect.w, 12),
      h: Math.max(rect.h, 8),
    };
    const enterEdit = partial.type === 'text' || partial.type === 'title';
    delete partial.placementMode;
    const next = addBlockToPage(layout, pageIndex, partial);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) {
      setSelectedBlockIds([newId]);
      if (enterEdit) setEditingBlockId(newId);
      else setEditingBlockId(null);
    }
    setPlacementPreset(null);
    if (cv) autoSave.schedule(cv);
  }, [placementPreset, layout, commitLayout, cv, autoSave]);

  const handleDropImage = useCallback(async (pageIndex, xMm, yMm, rawSrc) => {
    if (!rawSrc) return;
    let src;
    try {
      src = await resolveCanvasImageSrcForLayout(rawSrc);
    } catch (err) {
      console.error('[canvas] drop image upload', err);
      return;
    }
    addUserCanvasImage(src);
    const preset = createImageBlockPreset(src);
    if (!preset) return;
    const w = preset.w ?? 40;
    const h = preset.h ?? 40;
    const partial = {
      ...preset,
      x: Math.max(0, xMm - w / 2),
      y: Math.max(0, yMm - h / 2),
    };
    const next = addBlockToPage(layout, pageIndex, partial);
    commitLayout(next);
    const newId = getLastBlockIdOnPage(next, pageIndex);
    if (newId) setSelectedBlockIds([newId]);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

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
    const contextKey = templateCanvasContextKey(template.id);
    saveCurrentCanvasDraft();
    const baseLayout = buildTemplateCanvasLayout(template);
    let targetLayout;
    if (cv) {
      targetLayout = buildAdaptedCanvasLayoutForCv(cv, template, {
        templatesList,
        templateId: template.id,
      }).layout;
    } else {
      const draft = loadCanvasDraft(contextKey);
      targetLayout = resolveTemplateContextLayout(contextKey, baseLayout, draft?.layout);
    }
    if (onTemplateIdChange) onTemplateIdChange(template.id);
    openCanvasContext(contextKey, targetLayout);
  }, [
    cv,
    templatesList,
    saveCurrentCanvasDraft,
    buildTemplateCanvasLayout,
    onTemplateIdChange,
    openCanvasContext,
  ]);

  const handleBlockContentPatch = useCallback((patch) => {
    if (!patch) return;
    const targetIds = selectedBlockIds.length > 1
      ? selectedBlockIds
      : (selectedBlockId ? [selectedBlockId] : []);
    if (!targetIds.length) return;

    if (patch.toggleCase) {
      let nextLayout = layout;
      for (const id of targetIds) {
        const found = findBlock(nextLayout, id);
        if (!found?.block) continue;
        if (found.block.type !== 'text' && found.block.type !== 'title') continue;
        const content = toggleTextCaseOnBlockContent(found.block.content);
        nextLayout = updateBlock(nextLayout, id, { content });
      }
      commitLayout(nextLayout);
      if (cv) autoSave.schedule(cv);
      return;
    }

    if (patch.content === undefined) return;
    let nextLayout = layout;
    for (const id of targetIds) {
      const found = findBlock(nextLayout, id);
      if (!found?.block) continue;
      if (found.block.type !== 'text' && found.block.type !== 'title') continue;
      nextLayout = updateBlock(nextLayout, id, patch);
    }
    commitLayout(nextLayout);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockIds, selectedBlockId, commitLayout, cv, autoSave]);

  const handleBlockPatchById = useCallback((blockId, patch) => {
    if (!blockId) return;
    const next = updateBlock(layout, blockId, patch);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleBlocksPatch = useCallback((patches) => {
    if (!Array.isArray(patches) || !patches.length) return;
    let next = layout;
    for (const item of patches) {
      if (!item?.id) continue;
      const { id, ...patch } = item;
      if (!Object.keys(patch).length) continue;
      next = updateBlock(next, id, patch);
    }
    commitLayout(next, { groupKey: `blocks-patch:${patches.map((p) => p.id).join(',')}` });
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleBlockStylePatch = useCallback((stylePatch) => {
    const targetIds = selectedBlockIds.length > 1 ? selectedBlockIds : (selectedBlockId ? [selectedBlockId] : []);
    if (!targetIds.length) return;
    let next = updateBlocksStyle(layout, targetIds, stylePatch);
    if (stylePatch.stroke_width != null) {
      for (const id of targetIds) {
        const found = findBlock(next, id);
        if (found?.block?.type === 'shape:line') {
          next = updateBlock(next, id, { h: stylePatch.stroke_width });
        }
      }
    }
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockIds, selectedBlockId, commitLayout, cv, autoSave]);

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
    if (!blockId || !delta) return;
    const next = swapBlockZWithAdjacent(layout, blockId, delta > 0 ? 1 : -1);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleReorderLayers = useCallback((orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
    const next = reorderBlocksZOrder(layout, orderedIds);
    commitLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleDeleteSelectedBlock = useCallback(() => {
    if (!selectedBlockIds.length) return;
    const next = removeBlocks(layout, selectedBlockIds);
    commitLayout(next);
    setSelectedBlockIds([]);
    setEditingBlockId(null);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockIds, commitLayout, cv, autoSave]);

  const handleNudgeSelectedBlock = useCallback((dx, dy) => {
    const targetIds = selectedBlockIds.length > 1
      ? selectedBlockIds.filter((id) => !findBlock(layout, id)?.block?.locked)
      : (selectedBlockId ? [selectedBlockId] : []);
    if (!targetIds.length) return;
    const next = moveBlocksBy(layout, targetIds, { dx, dy });
    commitLayout(next, { groupKey: `nudge:${targetIds.join(',')}` });
    if (cv) autoSave.schedule(cv);
  }, [selectedBlockIds, selectedBlockId, layout, commitLayout, cv, autoSave]);

  const handlePasteBlocks = useCallback(() => {
    const source = blocksClipboardRef.current;
    if (!Array.isArray(source) || !source.length || !layout) return;
    let next = layout;
    const newIds = [];
    source.forEach((block, index) => {
      const pageIndex = 0;
      const partial = {
        ...block,
        id: undefined,
        x: (block.x || 0) + 8,
        y: (block.y || 0) + 8 + index * 2,
        locked: false,
      };
      next = addBlockToPage(next, pageIndex, partial);
      const newId = getLastBlockIdOnPage(next, pageIndex);
      if (newId) newIds.push(newId);
    });
    commitLayout(next, { groupKey: 'paste:blocks' });
    if (newIds.length) setSelectedBlockIds(newIds);
    if (cv) autoSave.schedule(cv);
  }, [layout, commitLayout, cv, autoSave]);

  const handleDuplicateSelectedBlock = useCallback(() => {
    const targetIds = selectedBlockIds.length > 1 ? selectedBlockIds : (selectedBlockId ? [selectedBlockId] : []);
    if (!targetIds.length) return;
    const beforeIds = new Set(
      (layout?.pages || []).flatMap((p) => (p?.blocks || []).map((b) => b.id)),
    );
    const next = duplicateBlocks(layout, targetIds);
    commitLayout(next, { groupKey: `duplicate:${targetIds.join(',')}` });
    const newIds = (next?.pages || []).flatMap((p) => (
      (p?.blocks || []).map((b) => b?.id).filter((id) => id && !beforeIds.has(id))
    ));
    if (newIds.length) setSelectedBlockIds(newIds);
    if (cv) autoSave.schedule(cv);
  }, [layout, selectedBlockIds, selectedBlockId, commitLayout, cv, autoSave]);

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
    const { block, pageIndex } = found;
    if (block.type === 'text' || block.type === 'title') {
      const content = readBlockContentFromRoot(rootEl, block.type);
      const next = updateBlock(layout, blockId, { content });
      commitLayout(next);
      // AXE-339 : freeform → profil sémantique (auto ou hint), sans wizard.
      const page = layout.pages?.[pageIndex];
      const suggestion = suggestFreeformCvSync({
        content,
        block: { ...block, content },
        page,
        cv,
      });
      if (suggestion.action === 'apply' && suggestion.patch) {
        handleCvChange(applyIdentitySyncPatch(cv, suggestion.patch));
        setIdentitySyncHint(null);
        if (!isSemanticEditNoteDismissed()) {
          setSemanticEditNoteOpen(true);
        }
      } else if (suggestion.action === 'hint' && (suggestion.patch || suggestion.options?.length)) {
        setIdentitySyncHint({
          message: suggestion.message,
          patch: suggestion.patch || suggestion.options?.[0]?.patch,
          kind: suggestion.kind,
          options: suggestion.options || null,
        });
      } else {
        // action none (ou hint inutile) → ne pas laisser un hint obsolète.
        setIdentitySyncHint(null);
      }
    } else if (cv && rootEl) {
      const nextCv = applyCvFieldsFromRoot(cv, rootEl);
      handleCvChange(nextCv);
      if (isSemanticBlockType(block.type) && !isSemanticEditNoteDismissed()) {
        setSemanticEditNoteOpen(true);
      }
    }
    setEditingBlockId(null);
    clearDocumentTextSelection();
  }, [layout, cv, commitLayout, handleCvChange]);

  const handleOptimizeAtsLayout = useCallback(async () => {
    if (!layout || atsOptimizePreviewLoading) return;
    const next = applyAtsLayoutOptimizations(layout);
    if (sameLayout(layout, next)) {
      setAtsOptimizeMessage('Layout déjà optimisé pour la lecture ATS.');
      setAtsOptimizePreview(null);
      return;
    }
    const changes = describeAtsOptimizationChanges(layout, next);
    const reqId = atsOptimizePreviewReqRef.current + 1;
    atsOptimizePreviewReqRef.current = reqId;
    setAtsOptimizePreviewLoading(true);
    setAtsOptimizeMessage('');
    setAtsOptimizeUndoAfter(null);
    setAtsOptimizePreview({
      beforeLayout: layout,
      afterLayout: next,
      changes,
      beforeScore: null,
      afterScore: null,
      error: '',
    });
    try {
      const [beforeScored, afterScored] = await Promise.all([
        fetchAtsScoreParsing({ layout, cv, templateId }),
        fetchAtsScoreParsing({ layout: next, cv, templateId }),
      ]);
      if (atsOptimizePreviewReqRef.current !== reqId) return;
      setAtsOptimizePreview((prev) => (
        prev
          ? {
            ...prev,
            beforeScore: beforeScored.score,
            afterScore: afterScored.score,
            error: '',
          }
          : prev
      ));
    } catch (err) {
      if (atsOptimizePreviewReqRef.current !== reqId) return;
      setAtsOptimizePreview((prev) => (
        prev
          ? {
            ...prev,
            error: err?.message || 'Impossible de calculer l’impact ATS',
          }
          : prev
      ));
    } finally {
      if (atsOptimizePreviewReqRef.current === reqId) {
        setAtsOptimizePreviewLoading(false);
      }
    }
  }, [layout, cv, templateId, atsOptimizePreviewLoading]);

  const handleCancelAtsOptimizePreview = useCallback(() => {
    atsOptimizePreviewReqRef.current += 1;
    setAtsOptimizePreview(null);
    setAtsOptimizePreviewLoading(false);
  }, []);

  const updateAtsOptimizePanelPos = useCallback(() => {
    const anchor = atsOptimizeWrapRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setAtsOptimizePanelPos({
      top: Math.round(rect.bottom + 8),
      right: Math.max(12, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useEffect(() => {
    if (!atsOptimizePreview) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Empêche le handler canvas (window) de vider la sélection en même temps.
      event.stopPropagation();
      handleCancelAtsOptimizePreview();
    };
    // Pas de dismiss document-level en pointerdown : ça démonte le backdrop
    // avant le click et laisse le click « passer » sur Télécharger / etc. (Bugbot).
    // Le backdrop plein écran ferme au click ; Esc reste ici.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [atsOptimizePreview, handleCancelAtsOptimizePreview]);

  const handleApplyAtsOptimizePreview = useCallback(() => {
    if (!atsOptimizePreview?.afterLayout || !atsOptimizePreview?.beforeLayout) return;
    if (!sameLayout(layout, atsOptimizePreview.beforeLayout)) {
      setAtsOptimizeMessage('Le canvas a changé depuis l’aperçu — relance Optimiser ATS.');
      setAtsOptimizePreview(null);
      return;
    }
    const next = atsOptimizePreview.afterLayout;
    if (sameLayout(layout, next)) {
      setAtsOptimizePreview(null);
      setAtsOptimizeMessage('Layout déjà optimisé pour la lecture ATS.');
      return;
    }
    commitLayout(next, { groupKey: 'ats:optimize-spatial' });
    setAtsOptimizeUndoAfter(next);
    const impact = formatAtsScoreImpact(
      atsOptimizePreview.beforeScore,
      atsOptimizePreview.afterScore,
    );
    setAtsOptimizeMessage(`Réorganisation spatiale ATS appliquée. ${impact}`);
    setAtsOptimizePreview(null);
    if (cv) autoSave.schedule(cv);
  }, [atsOptimizePreview, layout, commitLayout, cv, autoSave]);

  const handleUndoAtsOptimize = useCallback(() => {
    if (!atsOptimizeUndoAfter || !sameLayout(layout, atsOptimizeUndoAfter)) {
      setAtsOptimizeUndoAfter(null);
      return;
    }
    if (!canUndoLayout) {
      setAtsOptimizeUndoAfter(null);
      return;
    }
    undoLayout();
    setAtsOptimizeUndoAfter(null);
    setAtsOptimizeMessage('Optimisation ATS annulée.');
    if (cv) autoSave.schedule(cv);
  }, [atsOptimizeUndoAfter, layout, canUndoLayout, undoLayout, cv, autoSave]);

  const atsOptimizeUndoVisible = Boolean(
    atsOptimizeUndoAfter && layout && sameLayout(layout, atsOptimizeUndoAfter),
  );

  const atsOptimizeSheetOpen = Boolean(atsOptimizePreview);
  const atsOptimizeToastOpen = Boolean(atsOptimizeMessage || atsOptimizeUndoVisible);

  useLayoutEffect(() => {
    if (!atsOptimizeSheetOpen && !atsOptimizeToastOpen) return undefined;
    updateAtsOptimizePanelPos();
    const onReposition = () => updateAtsOptimizePanelPos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [atsOptimizeSheetOpen, atsOptimizeToastOpen, updateAtsOptimizePanelPos]);

  useEffect(() => {
    if (!atsOptimizeMessage || atsOptimizeUndoVisible) return undefined;
    const id = setTimeout(() => setAtsOptimizeMessage(''), 6500);
    return () => clearTimeout(id);
  }, [atsOptimizeMessage, atsOptimizeUndoVisible]);

  useEffect(() => {
    if (!atsOptimizeUndoAfter) return;
    if (!layout || !sameLayout(layout, atsOptimizeUndoAfter)) {
      setAtsOptimizeUndoAfter(null);
    }
  }, [layout, atsOptimizeUndoAfter]);

  const handleExportFormat = useCallback(async (format) => {
    if (!cv || !layout || pdfExporting) return;
    setExportMenuOpen(false);
    setDocxNoticeOpen(false);
    setPdfExporting(true);
    setPdfExportError('');
    const preopenedWindow = prepareAppleDownloadWindow();
    try {
      const { blob, filename } = await apiPostBlob('/api/cv-export', {
        cv,
        template_id: templateId,
        layout,
        format,
      });
      await saveBlobWithPreferredMethod(
        blob,
        filename || buildCanvasExportFilename(cv, format),
        { preopenedWindow },
      );
    } catch (err) {
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      console.error(`[cv-editor-beta] export ${format}`, err);
      setPdfExportError(formatCanvasExportError(err, getDownloadPermissionHint(), format));
    } finally {
      setPdfExporting(false);
    }
  }, [cv, layout, templateId, pdfExporting]);

  const requestExportFormat = useCallback((format) => {
    if (!cv || !layout || pdfExporting) return;
    setExportMenuOpen(false);
    if (format === 'docx' && !isDocxFidelityNoticeDismissed()) {
      setDocxNoticeOpen(true);
      return;
    }
    void handleExportFormat(format);
  }, [cv, layout, pdfExporting, handleExportFormat]);

  const handleConfirmDocxNotice = useCallback(({ dontShowAgain = false } = {}) => {
    if (dontShowAgain) dismissDocxFidelityNotice();
    setDocxNoticeOpen(false);
    void handleExportFormat('docx');
  }, [handleExportFormat]);

  const handleCancelDocxNotice = useCallback(() => {
    setDocxNoticeOpen(false);
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const onPointerDown = (event) => {
      const root = exportMenuRef.current;
      if (root && !root.contains(event.target)) setExportMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Empêche le handler canvas (window) de vider la sélection en même temps.
      event.stopPropagation();
      setExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [exportMenuOpen]);

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
      if (isCanvasTypingTarget(document.activeElement) || isCanvasTypingTarget(e.target)) return;
      if (editingBlockId && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllInEditableRoot();
        return;
      }
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedBlockIds.length) {
        const blocks = selectedBlockIds
          .map((id) => findBlock(layoutRef.current, id)?.block)
          .filter(Boolean);
        if (blocks.length) {
          blocksClipboardRef.current = blocks.map((b) => ({ ...b }));
          e.preventDefault();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (blocksClipboardRef.current?.length) {
          e.preventDefault();
          handlePasteBlocks();
        }
        return;
      }
      // Toutes les actions clavier ci-dessous opèrent sur le bloc sélectionné,
      // hors mode édition de texte inline.
      if (!selectedBlockIds.length || editingBlockId) return;
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
      const delta = canvasNudgeDeltaFromKey(e.key, { shiftKey: e.shiftKey });
      if (!delta) return;
      e.preventDefault();
      handleNudgeSelectedBlock(delta.dx, delta.dy);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBlockIds, editingBlockId, handleDeleteSelectedBlock, handleNudgeSelectedBlock, handlePasteBlocks, layout]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(CANVAS_DESKTOP_LAYOUT_MQ);
    const sync = () => setNarrowViewport(Boolean(mq.matches));
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

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
            className="button button-primary"
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
      {narrowViewport && !desktopHintDismissed && (
        <div className="cv-editor-beta-desktop-hint" role="status">
          <p className="cv-editor-beta-desktop-hint__text">
            Édition de mise en page recommandée sur un ordinateur. Sur mobile ou tablette, le canvas reste consultable mais moins confortable à éditer.
          </p>
          <button
            type="button"
            className="cv-editor-beta-desktop-hint__dismiss"
            onClick={() => {
              dismissCanvasDesktopHint();
              setDesktopHintDismissed(true);
            }}
          >
            Compris
          </button>
        </div>
      )}
      <header className="cv-editor-beta-topbar">        <div className="cv-editor-beta-topbar-left">
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
              clearCanvasSelection();
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
            onSelectBlock={handleSelectBlock}
            onApplyLayout={(nextLayout, meta = {}) => {
              if (!nextLayout || !layout) return;
              if (sameLayout(layout, nextLayout)) {
                setAtsOptimizeMessage('Aucune correction applicable pour ce conseil.');
                return;
              }
              commitLayout(nextLayout, { groupKey: meta.groupKey || 'ats:coach' });
              setAtsOptimizeMessage('Correction ATS appliquée. Ctrl+Z pour annuler.');
              if (cv) autoSave.schedule(cv);
            }}
          />
          <div className="cv-editor-beta-ats-optimize-wrap" ref={atsOptimizeWrapRef}>
            <button
              type="button"
              className="cv-editor-beta-history-btn"
              onClick={handleOptimizeAtsLayout}
              disabled={loading || !layout || atsOptimizePreviewLoading}
              aria-expanded={Boolean(atsOptimizePreview)}
              aria-haspopup="dialog"
              title="Réorganiser spatialement les blocs pour la lecture ATS (aperçu avant application)"
            >
              {atsOptimizePreviewLoading ? 'Analyse ATS…' : 'Optimiser ATS'}
            </button>
          </div>
          <div className="cv-editor-beta-export-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="cv-editor-beta-history-btn"
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={loading || !layout || pdfExporting}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              title="Télécharger le CV (PDF, Word, HTML ou TXT)"
            >
              {pdfExporting ? 'Téléchargement…' : 'Télécharger'}
            </button>
            {exportMenuOpen && (
              <div className="cv-editor-beta-export-menu" role="menu" aria-label="Formats d’export">
                {CANVAS_EXPORT_FORMATS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className="cv-editor-beta-export-menu__item"
                    disabled={pdfExporting}
                    onClick={() => requestExportFormat(item.id)}
                  >
                    <span className="cv-editor-beta-export-menu__label">{item.label}</span>
                    <span className="cv-editor-beta-export-menu__hint">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
      {pdfFidelityIssues.length > 0 && !loading && layout && (
        <div className="cv-editor-beta-pdf-fidelity" role="status">
          Certains blocs ne seront pas exportés à l&apos;identique dans le PDF
          {pdfFidelitySummary ? ` (${pdfFidelitySummary})` : ''}.
          Survole le badge « PDF » sur le canvas pour le détail.
        </div>
      )}

      {atsOptimizePreview
        && createPortal(
          <>
            <button
              type="button"
              className="cv-editor-beta-ats-preview-backdrop"
              aria-label="Fermer l’aperçu ATS"
              onClick={handleCancelAtsOptimizePreview}
            />
            <div
              ref={atsOptimizePanelRef}
              className="cv-editor-beta-ats-preview"
              role="dialog"
              aria-modal="true"
              aria-label="Aperçu optimisation ATS"
              style={{
                top: `${atsOptimizePanelPos.top}px`,
                right: `${atsOptimizePanelPos.right}px`,
              }}
            >
              <div className="cv-editor-beta-ats-preview__header">
                <strong>Optimiser ATS</strong>
                <button
                  type="button"
                  className="cv-editor-beta-ats-preview__close"
                  onClick={handleCancelAtsOptimizePreview}
                  aria-label="Fermer l’aperçu"
                >
                  ✕
                </button>
              </div>
              <p
                className={[
                  'cv-editor-beta-ats-preview__impact',
                  atsOptimizePreview.error ? 'cv-editor-beta-ats-preview__impact--error' : '',
                ].filter(Boolean).join(' ')}
                role="status"
              >
                {atsOptimizePreviewLoading && 'Calcul de l’impact score…'}
                {!atsOptimizePreviewLoading && atsOptimizePreview.error && atsOptimizePreview.error}
                {!atsOptimizePreviewLoading && !atsOptimizePreview.error && (
                  formatAtsScoreImpact(
                    atsOptimizePreview.beforeScore,
                    atsOptimizePreview.afterScore,
                  )
                )}
              </p>
              {atsOptimizePreview.changes?.length > 0 ? (
                <ul className="cv-editor-beta-ats-preview__changes">
                  {atsOptimizePreview.changes.slice(0, 5).map((change) => (
                    <li key={change.id}>{change.label}</li>
                  ))}
                  {atsOptimizePreview.changes.length > 5 && (
                    <li>+ {atsOptimizePreview.changes.length - 5} autre(s)</li>
                  )}
                </ul>
              ) : (
                <p className="cv-editor-beta-ats-preview__empty">Aucun déplacement détecté.</p>
              )}
              <div className="cv-editor-beta-ats-preview__actions">
                <button
                  type="button"
                  className="cv-editor-beta-ats-preview__btn"
                  onClick={handleCancelAtsOptimizePreview}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="cv-editor-beta-ats-preview__btn cv-editor-beta-ats-preview__btn--primary"
                  onClick={handleApplyAtsOptimizePreview}
                  disabled={atsOptimizePreviewLoading}
                >
                  Appliquer
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {(atsOptimizeMessage || atsOptimizeUndoVisible)
        && createPortal(
          <div
            className="cv-editor-beta-ats-toast"
            role="status"
            style={{
              top: `${atsOptimizePanelPos.top}px`,
              right: `${atsOptimizePanelPos.right}px`,
            }}
          >
            <span>{atsOptimizeMessage || 'Réorganisation spatiale ATS appliquée.'}</span>
            {atsOptimizeUndoVisible && (
              <button
                type="button"
                className="cv-editor-beta-ats-toast__undo"
                onClick={handleUndoAtsOptimize}
              >
                Annuler
              </button>
            )}
          </div>,
          document.body,
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
        {identitySyncHint && (
          <div
            className="cv-editor-beta-semantic-note cv-editor-beta-semantic-note--identity-hint"
            role="status"
            aria-live="polite"
          >
            <span className="cv-editor-beta-semantic-note__text">
              {identitySyncHint.message || 'Mettre à jour le profil avec ce texte ?'}
            </span>
            <div className="cv-editor-beta-semantic-note__actions">
              {Array.isArray(identitySyncHint.options) && identitySyncHint.options.length > 0 ? (
                identitySyncHint.options.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className="cv-editor-beta-semantic-note__apply"
                    onClick={() => handleApplyIdentitySyncHint(opt.patch)}
                  >
                    {opt.label}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="cv-editor-beta-semantic-note__apply"
                  onClick={() => handleApplyIdentitySyncHint()}
                >
                  Utiliser
                </button>
              )}
              <button
                type="button"
                className="cv-editor-beta-semantic-note__dismiss"
                onClick={handleDismissIdentitySyncHint}
              >
                Ignorer
              </button>
            </div>
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
          fontFamilies={canvasFontFamilies}
          selectedBlockId={selectedBlockId}
          selectedBlockIds={selectedBlockIds}
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
          onOpenHeaderComposer={handleOpenHeaderComposer}
          onOpenSectionComposer={handleOpenSectionComposer}
          onCancelPlacement={handleCancelPlacement}
          onSelectBlock={handleSelectBlock}
          onBlockPatch={handleBlockPatchById}
          onBlocksPatch={handleBlocksPatch}
          onBlockBringToFront={handleBlockBringToFront}
          onBlockSendToBack={handleBlockSendToBack}
          onBlockZStep={handleBlockZStep}
          onReorderLayers={handleReorderLayers}
          onDeleteSelected={handleDeleteSelectedBlock}
          onDuplicateSelected={handleDuplicateSelectedBlock}
          onToggleLock={handleToggleSelectedBlockLock}
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
                  fontFamilies={canvasFontFamilies}
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
              onDropImage={handleDropImage}
              onDropBlockPreset={handleDropBlockPreset}
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
              onEmptyAddSection={handleEmptyAddSection}
              onEmptyChooseTemplate={handleEmptyChooseTemplate}
            />
            {importToast && (
              <div className="cv-editor-beta-import-toast" role="status">
                Canvas généré - {importToast}
              </div>
            )}
            <EditorOnboardingTour
              open={onboardingOpen}
              onDismiss={handleDismissOnboarding}
            />
            {startupPromptOpen && (
              <section className="cv-editor-beta-start-panel" role="dialog" aria-modal="true" aria-label="Démarrer le canvas">
                <div className="cv-editor-beta-start-panel__backdrop" aria-hidden />
                <div className="cv-editor-beta-start-panel__card">
                  <span className="cv-editor-beta-start-panel__eyebrow">Démarrer</span>
                  <h2>Comment veux-tu commencer ?</h2>
                  <p>
                    Importe ton CV, pars d’un modèle, ou génère une mise en page depuis ton profil.
                  </p>
                  <div className="cv-editor-beta-start-panel__actions">
                    <button
                      type="button"
                      className="cv-editor-beta-start-panel__primary"
                      onClick={() => {
                        clearCanvasSelection();
                        setImportError('');
                        setImportModalOpen(true);
                      }}
                    >
                      Importer mon CV
                    </button>
                    {canBuildCanvasForTemplate(
                      resolveTemplateFromList(
                        templatesList || [],
                        String(cv?.template_id || profileTemplateIdRef.current || templateId || '').trim(),
                      ),
                    ) && (
                      <button
                        type="button"
                        className="cv-editor-beta-start-panel__secondary"
                        onClick={handleApplyStableFromStartup}
                      >
                        Appliquer mon design Stable
                      </button>
                    )}
                    <button
                      type="button"
                      className="cv-editor-beta-start-panel__secondary"
                      onClick={handleChooseAtsSafeTemplate}
                    >
                      Choisir un modèle
                    </button>
                    <button
                      type="button"
                      className="cv-editor-beta-start-panel__import"
                      onClick={handleGenerateStarterCanvas}
                    >
                      Générer depuis mon profil
                    </button>
                    <button
                      type="button"
                      className="cv-editor-beta-start-panel__advanced"
                      onClick={handlePickBlankCanvas}
                    >
                      Page blanche (avancé)
                    </button>
                  </div>
                  <p className="cv-editor-beta-start-panel__hint">
                    Ensuite, « Composer l’en-tête » dans Sections pose identité et contact.
                    La page blanche est pour les usages avancés.
                  </p>
                </div>
              </section>
            )}
            {designBridgeOffer && !startupPromptOpen && (
              <DesignModeBridgeModal
                offer={designBridgeOffer}
                confirming={designBridgeConfirming}
                error={designBridgeError}
                onConfirm={handleApplyStableDesignBridge}
                onDismiss={handleDismissDesignBridge}
              />
            )}
            <DocxExportNoticeModal
              open={docxNoticeOpen}
              onConfirm={handleConfirmDocxNotice}
              onCancel={handleCancelDocxNotice}
            />
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
        <span>Canvas libre · double-clic pour éditer · glisser pour sélectionner · Ctrl+clic multi-sélection · Ctrl+A tout sélectionner</span>
      </footer>

      <EditorCvImportModal
        open={importModalOpen && !importLoading && !importChooser}
        onClose={() => {
          if (!importLoading) setImportModalOpen(false);
        }}
        onImportFile={handleImportFile}
        loading={importLoading}
        error={importError}
      />

      {importLoading && (
        <CvImportLoadingOverlay
          stepIndex={importStepIndex}
          title="Import & adaptation Canva en cours"
          subtitle="Analyse en cours - cela peut prendre jusqu'à une minute pour un PDF complexe."
        />
      )}

      <EditorImportLayoutChooserModal
        open={Boolean(importChooser) && !importLoading}
        variants={importChooser?.variants || []}
        bestTotal={importChooser?.bestTotal}
        initialSelectedId={importChooser?.selectedId || ''}
        policyNotice={importChooser?.importPolicy?.message || ''}
        confirming={importChooserConfirming}
        onConfirm={handleImportChooserConfirm}
        onCancel={handleImportChooserCancel}
      />

      <HeaderComposerModal
        open={headerComposerOpen}
        cv={cv}
        onConfirm={handleHeaderComposerConfirm}
        onCancel={() => setHeaderComposerOpen(false)}
      />

      <SectionComposerModal
        open={Boolean(sectionComposerType)}
        sectionType={sectionComposerType}
        cv={cv}
        onConfirm={handleSectionComposerConfirm}
        onCancel={() => setSectionComposerType(null)}
      />

    </div>
  );
}

export default CvEditorBeta;
