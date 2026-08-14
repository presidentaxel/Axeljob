import { useState, useRef } from 'react';
import { apiPost, apiPostFile, apiPut, trackEvent } from '../api';
import '../styles/OnboardingWizard.css';

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
  const [parsedCv, setParsedCv] = useState(null);
  const [cvText, setCvText] = useState('');
  const fileRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setMethod('upload');
    setError('');
    setLoading(true);
    trackEvent('onboarding_method_chosen', { method: 'file_upload' });
    try {
      const data = await apiPostFile('/api/cv/import', file);
      setParsedCv(data.cv);
      setStep(1);
    } catch (err) {
      setError(err.message || 'Impossible de lire le CV. Essaie le copier-coller.');
    } finally {
      setLoading(false);
    }
  };

  const handleTextImport = async () => {
    if (!cvText.trim()) return;
    setMethod('text');
    setError('');
    setLoading(true);
    trackEvent('onboarding_method_chosen', { method: 'text_paste' });
    try {
      const data = await apiPost('/api/cv/import-text', { text: cvText.trim() });
      setParsedCv(data.cv);
      setStep(1);
    } catch (err) {
      setError(err.message || 'Impossible de parser le texte.');
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="onb-overlay">
      <div className="onb-card">
        <StepIndicator current={step} />

        {step === 0 && (
          <div className="onb-content">
            <h1 className="onb-title">Bienvenue sur AxeL Job</h1>
            <p className="onb-subtitle">
              Pour commencer, on a besoin de tes informations. Choisis comment les importer :
            </p>
            {error && <div className="onb-error">{error}</div>}

            <div className="onb-methods">
              <button type="button" className="onb-method-card" onClick={() => fileRef.current?.click()} disabled={loading}>
                <div className="onb-method-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
                  </svg>
                </div>
                <span className="onb-method-title">Importer un CV</span>
                <span className="onb-method-desc">PDF ou Word - on extrait tout automatiquement</span>
              </button>

              <button type="button" className="onb-method-card" onClick={handleManual} disabled={loading}>
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
                />
                <button
                  type="button"
                  className="btn btn-primary onb-btn-parse"
                  onClick={handleTextImport}
                  disabled={loading || !cvText.trim()}
                >
                  {loading && method === 'text' ? 'Analyse en cours…' : 'Analyser mon CV'}
                </button>
              </details>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="onb-file-hidden"
              onChange={handleFileUpload}
            />
            {loading && method === 'upload' && (
              <div className="onb-loading">
                <span className="onb-spinner" />
                <span>Analyse du CV en cours…</span>
              </div>
            )}
          </div>
        )}

        {step === 1 && parsedCv && (
          <div className="onb-content">
            <h1 className="onb-title">Ton profil</h1>
            <p className="onb-subtitle">
              Voici ce qu'on a extrait. Tu pourras tout modifier en détail après.
            </p>
            {error && <div className="onb-error">{error}</div>}

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
              <button type="button" className="btn btn-primary" onClick={handleConfirmProfile} disabled={loading}>
                {loading ? 'Sauvegarde…' : 'On continue'}
              </button>
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
              <button type="button" className="btn btn-primary btn-lg" onClick={handleLaunch}>
                Lancer ma première candidature
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleGoToProfile}>
                Compléter mon profil d'abord
              </button>
            </div>
          </div>
        )}

        {step === 0 && (
          <button type="button" className="onb-skip" onClick={() => { trackEvent('onboarding_skipped', {}); onComplete('candidatures'); }}>
            Passer pour l'instant
          </button>
        )}
      </div>
    </div>
  );
}
