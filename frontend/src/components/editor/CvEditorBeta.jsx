import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiGet, apiPut } from '../../api';
import { defaultCv } from '../../data/cvDefault';
import {
  createDefaultLayout,
  frontendLayoutToScoringLayout,
  isDefaultLayout,
  sanitizeLayout,
} from '../../lib/cvLayoutModel.js';
import { useAutoSave } from '../../lib/useAutoSave.js';
import CvEditablePreview from '../CvEditablePreview.jsx';

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
  /**
   * Layout local (ordre des sections, sidebar ratio, theme). Persiste cote
   * backend depuis P2.3 dans `cv_base.data.layout` (JSONB). On initialise
   * avec le defaut, puis on hydrate avec la valeur GET via `sanitizeLayout`
   * (qui tolere null / payload partiel).
   */
  const [layout, setLayout] = useState(createDefaultLayout);
  /**
   * P2.2.b : etat decrivant quelles sections sont effectivement rendues
   * dans le DOM et leur groupe (main / sidebar). Mis a jour par
   * `CvEditablePreview` via le callback `onLayoutAvailabilityChange`.
   * `null` au mount -> le drawer affiche toutes les sections comme
   * verrouillees tant qu on n a pas recu de premiere mesure.
   */
  const [sectionsAvailability, setSectionsAvailability] = useState(null);

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
   * `layout` est inclus dans la closure pour suivre la derniere mise en
   * page. La ref interne de `useAutoSave` capture toujours la version la
   * plus recente, donc on ne change PAS `saveFnKey` quand layout change
   * (pour ne pas re-init le scheduler et perdre les pending changes).
   * Convention : on envoie `null` quand le layout est au defaut, ce qui
   * permet au backend de nettoyer la ligne -- voir
   * `tests/test_cv_layout_persistence.py`.
   */
  const saveFn = useCallback(async (payload) => {
    return apiPut('/api/cv', {
      ...payload,
      template_id: templateId,
      template_options: templateOptions,
      layout: isDefaultLayout(layout) ? null : layout,
    });
  }, [templateId, templateOptions, layout]);

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
        // Hydrate le layout local depuis le serveur (P2.3). sanitizeLayout
        // tolere null / objet partiel / valeurs invalides -> fallback defaut.
        if (Object.prototype.hasOwnProperty.call(incoming, 'layout')) {
          setLayout(sanitizeLayout(incoming.layout));
        }
        // On retire `layout` du cv pour ne pas le considerer comme un champ
        // de contenu (il est gere a part dans son propre state).
        const { layout: _layout, ...cvPayload } = incoming;
        setCv({ ...defaultCv, ...cvPayload });
        setLoading(false);
      })
      .catch((err) => {
        if (aborted) return;
        setLoadError(err?.message || 'Impossible de charger le CV');
        setCv({ ...defaultCv });
        setLoading(false);
      });
    return () => { aborted = true; };
  }, []);

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

  const handleLayoutChange = useCallback((nextLayout) => {
    const safe = sanitizeLayout(nextLayout);
    setLayout(safe);
    // P2.3 : declenche un save (debounce dans le scheduler). Le saveFn
    // sera re-cree par React au prochain render (deps inclut `layout`),
    // et la ref interne du hook prendra la nouvelle version -> le PUT
    // partira avec le bon layout. cv peut etre null avant le 1er fetch :
    // on schedule alors un objet vide, le scheduler sait debouncer.
    if (cv) autoSave.schedule(cv);
  }, [cv, autoSave]);

  /**
   * Layout au format SCORING : transmis a `EditorAtsScoreBadge` quand le
   * user a personnalise l ordre des sections / la sidebar. Si le layout
   * est au defaut, on garde `null` -> le badge appelle l API avec juste
   * `templateId` (rapide path).
   */
  const scoringLayout = useMemo(() => {
    if (isDefaultLayout(layout)) return null;
    return frontendLayoutToScoringLayout(layout, { templateId });
  }, [layout, templateId]);

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
          <EditorTemplateSelector
            templates={templatesList}
            templateId={templateId}
            onTemplateIdChange={onTemplateIdChange}
          />
        </div>
        <div className="cv-editor-beta-topbar-right">
          <AutoSaveIndicator state={autoSave.state} onRetry={handleRetry} />
          <EditorAtsScoreBadge
            templateId={scoringLayout ? null : templateId}
            layout={scoringLayout}
            cv={cv}
          />
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
          <CvEditablePreview
            cv={cv}
            baseCv={cv}
            onChange={handleCvChange}
            templateId={templateId}
            templateOptions={templateOptions}
            layoutSectionsOrder={layout.sectionsOrder}
            onLayoutAvailabilityChange={setSectionsAvailability}
          />
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
            layout={layout}
            onLayoutChange={handleLayoutChange}
            sectionsAvailability={sectionsAvailability}
          />
        </div>
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>L1 inline · L2/L3 + reorder de sections à venir</span>
      </footer>
    </div>
  );
}
