import { useCallback, useEffect, useRef, useState } from 'react';

import { apiGet, apiPut } from '../../api';
import { defaultCv } from '../../data/cvDefault';
import { useBetaMode } from '../../lib/useBetaMode.js';
import CvEditablePreview from '../CvEditablePreview.jsx';

import EditorAtsScoreBadge from './EditorAtsScoreBadge.jsx';

import '../../styles/CvEditorBeta.css';

/**
 * Editeur de CV Beta — squelette P1.1.
 *
 * Premiere brique de la nouvelle experience d edition decrite dans
 * `docs/editor-vision.md` (L1 -> L3). Objectifs pour cette etape :
 *
 *  1. Charger le CV du user via `GET /api/cv?profile=1`.
 *  2. L'afficher en plein ecran via `CvEditablePreview` (contentEditable
 *     deja en place sur tous les champs principaux).
 *  3. Auto-sauvegarder via `PUT /api/cv` (debounce 1.5s).
 *  4. Afficher un badge score ATS qui se met a jour si le template change.
 *  5. Offrir un bouton "Revenir au mode stable" qui repositionne le toggle.
 *
 * P1.2 -> P1.5 etoffent : topbar editeur avancee, inspector drawer,
 * boutons + flottants, handles de drag. P2 introduit le schema `layout`
 * (mise en page configurable).
 *
 * IMPORTANT : ce composant cohabite avec `ProfileView.jsx` (mode stable).
 * Toute regression visible ici ne doit pas affecter le mode stable, et
 * inversement : pas d effet de bord global, pas de mutation de stores
 * partages.
 */

const AUTO_SAVE_DELAY_MS = 1500;

export default function CvEditorBeta({
  session: _session,
  templateId,
  templateOptions,
  onTemplateIdChange,
  onTemplateOptionsChange,
}) {
  const [, setBetaMode] = useBetaMode();
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimerRef = useRef(null);
  const pendingCvRef = useRef(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setLoadError(null);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        if (aborted) return;
        const incoming = data && typeof data === 'object' ? data : {};
        setCv({ ...defaultCv, ...incoming });
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

  const flushSave = useCallback(async () => {
    const next = pendingCvRef.current;
    if (!next) return;
    pendingCvRef.current = null;
    setSaveStatus('saving');
    try {
      await apiPut('/api/cv', {
        ...next,
        template_id: templateId,
        template_options: templateOptions,
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error('[CvEditorBeta] auto-save echec', err);
    }
  }, [templateId, templateOptions]);

  const handleCvChange = useCallback((nextCv) => {
    setCv(nextCv);
    pendingCvRef.current = nextCv;
    setSaveStatus('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, AUTO_SAVE_DELAY_MS);
  }, [flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleDisableBeta = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      flushSave().finally(() => setBetaMode(false));
      return;
    }
    setBetaMode(false);
  };

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
          <span className="cv-editor-beta-title">Éditeur de CV — édition inline</span>
        </div>
        <div className="cv-editor-beta-topbar-right">
          <SaveStatusPill status={saveStatus} />
          <EditorAtsScoreBadge templateId={templateId} cv={cv} />
          <button
            type="button"
            className="cv-editor-beta-back-btn"
            onClick={handleDisableBeta}
            title="Quitter le mode Beta et revenir à la version stable"
          >
            ← Mode stable
          </button>
        </div>
      </header>

      {loadError && (
        <div className="cv-editor-beta-error" role="alert">
          {loadError}
        </div>
      )}

      <main className="cv-editor-beta-canvas">
        <CvEditablePreview
          cv={cv}
          baseCv={cv}
          onChange={handleCvChange}
          templateId={templateId}
          templateOptions={templateOptions}
        />
      </main>

      <footer className="cv-editor-beta-statusbar">
        <span>L1 inline en construction · L2/L3 + drawer inspecteur à venir</span>
        <span className="cv-editor-beta-statusbar-template">Template : {templateId}</span>
      </footer>
      {/* Les props onTemplateIdChange / onTemplateOptionsChange seront branchees
          en P1.2 quand on ajoutera un selecteur de template a la topbar editeur. */}
      <SuppressUnusedWarnings
        onTemplateIdChange={onTemplateIdChange}
        onTemplateOptionsChange={onTemplateOptionsChange}
      />
    </div>
  );
}

function SaveStatusPill({ status }) {
  if (status === 'idle') return null;
  const label = {
    pending: 'Modifications…',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    error: 'Erreur d’enregistrement',
  }[status] || '';
  return (
    <span className={`cv-editor-beta-save-pill cv-editor-beta-save-pill--${status}`} role="status">
      {label}
    </span>
  );
}

/**
 * Composant techniquement vide : sert uniquement a referencer les props
 * passees par le switcher pour eviter un warning eslint "defined but never
 * used" tant qu on n a pas branche le selecteur de template (P1.2).
 * A retirer en P1.2.
 */
function SuppressUnusedWarnings({ onTemplateIdChange, onTemplateOptionsChange }) {
  void onTemplateIdChange;
  void onTemplateOptionsChange;
  return null;
}
