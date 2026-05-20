import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiGet, apiPut } from '../../api';
import { defaultCv } from '../../data/cvDefault';
import {
  createBlankLayoutV3,
  createStarterLayoutV3,
  isEmptyLayoutV3,
  migrateLayoutToV3,
  setBlockPosition,
} from '../../lib/cvLayoutModelV3.js';
import { useAutoSave } from '../../lib/useAutoSave.js';
import { useLayoutHistory } from '../../lib/useLayoutHistory.js';
import CvEditablePreview from '../CvEditablePreview.jsx';
import FreeCanvas from './FreeCanvas.jsx';

import AutoSaveIndicator from './AutoSaveIndicator.jsx';
import EditorAtsScoreBadge from './EditorAtsScoreBadge.jsx';
import EditorInspectorDrawer from './EditorInspectorDrawer.jsx';
import EditorTemplateSelector from './EditorTemplateSelector.jsx';

import '../../styles/CvEditorBeta.css';
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
    const next = createBlankLayoutV3();
    resetLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  const handlePickStarterCanvas = useCallback(() => {
    const next = createStarterLayoutV3();
    resetLayout(next);
    if (cv) autoSave.schedule(cv);
  }, [resetLayout, cv, autoSave]);

  const showCanvasStarterPicker = editorViewMode === 'free' && isEmptyLayoutV3(layout);

  const handleSelectBlock = useCallback((blockId) => {
    setSelectedBlockId(blockId);
  }, []);

  const handleBlockPositionChange = useCallback((blockId, pos, commitOptions) => {
    const next = setBlockPosition(layout, blockId, pos);
    commitLayout(next, commitOptions);
  }, [layout, commitLayout]);

  const handleDragEndPersist = useCallback(() => {
    if (cv) autoSave.schedule(cv);
  }, [cv, autoSave]);

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
          <EditorTemplateSelector
            templates={templatesList}
            templateId={templateId}
            onTemplateIdChange={onTemplateIdChange}
          />
        </div>
        <div className="cv-editor-beta-topbar-right">
          <AutoSaveIndicator state={autoSave.state} onRetry={handleRetry} />
          <EditorAtsScoreBadge templateId={templateId} cv={cv} />
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
        </div>
      </header>

      {loadError && (
        <div className="cv-editor-beta-error" role="alert">
          {loadError}
        </div>
      )}

      <div className="cv-editor-beta-workspace">
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
              {showCanvasStarterPicker && (
                <div className="free-canvas-starter-picker" role="region" aria-label="Démarrer le canvas">
                  <p className="free-canvas-starter-picker__title">Comment voulez-vous commencer ?</p>
                  <div className="free-canvas-starter-picker__actions">
                    <button
                      type="button"
                      className="free-canvas-starter-picker__btn"
                      onClick={handlePickStarterCanvas}
                    >
                      Partir d’un modèle (blocs pré-placés)
                    </button>
                    <button
                      type="button"
                      className="free-canvas-starter-picker__btn free-canvas-starter-picker__btn--secondary"
                      onClick={handlePickBlankCanvas}
                    >
                      Page blanche
                    </button>
                  </div>
                </div>
              )}
              <FreeCanvas
                layout={layout}
                cv={cv}
                selectedBlockId={selectedBlockId}
                onSelectBlock={handleSelectBlock}
                onBlockPositionChange={handleBlockPositionChange}
                onDragEnd={handleDragEndPersist}
              />
            </>
          )}
        </main>
        <div id="cv-editor-beta-inspector" className="cv-editor-beta-inspector-slot">
          <EditorInspectorDrawer
            open={inspectorOpen}
            template={activeTemplate}
            templateOptions={templateOptions}
            onTemplateOptionsChange={handleTemplateOptionsChange}
            onClose={handleInspectorClose}
            cv={cv}
            onCvChange={handleCvChange}
          />
        </div>
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>
          {editorViewMode === 'free'
            ? 'Canvas libre L3 · glissez les blocs (Ctrl+Z pour annuler)'
            : 'L1 inline · basculez sur Canvas libre pour l’aperçu L3'}
        </span>
      </footer>
    </div>
  );
}
