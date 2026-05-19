import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiGet, apiPut } from '../../api';
import { defaultCv } from '../../data/cvDefault';
import { frontendLayoutToScoringLayout } from '../../lib/cvLayoutModel.js';
import {
  LAYOUT_V2_VERSION,
  createDefaultLayoutV2,
  flattenLayoutV2ToOrder,
  isDefaultLayoutV2,
  migrateLayoutV1ToV2,
  sanitizeLayoutV2,
} from '../../lib/cvLayoutModelV2.js';
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
   * Layout local (zones header / main / sidebar + ratio + side + theme).
   * Forme v2 (cf. lib/cvLayoutModelV2.js) persiste dans `cv_base.data.layout`.
   *
   * Hydratation a l init :
   *  - si le payload GET contient un layout v2 -> sanitize
   *  - si layout v1 (ancien clients) -> migration auto v1->v2
   *  - sinon -> defaut v2
   *
   * Le rendu effectif des zones (sidebar on/off, identity deplacee, etc.)
   * est P2.4c -- pour l instant le DOM patching `applyLayoutToDom` opere
   * uniquement sur `flattenLayoutV2ToOrder` (intra-parent toujours, comme
   * P2.2). L UI mini-carte permet deja a l user d EXPRIMER son intention
   * complete via le modele v2.
   */
  const [layout, setLayout] = useState(createDefaultLayoutV2);

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
      layout: isDefaultLayoutV2(layout) ? null : layout,
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
        // Hydrate le layout local depuis le serveur :
        //   - si v2 -> sanitize
        //   - si v1 (ancien clients ou docs deja en base) -> migration auto
        //   - sinon -> defaut v2
        if (Object.prototype.hasOwnProperty.call(incoming, 'layout')) {
          const rawLayout = incoming.layout;
          if (rawLayout && typeof rawLayout === 'object' && Number(rawLayout.version) === LAYOUT_V2_VERSION) {
            setLayout(sanitizeLayoutV2(rawLayout));
          } else if (rawLayout && typeof rawLayout === 'object') {
            setLayout(migrateLayoutV1ToV2(rawLayout));
          } else {
            setLayout(createDefaultLayoutV2());
          }
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
    const safe = sanitizeLayoutV2(nextLayout);
    setLayout(safe);
    // P2.3 : declenche un save (debounce dans le scheduler). Le saveFn
    // sera re-cree par React au prochain render (deps inclut `layout`),
    // et la ref interne du hook prendra la nouvelle version -> le PUT
    // partira avec le bon layout.
    if (cv) autoSave.schedule(cv);
  }, [cv, autoSave]);

  /**
   * Layout au format SCORING : transmis a `EditorAtsScoreBadge` quand le
   * user a personnalise la mise en page. Le backend attend pour l instant
   * un format v1 (sectionsOrder plat). On flatten le layout v2 pour
   * preserver l ordre visuel (header -> main -> sidebar) attendu.
   *
   * Si le layout est au defaut, on garde `null` -> le badge appelle
   * l API avec juste `templateId` (path rapide).
   */
  const scoringLayout = useMemo(() => {
    if (isDefaultLayoutV2(layout)) return null;
    const v1Like = {
      version: 1,
      sectionsOrder: flattenLayoutV2ToOrder(layout),
      sidebarRatio: layout.sidebarRatio,
      theme: layout.theme,
    };
    return frontendLayoutToScoringLayout(v1Like, { templateId });
  }, [layout, templateId]);

  /**
   * Ordre des sections aplati en suivant les zones (pour le DOM patch
   * `applyLayoutToDom`). Note : tant que le renderer n est pas
   * layout-aware (P2.4c), le DOM patch ne peut reordonner qu intra-
   * parent. Les deplacements inter-zones (ex. competences -> main) ne
   * seront visibles qu apres P2.4c.
   */
  const flatSectionsOrder = useMemo(() => flattenLayoutV2ToOrder(layout), [layout]);

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
            layoutSectionsOrder={flatSectionsOrder}
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
          />
        </div>
      </div>

      <footer className="cv-editor-beta-statusbar">
        <span>L1 inline · L2/L3 + reorder de sections à venir</span>
      </footer>
    </div>
  );
}
