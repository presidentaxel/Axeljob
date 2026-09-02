import { useEffect, useRef, useState } from 'react';
import { apiPost, apiPostFile, apiPut, trackEvent } from '../api';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import {
  cvFromImportPayload,
  finishImportLoadingAnimation,
  isSparseImportedCv,
  ONBOARDING_IMPORT_STEPS,
  onboardingImportErrorMessage,
  startImportLoadingAnimation,
} from '../lib/cvImportUtils.js';
import '../styles/OnboardingWizard.css';
import CvImportLoadingOverlay from './CvImportLoadingOverlay.jsx';
import Button from './ui/Button.jsx';

const STEPS = ['Importer', 'Vérifier', 'C\'est parti'];

function StepIndicator({ current }) {
  return (
    <div className="onb-steps">
      {STEPS.map((label, i) => (
        <div key={label} className={`onb-step ${i < current ? 'done' : ''} ${i === current ? 'active' : ''}`}>
          <span className="onb-step-dot">
            {i < current ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <span>{i + 1}</span>
            )}
          </span>
          <span className="onb-step-label">{label}</span>
        </div>
      ))}
      <div className="onb-steps-line" />
    </div>
  );
}

export default function OnboardingWizard({ session, onComplete }) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sparseHint, setSparseHint] = useState(false);
  const [parsedCv, setParsedCv] = useState(null);
  const [cvText, setCvText] = useState('');
  const [importStepIndex, setImportStepIndex] = useState(0);
  const fileRef = useRef(null);
  const importCleanupRef = useRef(null);

  useEffect(() => () => {
    if (importCleanupRef.current) importCleanupRef.current();
  }, []);

  const runCvAnalysis = async (requestFn) => {
    setError('');
    setSparseHint(false);
    setLoading(true);
    setImportStepIndex(0);
    if (importCleanupRef.current) importCleanupRef.current();
    importCleanupRef.current = startImportLoadingAnimation(setImportStepIndex, {
      steps: ONBOARDING_IMPORT_STEPS,
    });
    try {
      const data = await requestFn();
      finishImportLoadingAnimation(setImportStepIndex, { steps: ONBOARDING_IMPORT_STEPS });
      const cv = cvFromImportPayload(data?.cv || data);
      setParsedCv(cv);
      setSparseHint(isSparseImportedCv(cv));
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      setStep(1);
    } catch (err) {
      setError(onboardingImportErrorMessage(err));
    } finally {
      if (importCleanupRef.current) {
        importCleanupRef.current();
        importCleanupRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setMethod('upload');
    trackEvent('onboarding_method_chosen', { method: 'file_upload' });
    try {
      await runCvAnalysis(() => apiPostFile('/api/cv/import', file));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleTextImport = async () => {
    if (!cvText.trim()) return;
    setMethod('text');
    trackEvent('onboarding_method_chosen', { method: 'text_paste' });
    await runCvAnalysis(() => apiPost('/api/cv/import-text', { text: cvText.trim() }));
  };

  const handleManual = () => {
    setMethod('manual');
    trackEvent('onboarding_method_chosen', { method: 'manual' });
    onComplete('profil');
  };

  const handleConfirmProfile = async () => {
    if (!parsedCv) return;
    setError('');
    setLoading(true);
    try {
      await apiPut('/api/cv', parsedCv);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Erreur de sauvegarde.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunch = () => {
    trackEvent('onboarding_completed', { method: method || 'unknown' });
    try {
      const uid = session?.user?.id;
      if (uid) sessionStorage.setItem(`cv_bot_post_onb_bridge_${uid}`, '1');
    } catch (_) { /* ignore */ }
    onComplete('candidatures');
  };

  const handleGoToProfile = async () => {
    if (parsedCv) {
      try {
        await apiPut('/api/cv', parsedCv);
      } catch {
        /* import optional on navigation */
      }
    }
    onComplete('profil');
  };

  const analyzing = loading && step === 0 && (method === 'upload' || method === 'text');

  return (
    <div className="onb-overlay" aria-busy={analyzing || undefined}>
      <div className="onb-card">
        <StepIndicator current={step} />

        {step === 0 && (
          <div className="onb-content">
            <h1 className="onb-title">Bienvenue sur AxeL Job</h1>
            <p className="onb-subtitle">
              Pour commencer, on a besoin de tes informations. Choisis comment les importer :
            </p>
            {error && <div className="onb-error" role="alert">{error}</div>}

            <div className="onb-methods">
              <button type="button" className="onb-method-card" onClick={() => fileRef.current?.click()} disabled={loading} {...analyticsAttrs('onboarding-methods-cta-import', 'methods', 'primary', 'cta')}>
                <div className="onb-method-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
                  </svg>
                </div>
                <span className="onb-method-title">Importer un CV</span>
                <span className="onb-method-desc">PDF texte ou Word (.docx) — pas de PDF scanné</span>
              </button>

              <button type="button" className="onb-method-card" onClick={handleManual} disabled={loading} {...analyticsAttrs('onboarding-methods-cta-manual', 'methods', 'secondary', 'cta')}>
                <div className="onb-method-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
                <span className="onb-method-title">Saisie manuelle</span>
                <span className="onb-method-desc">Remplis ton profil étape par étape</span>
              </button>
            </div>

            <div className="onb-text-import">
              <details>
                <summary>Ou colle le texte de ton CV ici</summary>
                <textarea
                  className="onb-textarea"
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                  placeholder="Copie-colle le contenu de ton CV ici..."
                  rows={6}
                  disabled={loading}
                  {...analyticsAttrs('onboarding-paste-input-text', 'paste', 'tertiary', 'input')}
                />
                <Button
                  type="button"
                  variant="primary"
                  className="onb-btn-parse"
                  onClick={handleTextImport}
                  disabled={loading || !cvText.trim()}
                  loading={loading && method === 'text'}
                  {...analyticsAttrs('onboarding-paste-cta-parse', 'paste', 'secondary', 'cta')}
                >
                  {loading && method === 'text' ? 'Analyse en cours…' : 'Analyser mon CV'}
                </Button>
              </details>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="onb-file-hidden"
              onChange={handleFileUpload}
              disabled={loading}
            />
          </div>
        )}

        {step === 1 && parsedCv && (
          <div className="onb-content">
            <h1 className="onb-title">Ton profil</h1>
            <p className="onb-subtitle">
              Voici ce qu'on a extrait. Tu pourras tout modifier en détail après.
            </p>
            {error && <div className="onb-error" role="alert">{error}</div>}
            {sparseHint && (
              <div className="onb-sparse" role="status">
                Peu d’infos extraites. Tu peux continuer, puis compléter ton profil à la main.
              </div>
            )}

            <div className="onb-review">
              <div className="onb-review-section">
                <h3>Identité</h3>
                <div className="onb-review-grid">
                  <span className="onb-review-label">Nom</span>
                  <span>{parsedCv.prenom} {parsedCv.nom}</span>
                  <span className="onb-review-label">Email</span>
                  <span>{parsedCv.email || '-'}</span>
                  <span className="onb-review-label">Téléphone</span>
                  <span>{parsedCv.telephone || '-'}</span>
                  <span className="onb-review-label">Titre</span>
                  <span>{parsedCv.titre_professionnel || '-'}</span>
                </div>
              </div>

              <div className="onb-review-section">
                <h3>Expériences ({(parsedCv.experiences || []).length})</h3>
                {(parsedCv.experiences || []).map((exp, i) => (
                  <div key={exp.id || i} className="onb-review-exp">
                    <strong>{exp.poste || 'Sans titre'}</strong> - {exp.entreprise || ''}
                    {exp.date_debut && <span className="onb-review-date"> ({exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : ''})</span>}
                  </div>
                ))}
              </div>

              <div className="onb-review-section">
                <h3>Formations ({(parsedCv.formations || []).length})</h3>
                {(parsedCv.formations || []).map((f, i) => (
                  <div key={f.id || i} className="onb-review-exp">
                    <strong>{f.diplome || 'Sans titre'}</strong> - {f.etablissement || ''}
                  </div>
                ))}
              </div>

              {parsedCv.competences && (
                <div className="onb-review-section">
                  <h3>Compétences</h3>
                  <p className="onb-review-skills">
                    {[
                      ...(parsedCv.competences.techniques || []),
                      ...(parsedCv.competences.logiciels || []),
                    ].filter(Boolean).join(' · ') || '-'}
                  </p>
                </div>
              )}
            </div>

            <div className="onb-actions">
              <Button type="button" variant="primary" onClick={handleConfirmProfile} disabled={loading} loading={loading} {...analyticsAttrs('onboarding-review-cta-confirm', 'review', 'primary', 'cta')}>
                {loading ? 'Sauvegarde…' : 'On continue'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onb-content onb-content--ready">
            <div className="onb-ready-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h1 className="onb-title">Ton profil est prêt !</h1>
            <p className="onb-subtitle">
              Tu peux maintenant adapter ton CV à n'importe quelle offre d'emploi.
              Colle une annonce et l'IA fera le reste.
            </p>
            <div className="onb-actions">
              <Button type="button" variant="primary" size="lg" onClick={handleLaunch} {...analyticsAttrs('onboarding-done-cta-launch', 'done', 'primary', 'cta')}>
                Créer mon CV adapté
              </Button>
              <Button type="button" variant="link" className="onb-actions__link" onClick={handleGoToProfile} {...analyticsAttrs('onboarding-done-cta-profil', 'done', 'secondary', 'cta')}>
                Compléter mon profil d&apos;abord
              </Button>
            </div>
          </div>
        )}

        {step === 0 && (
          <button
            type="button"
            className="onb-skip"
            disabled={loading}
            onClick={() => { trackEvent('onboarding_skipped', {}); onComplete('candidatures'); }}
            {...analyticsAttrs('onboarding-cta-skip', 'overlay', 'tertiary', 'cta')}
          >
            Passer pour l'instant
          </button>
        )}
      </div>

      {analyzing && (
        <CvImportLoadingOverlay
          stepIndex={importStepIndex}
          steps={ONBOARDING_IMPORT_STEPS}
          title="Analyse de ton CV en cours"
          subtitle="On lit ton document, puis on structure le profil. Ça peut prendre jusqu’à une minute."
        />
      )}
    </div>
  );
}
