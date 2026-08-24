import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import DOMPurify from 'dompurify';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  apiGet,
  apiPost,
  apiPostStream,
  apiPatch,
  apiPostBlob,
  apiPostFormData,
  getDownloadPermissionHint,
  prepareAppleDownloadWindow,
  saveBlobWithPreferredMethod,
  setAuthToken,
  setUnauthorizedCallback,
  trackEvent,
} from './api';
import { ensureAnalyticsFirstTouch, getStoredAttribution } from './analyticsSession';
import { resetTemplateOptionsToDefaults } from './lib/templateOptionsSchema.js';
import { useViewAnalytics } from './useViewAnalytics';
import { supabase } from './lib/supabase';
import { fetchAuthSessionWithTimeout } from './lib/supabaseAuthSession';
import AuthForm from './components/AuthForm';
import AppTopbar from './components/AppTopbar';
import CompanyLogo from './components/CompanyLogo';
import CandidatureBoardCard from './components/CandidatureBoardCard';
import { NotFoundPage } from './components/ErrorPages';
import Button from './components/ui/Button.jsx';
import AdaptLanguageChoiceDialog from './components/ui/AdaptLanguageChoiceDialog.jsx';
import { CONTACT_EMAIL, STORAGE_EXPORT_DIR, STORAGE_EXPORT_ATS_BLOCK_SNOOZE, STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE, STORAGE_PDF_EXPORT_FILENAME_PATTERN, STATUT_LABELS, KANBAN_COLUMNS, getExportFolderName } from './constants';
import { buildAdaptedPdfFilename } from './lib/pdfExportFilename';
import { getPdfSaveStartInDirectoryHandle } from './lib/pdfExportStartDirIdb';
import { HiDocumentText, HiArrowDownTray, HiClipboardDocumentList, HiPencilSquare, HiChatBubbleLeftRight, HiCheck, HiSwatch, HiChevronDown, HiChevronUp, HiPlus } from 'react-icons/hi2';
import { lazyWithChunkReload, clearChunkErrorReloadKey } from './lib/lazyChunkReload';
import { APP_DEFAULT_ROUTE, APP_ROUTES, getViewFromPathname, isKnownAppPathname } from './lib/appRoutes';
import { syncRobotsMeta } from './lib/seoHead';
import './App.css';
import './styles/TemplatePicker.css';
import './styles/GuidedTour.css';
import { formatApplicationDateLabel, formatApplicationRelativeLabel } from './lib/applicationDates';
import { adaptLanguageNotice, shouldPromptLanguageChoice, withAdaptLanguageNotice } from './lib/adaptLanguageNotice.js';
import { computeApplicationMetrics, isApplicationToFollowUp } from './lib/applicationStats.js';
import { applyA4PageFramesToDocument, syncCvPreviewIframeHeight } from './lib/cvPreviewA4Pages';
import {
  betaCanvasRenderFields,
  withBetaCanvasTemplate,
} from './lib/betaCanvasTemplate.js';

const ProfileView = lazyWithChunkReload(() => import('./components/editor/ProfileViewSwitcher'));
const SettingsView = lazyWithChunkReload(() => import('./components/SettingsView'));
const LandingPage = lazyWithChunkReload(() => import('./components/LandingPage'));
const LegalPages = lazyWithChunkReload(() => import('./components/LegalPages'));
const AtsPage = lazyWithChunkReload(() => import('./components/AtsPage'));
const ArticlesPages = lazyWithChunkReload(() => import('./components/ArticlesPages'));
const FaqPage = lazyWithChunkReload(() => import('./components/FaqPage'));
const OnboardingWizard = lazyWithChunkReload(() => import('./components/OnboardingWizard'));
const CvEditablePreview = lazyWithChunkReload(() => import('./components/CvEditablePreview'));
const ApplicationDetailModal = lazyWithChunkReload(() => import('./components/ApplicationDetailModal'));
const TemplatePicker = lazyWithChunkReload(() => import('./components/TemplatePicker'));
const GuidedTour = lazyWithChunkReload(() => import('./components/GuidedTour'));
const SupportHighlight = lazyWithChunkReload(() => import('./components/SupportHighlight'));
const MonitoringDashboard = lazyWithChunkReload(() => import('./components/MonitoringDashboard'));

function shouldShowExportAtsBlockModal() {
  try {
    const until = parseInt(localStorage.getItem(STORAGE_EXPORT_ATS_BLOCK_SNOOZE) || '0', 10);
    if (!Number.isFinite(until) || until <= 0) return true;
    return Date.now() >= until;
  } catch {
    return true;
  }
}

function shouldShowPreExportTemplateOptions() {
  try {
    return localStorage.getItem(STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE) !== '1';
  } catch {
    return false;
  }
}

/** Seuil de confiance sur le nom d'entreprise déduit de la fiche : en dessous, modale avant export PDF. */
const EXPORT_ENTREPRISE_CONFIDENCE_OK = 0.62;

/** URL logo entreprise (Clearbit, open source). Fallback: pas d’image. */

/** Affiche le logo entreprise ou l’initiale (style app bancaire). */

const TPL_FONT_SAFE = { 'Plus Jakarta Sans': "'Plus Jakarta Sans', Arial, sans-serif", 'Inter': "'Inter', Arial, sans-serif", 'Georgia': "Georgia, 'Times New Roman', serif" };

/** Évite de rappeler render-html à chaque pas de curseur (réglages template). */
const TEMPLATE_PREVIEW_DEBOUNCE_MS = 150;
const ADAPT_PLAN_STORAGE_PREFIX = 'cv_bot_adapt_plan_id_';
const ADAPT_DRAFT_STORAGE_PREFIX = 'cv_bot_adapt_draft_';

function MfaChallengeScreen({ onSuccess }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) throw new Error('Aucun facteur TOTP.');
      const { data: challengeData, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (chErr) throw chErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;
      onSuccess();
    } catch (err) {
      setError(err?.message || 'Code invalide. Réessaie.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-screen-card">
        <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
        <h1>Vérification en deux étapes</h1>
        <p className="login-screen-intro">Entre le code à 6 chiffres de ton application authentificatrice.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="auth-input"
            autoComplete="one-time-code"
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="button button-primary auth-submit" disabled={loading || code.length !== 6}>
            {loading ? '…' : 'Vérifier'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RecoveryPasswordForm({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      onDone();
    } catch (err) {
      setError(err.message || 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-screen-card">
        <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
        <h1>Nouveau mot de passe</h1>
        <p className="login-screen-intro">Choisis un nouveau mot de passe pour ton compte.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            autoComplete="new-password"
            minLength={6}
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="auth-input"
            autoComplete="new-password"
            minLength={6}
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="button button-primary auth-submit" disabled={loading}>
            {loading ? '…' : 'Définir le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CvEditPanel({ cv, onSave, onClose }) {
  const [edited, setEdited] = useState(() => ({
    ...cv,
    experiences: (cv.experiences || []).map((e) => {
      const b = e.bullet_points || [];
      return { ...e, bullet_points: [b[0] || '', b[1] || '', b[2] || ''] };
    }),
  }));
  const update = (path, value) => {
    if (path.startsWith('experiences.')) {
      const parts = path.split('.');
      const idx = parseInt(parts[1], 10);
      const field = parts[2];
      if (field === 'bullet_points') {
        setEdited((prev) => {
          const next = [...(prev.experiences || [])];
          next[idx] = { ...next[idx], bullet_points: value };
          return { ...prev, experiences: next };
        });
        return;
      }
    }
    setEdited((prev) => ({ ...prev, [path]: value }));
  };
  const handleSave = () => {
    const out = { ...edited };
    out.experiences = (edited.experiences || []).map((e) => ({
      ...e,
      bullet_points: (e.bullet_points || []).filter((b) => (b || '').trim()).slice(0, 3),
    }));
    onSave(out);
  };
  const setExpBullet = (expIndex, bulletIndex, value) => {
    setEdited((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = [...(next[expIndex].bullet_points || ['', '', ''])];
      bullets[bulletIndex] = value;
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };
  return (
    <div className="application-detail-overlay cv-edit-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cv-edit-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cv-edit-header">
          <h3>Modifier le texte du CV</h3>
          <button type="button" className="btn-close-detail" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="cv-edit-body">
          <label className="input-label">Titre professionnel</label>
          <input type="text" className="input-field" value={edited.titre_professionnel || ''} onChange={(e) => update('titre_professionnel', e.target.value)} />
          <label className="input-label">Résumé / Accroche</label>
          <textarea className="input-field" rows={4} value={edited.resume || ''} onChange={(e) => update('resume', e.target.value)} />
          {(edited.experiences || []).map((exp, i) => (
            <div key={exp.id || i} className="cv-edit-exp">
              <span className="cv-edit-exp-title">{exp.poste || exp.entreprise || `Expérience ${i + 1}`}</span>
              {(exp.bullet_points || ['', '', '']).slice(0, 3).map((b, j) => (
                <textarea key={j} className="input-field" rows={2} value={b} onChange={(e) => setExpBullet(i, j, e.target.value)} placeholder={`Point ${j + 1}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="cv-edit-actions">
          <button type="button" className="button button-primary" onClick={handleSave}>Enregistrer les modifications</button>
          <button type="button" className="button button-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

/** Étapes complètes du tutoriel (référence unique). */
const TOUR_STEPS_ALL = [
  {
    selector: '.cv-chat-input',
    title: 'Colle une offre d\'emploi',
    content: 'C\'est ici que tout commence. Colle la fiche de poste et l\'IA adapte ton CV automatiquement.',
    position: 'top',
  },
  {
    selector: '.tpl-bar',
    title: 'Choisis ton template',
    content: 'Ouvre « Template » pour choisir le modèle de CV (classique, moderne, etc.).',
    position: 'bottom',
  },
  {
    selector: '.tpl-gear',
    title: 'Réglages du CV',
    content: 'La roue dentée ouvre les réglages : couleurs, police, photo sur le CV, densité du texte et options d’affichage. Tout se met à jour en direct sur l’aperçu.',
    position: 'bottom',
  },
  {
    selector: '.cv-chat-preview',
    title: 'Aperçu en direct',
    content: 'Ton CV mis à jour s\'affiche ici. Tu peux cliquer sur le texte pour le modifier directement.',
    position: 'left',
  },
  {
    id: 'preview-ai-highlight',
    selector: '.preview-wrap',
    title: 'Les changements en vert',
    content: 'Quand l’IA adapte ton CV, les mots et phrases modifiés sont surlignés en vert (comme dans l’aperçu ci-contre). C’est le même rendu que après une vraie adaptation.',
    position: 'left',
  },
  {
    selector: '[href="/app/postule"]',
    title: 'Suis tes candidatures',
    content: 'Chaque CV adapté crée une candidature. Retrouve-les toutes ici avec le suivi.',
    position: 'bottom',
  },
  {
    selector: '[href="/app/profil"]',
    title: 'Ton profil de base',
    content: 'Complète ton profil une fois, et il servira de base pour toutes tes adaptations.',
    position: 'bottom',
  },
];

/** Phase 1 (après onboarding) : étapes 1, 2 et 5 du parcours complet. */
const TOUR_STEPS_PHASE1 = [TOUR_STEPS_ALL[0], TOUR_STEPS_ALL[1], TOUR_STEPS_ALL[4]];

/** Phase 2 (première adaptation, chargement IA) : étapes 3, 6 et 7. */
const TOUR_STEPS_PHASE2 = [TOUR_STEPS_ALL[2], TOUR_STEPS_ALL[5], TOUR_STEPS_ALL[6]];

const TOUR_STEP_PREVIEW_AI_HIGHLIGHT = 'preview-ai-highlight';

/** Aperçu démo vert instantané (pas d’appel API) si le profil est encore vide à l’étape 3 du tutoriel. */
const TOUR_INSTANT_GREEN_DEMO_HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font-family:Plus Jakarta Sans,system-ui,sans-serif;padding:1.5rem;max-width:520px;margin:0 auto;background:#fafafa;color:#1e293b;line-height:1.55;font-size:15px;}
  .fake-h{font-size:1.05rem;font-weight:700;margin:0 0 0.75rem;}
  .fake-p{margin:0.4rem 0;font-size:0.88rem;color:#475569;}
  .cv-changed{background:rgba(34,197,94,0.38);padding:0 3px;border-radius:3px;}
</style></head><body>
  <p class="fake-h">Exemple : surlignage vert</p>
  <p class="fake-p">Après une vraie annonce, les passages <span class="cv-changed">adaptés par l’IA</span> apparaissent en vert dans ton CV.</p>
  <p class="fake-p">Ceci est une <span class="cv-changed">démo immédiate</span> - dès que ton CV est importé, l’aperçu utilisera tes données.</p>
</body></html>`;

/** Profil minimal pour afficher une démo surlignée sans adaptation en cours */
function hasProfilMinContent(cv) {
  if (!cv || typeof cv !== 'object') return false;
  if ((cv.titre_professionnel || '').trim()) return true;
  if ((cv.resume || '').trim()) return true;
  return (cv.experiences || []).some((e) =>
    (e?.poste || '').trim()
    || (e?.entreprise || '').trim()
    || (e?.bullet_points || []).some((b) => (b || '').trim()),
  );
}

/** Copie légèrement modifiée du profil pour générer des <span class="cv-changed"> via l’API */
function buildTourDemoAdaptedFromBase(base) {
  const cv = JSON.parse(JSON.stringify(base));
  const t = (cv.titre_professionnel || '').trim();
  cv.titre_professionnel = t ? `${t} · aligné sur l’offre` : 'Profil ciblé pour le poste';
  const r = (cv.resume || '').trim();
  cv.resume = r ? `${r}\nFormulations et mots-clés ajustés selon l’annonce.` : 'Synthèse adaptée aux exigences du poste visé.';
  const exps = cv.experiences || [];
  if (exps.length > 0 && exps[0]) {
    const exp = { ...exps[0] };
    const bullets = [...(exp.bullet_points || [])];
    if (bullets.length > 0 && (bullets[0] || '').trim()) {
      bullets[0] = `${(bullets[0] || '').trim()} - impact et résultats mis en avant pour l’offre.`;
    } else {
      bullets[0] = 'Réalisations reformulées pour correspondre au poste.';
    }
    exp.bullet_points = bullets;
    cv.experiences = [exp, ...exps.slice(1)];
  }
  return cv;
}

const TOUR_STATIC_DEMO_BASE_CV = {
  prenom: 'Camille',
  nom: 'Renard',
  email: '',
  telephone: '',
  linkedin: '',
  ville: 'Lyon',
  titre_professionnel: 'Chef de projet IT',
  resume: 'Gestion de projets digitaux et coordination d\'équipes interfonctionnelles.',
  photo_url: '',
  experiences: [
    {
      id: 'exp_tour_demo',
      poste: 'Chef de projet',
      entreprise: 'Numérix',
      secteur: '',
      date_debut: '2021',
      date_fin: '',
      lieu: '',
      contexte: '',
      bullet_points: [
        'Pilotage de projets web et applications métier',
        'Animation des rituels agiles',
      ],
      mots_cles: [],
      clients: '',
    },
  ],
  formations: [],
  certifications: [],
  competences: { techniques: ['Agile', 'Jira'], logiciels: [], langues: [], autres: [] },
  projets: [],
};

const TOUR_STATIC_DEMO_ADAPTED_CV = {
  ...TOUR_STATIC_DEMO_BASE_CV,
  titre_professionnel: 'Chef de projet IT - delivery & produit SaaS',
  resume:
    'Gestion de projets digitaux et coordination d\'équipes interfonctionnelles.\nMots-clés et livrables alignés sur le poste visé.',
  experiences: [
    {
      ...TOUR_STATIC_DEMO_BASE_CV.experiences[0],
      bullet_points: [
        'Pilotage de projets web et apps métier avec indicateurs utilisateurs',
        'Animation des rituels agiles (backlog priorisé)',
      ],
    },
  ],
};

/** Sujets Support : au clic, on ouvre la page et on affiche un spotlight + bulle sur l’élément concerné. */
const SUPPORT_TOPICS = [
  {
    id: 'adapter-cv',
    route: '/app/cv',
    selector: '.cv-chat-input',
    title: 'Adapter mon CV à une offre',
    description: 'Colle l\'annonce dans « Adapter un CV », envoie. L\'IA adapte ton CV. Tu peux affiner par message ou modifier le texte à la main.',
    bubbleTitle: 'Colle une offre ici',
    bubbleContent: 'C\'est ici que tout commence. Colle la fiche de poste et envoie : l\'IA adapte ton CV. Tu pourras affiner par message ou modifier le texte à la main.',
    position: 'top',
    icon: HiDocumentText,
  },
  {
    id: 'exporter-pdf',
    route: '/app/cv',
    selector: '.cv-chat-preview',
    title: 'Exporter en PDF',
    description: 'Après adaptation, utilise « Télécharger le PDF » dans la zone d\'export. Tu peux renseigner entreprise et intitulé pour le nom du fichier.',
    bubbleTitle: 'Zone d\'export',
    bubbleContent: 'Après avoir adapté ton CV, la zone d\'export avec le bouton « Télécharger le PDF » apparaît juste en dessous de l\'aperçu. Tu peux renseigner entreprise et intitulé pour le nom du fichier.',
    position: 'left',
    icon: HiArrowDownTray,
  },
  {
    id: 'suivre-candidatures',
    route: '/app/postule',
    selector: '.kanban-board',
    title: 'Suivre mes candidatures',
    description: 'Les candidatures sont dans « Mes candidatures ». Glisse les cartes pour changer le statut (à postuler, envoyée, entretien, refus…).',
    bubbleTitle: 'Suivi des candidatures',
    bubbleContent: 'Les candidatures s\'affichent ici. Glisse les cartes entre les colonnes pour changer le statut (à postuler, envoyée, entretien, refus…).',
    position: 'top',
    icon: HiClipboardDocumentList,
  },
  {
    id: 'modifier-texte-cv',
    route: '/app/cv',
    selector: '.cv-chat-preview',
    title: 'Modifier le texte du CV',
    description: 'En vue « Modifié », clique sur n\'importe quel texte dans l\'aperçu pour l\'éditer directement. Les changements sont pris en compte à la sortie du champ.',
    bubbleTitle: 'Édition directe',
    bubbleContent: 'En vue « Modifié », clique sur n\'importe quel texte dans l\'aperçu pour l\'éditer directement. Les changements sont pris en compte à la sortie du champ.',
    position: 'left',
    icon: HiPencilSquare,
  },
  {
    id: 'personnaliser-couleurs',
    route: '/app/cv',
    selector: '.tpl-options-modal',
    title: 'Personnaliser les couleurs et la police',
    description: 'Panneau à gauche, aperçu du CV à droite : tu règles en direct sans valider. Préréglages ou couleur au choix (nuancier complet).',
    bubbleTitle: 'Personnalisation + aperçu',
    bubbleContent: 'À gauche : en-tête, sidebar, accent, police, photo, ATS, typo. À droite : l’aperçu se met à jour tout de suite. Tu peux aussi choisir une couleur exacte via « Couleur au choix ».',
    position: 'left',
    icon: HiSwatch,
    openTemplateOptions: true,
  },
];

function SupportTicketSection() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticketEmail, setTicketEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiPost('/api/support-ticket', { subject: subject.trim(), message: message.trim() });
      setSuccess(true);
      setTicketEmail(data.email || '');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err?.message || 'Envoi impossible.');
    } finally {
      setLoading(false);
    }
  };

  const sendAnother = () => {
    setSuccess(false);
    setTicketEmail('');
  };

  return (
    <section className="support-conv">
      <h2 className="support-section-title">
        <HiChatBubbleLeftRight className="support-conv-title-icon" aria-hidden />
        Ouvrir un ticket
      </h2>
      <div className="support-conv-card">
        {success ? (
          <>
            <p className="support-ticket-success">
              Ticket envoyé. Tu recevras une réponse par email à <strong>{ticketEmail}</strong>.
            </p>
            <button type="button" className="button button-secondary support-ticket-another" onClick={sendAnother}>
              Envoyer un autre ticket
            </button>
          </>
        ) : (
          <>
            <p className="support-conv-placeholder-text">
              Décris ton problème ou ta question. Nous te répondrons par email à l&apos;adresse de ton compte.
            </p>
            <form onSubmit={handleSubmit} className="support-ticket-form">
              <input
                type="text"
                className="support-ticket-subject"
                placeholder="Sujet du ticket"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
              />
              <textarea
                className="support-ticket-message"
                placeholder="Ton message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={8000}
                required
              />
              {error && <p className="support-ticket-error">{error}</p>}
              <button type="submit" className="button button-primary support-ticket-submit" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer le ticket'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

function SupportReplySection() {
  const [toEmail, setToEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/api/support-reply', { to_email: toEmail.trim(), message: message.trim() });
      setSuccess(true);
      setToEmail('');
      setMessage('');
    } catch (err) {
      setError(err?.message || 'Envoi impossible.');
    } finally {
      setLoading(false);
    }
  };

  const sendAnother = () => {
    setSuccess(false);
  };

  return (
    <section className="support-conv">
      <h2 className="support-section-title">
        <HiChatBubbleLeftRight className="support-conv-title-icon" aria-hidden />
        Répondre à un utilisateur
      </h2>
      <div className="support-conv-card">
        {success ? (
          <>
            <p className="support-ticket-success">Message envoyé.</p>
            <button type="button" className="button button-secondary support-ticket-another" onClick={sendAnother}>
              Nouvelle réponse
            </button>
          </>
        ) : (
          <>
            <p className="support-conv-placeholder-text">
              Envoi d&apos;un email de support depuis l&apos;adresse configurée côté serveur vers l&apos;utilisateur concerné.
            </p>
            <form onSubmit={handleSubmit} className="support-ticket-form">
              <input
                type="email"
                className="support-ticket-subject"
                placeholder="Email du destinataire"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                maxLength={320}
                required
              />
              <textarea
                className="support-ticket-message"
                placeholder="Message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={8000}
                required
              />
              {error && <p className="support-ticket-error">{error}</p>}
              <button type="submit" className="button button-primary support-ticket-submit" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

const marketingSuspenseFallback = (
  <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span aria-hidden>Chargement…</span>
  </div>
);

function renderPublicMarketingPage(pathname, navigate) {
  if (pathname === '/mentions-legales' || pathname === '/confidentialite' || pathname === '/cgu') {
    return (
      <Suspense fallback={marketingSuspenseFallback}>
        <LegalPages page={pathname.slice(1)} onBack={() => navigate('/')} />
      </Suspense>
    );
  }
  if (pathname === '/ats') {
    return (
      <Suspense fallback={marketingSuspenseFallback}>
        <AtsPage onBack={() => navigate('/')} />
      </Suspense>
    );
  }
  if (
    pathname === '/modeles-cv' ||
    pathname === '/guide-cv' ||
    pathname === '/erreurs-cv' ||
    pathname === '/cv-par-metier' ||
    pathname === '/cv-adapte-chaque-offre'
  ) {
    return (
      <Suspense fallback={marketingSuspenseFallback}>
        <ArticlesPages slug={pathname.slice(1)} onBack={() => navigate('/')} />
      </Suspense>
    );
  }
  if (pathname === '/faq') {
    return (
      <Suspense fallback={marketingSuspenseFallback}>
        <FaqPage onBack={() => navigate('/')} />
      </Suspense>
    );
  }
  return null;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const view = getViewFromPathname(pathname);
  const analyticsView = pathname.startsWith('/app') ? view : null;
  const isCvView = view === 'cv';
  const [annonce, setAnnonce] = useState('');
  const [lastAdaptedCv, setLastAdaptedCv] = useState(null);
  const lastAdaptedCvRef = useRef(null);
  lastAdaptedCvRef.current = lastAdaptedCv;
  const [lastBaseCv, setLastBaseCv] = useState(null);
  /** URL photo fraîche (GET /api/cv) pour la preview CV, évite URL signée expirée */
  const [freshPreviewPhotoUrl, setFreshPreviewPhotoUrl] = useState(undefined);
  const [lastAdaptationId, setLastAdaptationId] = useState(null);
  const [lastSelectionA4, setLastSelectionA4] = useState(null);
  const [previewVariant, setPreviewVariant] = useState('modified');
  const [originalPreviewHtml, setOriginalPreviewHtml] = useState('');
  const [modifiedPreviewHtml, setModifiedPreviewHtml] = useState('');
  /** HTML du dernier rendu passé par setPreviewHtml (aperçu sans CV adapté, ex. GET /api/cv/preview) */
  const [previewHtmlFallback, setPreviewHtmlFallback] = useState('');
  const [rapport, setRapport] = useState(null);
  const [rapportBefore, setRapportBefore] = useState(null);
  const [error, setError] = useState('');
  const [exportBlockVisible, setExportBlockVisible] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [entrepriseNom, setEntrepriseNom] = useState('');
  const [posteNom, setPosteNom] = useState('');
  const [exportDossierPath, setExportDossierPath] = useState('');
  const [applications, setApplications] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [applicationSearchQuery, setApplicationSearchQuery] = useState('');
  const [applicationSearchDebounced, setApplicationSearchDebounced] = useState('');
  /** Filtre métrique : `relancer` | null */
  const [candidaturesMetricFilter, setCandidaturesMetricFilter] = useState(null);
  /** Erreur locale Mes candidatures (ne touche pas `error`/`rapport` de la vue CV) */
  const [candidaturesError, setCandidaturesError] = useState('');
  /* sidebar removed - now using topbar layout */
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [loginOtpExpired, setLoginOtpExpired] = useState(false);
  const [applicationDetailId, setApplicationDetailId] = useState(null);
  const iframeRef = useRef(null);
  const previewWrapRef = useRef(null);
  const chatMessagesEndRef = useRef(null);
  /** Photo Supabase : fenêtre 1 semaine ; si l'URL a expiré, déco + redirect login pour tout remettre à jour */
  const handlePhotoSessionExpired = () => {
    if (supabase) supabase.auth.signOut();
    navigate('/login', { replace: true });
  };
  // Modals quali (refus / interview) pour mémoire
  const [statutModalType, setStatutModalType] = useState(null);
  const [statutModalAppId, setStatutModalAppId] = useState(null);
  const [statutModalApp, setStatutModalApp] = useState(null);
  const [refusRaisonType, setRefusRaisonType] = useState('');
  const [refusRaison, setRefusRaison] = useState('');
  const [interviewType, setInterviewType] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [sourceOffreValue, setSourceOffreValue] = useState('');
  const [statutModalSubmitting, setStatutModalSubmitting] = useState(false);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [usage, setUsage] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [adaptStepIndex, setAdaptStepIndex] = useState(0);
  const [adaptStepLabels, setAdaptStepLabels] = useState([
    'Analyse des mots-clés',
    'Extraction des compétences',
    'Réécriture du résumé',
    'Adaptation des expériences',
    'Optimisation ATS',
    'Finalisation',
  ]);
  /** true quand l’API a répondu ; on n’affiche le résultat qu’une fois l’animation à la dernière étape */
  const [apiAdaptDone, setApiAdaptDone] = useState(false);
  const pendingAdaptResultRef = useRef(null);
  /** Annule un flux d'adaptation précédent si un nouveau démarre (double clic / relance rapide). */
  const adaptRunAbortRef = useRef(null);
  /** Identifiant de run d’adaptation (évite qu’un AbortError d’un run annulé coupe l’UI d’un run plus récent). */
  const adaptRunGenRef = useRef(0);
  const adaptActiveRunIdRef = useRef(0);
  /** Évite un POST /api/render-html redondant juste après adaptation (HTML déjà fourni par le flux). */
  const suppressAdaptedPreviewRef = useRef(false);
  const sourceOffreDebounceRef = useRef(null);
  const [kanbanDraggedId, setKanbanDraggedId] = useState(null);
  const [kanbanDragOverColumn, setKanbanDragOverColumn] = useState(null);
  const [atsDisclaimerVisible, setAtsDisclaimerVisible] = useState(false);
  const [pendingPdfAction, setPendingPdfAction] = useState(null);
  const [exportAtsBlockModalOpen, setExportAtsBlockModalOpen] = useState(false);
  const [exportAtsBlockPendingAction, setExportAtsBlockPendingAction] = useState(null);
  const [exportAtsBlockModalShowMotsCles, setExportAtsBlockModalShowMotsCles] = useState(true);
  const [exportAtsBlockReminderMode, setExportAtsBlockReminderMode] = useState('every');
  const pendingExportTemplateOptionsRef = useRef(null);
  const preExportPendingActionRef = useRef(null);
  /** Indices export (poste / entreprise / confiance) alignés sur lastAdaptationId. */
  const exportHintsRef = useRef(null);
  const entrepriseFieldTouchedRef = useRef(false);
  const pdfEntrepriseModalMergedPosteRef = useRef('');
  const pdfEntrepriseModalPendingOptsRef = useRef(null);
  const [baseCvPdfLoading, setBaseCvPdfLoading] = useState(false);
  const [pdfEntrepriseModalOpen, setPdfEntrepriseModalOpen] = useState(false);
  const [pdfEntrepriseModalValue, setPdfEntrepriseModalValue] = useState('');
  const [exportPrepTemplateOptionsNonce, setExportPrepTemplateOptionsNonce] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [adaptTodoPlan, setAdaptTodoPlan] = useState(null);
  const [, setAdaptTodoExplain] = useState('');
  const [, setAdaptTodoExplainLoading] = useState(false);
  /** En attente de la réponse /api/adapt-plan après envoi de l’offre. */
  const [adaptPlanLoading, setAdaptPlanLoading] = useState(false);
  const [adaptTodoLastAction, setAdaptTodoLastAction] = useState('');
  const [adaptLanguageModalOpen, setAdaptLanguageModalOpen] = useState(false);
  const [adaptLanguageMeta, setAdaptLanguageMeta] = useState(null);
  const pendingAdaptAfterLanguageRef = useRef(null);
  const [adaptRunStepIds, setAdaptRunStepIds] = useState([]);
  /** Suivi des étapes par id (ordre backend ≠ ordre d’affichage de la todo). */
  const [adaptStreamRunningStepId, setAdaptStreamRunningStepId] = useState(null);
  const [adaptStreamDoneStepIds, setAdaptStreamDoneStepIds] = useState([]);
  const [adaptStreamMode, setAdaptStreamMode] = useState(false);
  const [expandedUserMessages, setExpandedUserMessages] = useState({});
  const [lastAdaptRunConfig, setLastAdaptRunConfig] = useState(null);
  const [cvEditPanelOpen, setCvEditPanelOpen] = useState(false);
  const [atsScoreOpen, setAtsScoreOpen] = useState(false);
  const [adaptRating, setAdaptRating] = useState(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupEntreprise, setSetupEntreprise] = useState('');
  const [setupPoste, setSetupPoste] = useState('');
  const [setupFiche, setSetupFiche] = useState('');
  const [addManualModalOpen, setAddManualModalOpen] = useState(false);
  const [candidaturesAddMenuOpen, setCandidaturesAddMenuOpen] = useState(false);
  const candidaturesAddMenuRef = useRef(null);
  const [addManualPoste, setAddManualPoste] = useState('');
  const [addManualEntreprise, setAddManualEntreprise] = useState('');
  const [addManualStatut, setAddManualStatut] = useState('candidature_envoyee');
  const [addManualSource, setAddManualSource] = useState('');
  const [addManualSubmitting, setAddManualSubmitting] = useState(false);
  const [addManualPdfLettre, setAddManualPdfLettre] = useState(null);
  const [addManualPdfCv, setAddManualPdfCv] = useState(null);
  const [addManualPdfFiche, setAddManualPdfFiche] = useState(null);
  const [justAddedAppId, setJustAddedAppId] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  /** Erreur réseau/API sur GET /api/cv?profile=1 - ne pas confondre avec « profil vide ». */
  const [profileCvLoadError, setProfileCvLoadError] = useState(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  /** Évite de repasser onboardingChecked à false (écran « Chargement… ») sur un simple refresh profil / même user. */
  const profileGateIdentityRef = useRef('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);
  const [mfaChallengeChecked, setMfaChallengeChecked] = useState(false);
  const [templateId, setTemplateId] = useState(() => localStorage.getItem('cv_template_id') || 'minimal');
  const [templateOptions, setTemplateOptions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cv_template_options') || '{}'); } catch { return {}; }
  });
  const [templatesList, setTemplatesList] = useState([]);
  /** Layout canvas Beta du profil (pour template virtuel `beta`). */
  const [profileLayout, setProfileLayout] = useState(null);
  const profileLayoutRef = useRef(null);
  profileLayoutRef.current = profileLayout;

  const postRenderHtml = useCallback((body) => apiPost('/api/render-html', {
    ...body,
    ...betaCanvasRenderFields(body?.template_id, profileLayoutRef.current),
  }), []);

  const postPdfBlob = useCallback((body) => apiPostBlob('/api/pdf', {
    ...body,
    ...betaCanvasRenderFields(body?.template_id, profileLayoutRef.current),
  }), []);

  /**
   * Wrapper a appeler quand l utilisateur CHOISIT explicitement un nouveau
   * template (vs hydratation depuis Supabase / localStorage qui doivent
   * preserver les options telles quelles).
   *
   * Probleme resolu : les `templateOptions` (couleurs, polices, booleens
   * d affichage) sont specifiques a chaque template. Si l user passe d un
   * template avec en-tete fonce (header_color: #1e293b par exemple) a un
   * template a en-tete blanc, l ancienne couleur reste appliquee via
   * `--cv-header-color`, ce qui peut rendre le header illisible (texte
   * blanc sur fond blanc).
   *
   * Solution : a chaque changement EXPLICITE de template, on reset les
   * options aux defauts du nouveau template. Si l user veut personnaliser,
   * il refait ses reglages dans l inspecteur.
   *
   * Note : on accepte un parametre `templates` optionnel pour les cas ou
   * `templatesList` n est pas encore charge (rare, mais defensive).
   */
  const handleUserPickTemplate = useCallback((nextId, templates = templatesList) => {
    setTemplateId(nextId);
    const list = withBetaCanvasTemplate(templates);
    const nextTemplate = Array.isArray(list)
      ? list.find((t) => t && t.id === nextId)
      : null;
    setTemplateOptions(nextTemplate ? resetTemplateOptionsToDefaults(nextTemplate) : {});
  }, [templatesList]);
  const [tourRestartKey, setTourRestartKey] = useState(0);
  /** Incrémenté pour démonter le tour phase 1 si l’utilisateur lance la 1re adapt sans avoir cliqué « Terminer » (le spotlight laisse passer les clics). */
  const [phase1DismissForAdaptKey, setPhase1DismissForAdaptKey] = useState(0);
  const [phase2TourOpenTrigger, setPhase2TourOpenTrigger] = useState(0);
  const [tourHighlightStepActive, setTourHighlightStepActive] = useState(false);
  const [tourDemoPreviewHtml, setTourDemoPreviewHtml] = useState('');
  const prevTourHighlightRef = useRef(false);
  const cvChatInputRef = useRef(null);
  /** Après la 1re adaptation réussie (chat), ouvre le tutoriel phase 2 - pas au début (évite conflit avec le modal « en cours »). */
  const openPhase2AfterFirstAdaptRef = useRef(false);

  const guidedTourUid = session?.user?.id || '';
  const tourKeyPhase1 = guidedTourUid ? `main_phase1_${guidedTourUid}` : 'main_phase1';
  const tourKeyPhase2 = guidedTourUid ? `main_phase2_${guidedTourUid}` : 'main_phase2';

  const getPersistedPlanStorageKey = useCallback(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    return `${ADAPT_PLAN_STORAGE_PREFIX}${uid}`;
  }, [session?.user?.id]);

  const getAdaptDraftStorageKey = useCallback(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    return `${ADAPT_DRAFT_STORAGE_PREFIX}${uid}`;
  }, [session?.user?.id]);

  // Hauteur auto du textarea : après envoi / reset, enlever le style inline sinon il reste « grand ».
  useEffect(() => {
    if (chatInput !== '') return;
    const el = cvChatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.removeProperty('height');
  }, [chatInput]);

  const handleTourStepChange = useCallback((step) => {
    setTourHighlightStepActive(step?.id === TOUR_STEP_PREVIEW_AI_HIGHLIGHT);
  }, []);

  const handleTourPhase2StepChange = useCallback(() => {
    setTourHighlightStepActive(false);
  }, []);

  const bumpPostFirstAdaptTour = useCallback(() => {
    if (!guidedTourUid) return;
    try {
      const p2Key = `cv_bot_tour_done_${tourKeyPhase2}`;
      const p1Key = `cv_bot_tour_done_${tourKeyPhase1}`;
      if (localStorage.getItem(p2Key) === '1') return;
      if (localStorage.getItem(p1Key) !== '1') {
        localStorage.setItem(p1Key, '1');
        setPhase1DismissForAdaptKey((k) => k + 1);
      }
      setPhase2TourOpenTrigger((n) => n + 1);
    } catch (_) { /* ignore */ }
  }, [guidedTourUid, tourKeyPhase1, tourKeyPhase2]);

  const handleRestartTour = () => {
    try {
      localStorage.removeItem('cv_bot_tour_done_main');
      localStorage.removeItem('cv_bot_tour_done_main_phase1');
      localStorage.removeItem('cv_bot_tour_done_main_phase2');
      if (guidedTourUid) {
        localStorage.removeItem(`cv_bot_tour_done_main_phase1_${guidedTourUid}`);
        localStorage.removeItem(`cv_bot_tour_done_main_phase2_${guidedTourUid}`);
      }
    } catch (_) { /* ignore */ }
    setPhase2TourOpenTrigger(0);
    setPhase1DismissForAdaptKey(0);
    setTourRestartKey((k) => k + 1);
  };

  // Titre de l’onglet selon la route (évite que la home affiche encore "FAQ" après navigation)
  useEffect(() => {
    const titles = {
      '/': "AxeL Job - CV adapté à chaque offre en 1 clic | IA & score ATS",
      '/faq': "CV, ATS et IA : les réponses aux questions que tout le monde se pose | AxeL Job",
      '/ats': "ATS : qu'est-ce que c'est et comment ça fonctionne vraiment ? | AxeL Job",
      '/login': "Connexion | AxeL Job",
      '/modeles-cv': "Modèles de CV : comment choisir un template qui passe l'ATS et convainc un recruteur | AxeL Job",
      '/guide-cv': "Comment faire un bon CV en 2025 : les règles qui font vraiment la différence | AxeL Job",
      '/erreurs-cv': "Les 7 erreurs les plus courantes dans un CV (et comment les corriger) | AxeL Job",
      '/cv-par-metier': "CV par secteur : les mots-clés qui font la différence en tech, marketing et finance | AxeL Job",
      '/cv-adapte-chaque-offre': "Pourquoi adapter son CV à chaque offre d'emploi (et comment le faire efficacement) | AxeL Job",
      '/mentions-legales': "Mentions légales | AxeL Job",
      '/confidentialite': "Confidentialité | AxeL Job",
      '/cgu': "CGU | AxeL Job",
    };
    const exact = titles[pathname];
    if (exact) {
      document.title = exact;
      return;
    }
    if (pathname.startsWith('/app')) document.title = "AxeL Job - Adapter ton CV à l'offre";
  }, [pathname]);

  // Après chargement réussi, réinitialiser le flag de reload chunk (pour un futur déploiement)
  useEffect(() => {
    clearChunkErrorReloadKey();
  }, []);

  // Meta robots : sync client sur les routes SPA ; en prod /login sert login.html (noindex déjà dans le HTML)
  useEffect(() => {
    syncRobotsMeta(pathname);
  }, [pathname]);

  // Espace /app : masquer le bouton flottant « Paramètres cookies » (accès via menu compte uniquement).
  useEffect(() => {
    const el = document.getElementById('axel-cookie-settings');
    if (!el) return;
    if (pathname.startsWith('/app')) {
      el.setAttribute('hidden', '');
    } else {
      try {
        const raw = localStorage.getItem('axel_job_consent_v1');
        const ok = raw && JSON.parse(raw).v === 1;
        if (ok) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      } catch (_) {
        el.setAttribute('hidden', '');
      }
    }
  }, [pathname]);

  // Liste des templates : fetch UNE FOIS quand on entre dans /app et à chaque changement
  // d'identité utilisateur (login/logout). Avant : refetch à chaque navigation interne /app/*
  // → 4-6 appels inutiles par session. Le backend a un cache TTL 5 min, mais autant ne pas
  // payer le round-trip + GZip + setState + rerender quand rien n'a changé.
  const isInApp = pathname.startsWith('/app');
  const sessionUserId = session?.user?.id || null;
  useEffect(() => {
    if (!isInApp) return;
    apiGet('/api/templates')
      .then((data) => setTemplatesList(Array.isArray(data) ? data : []))
      .catch(() => setTemplatesList([]));
  }, [isInApp, sessionUserId]);

  // Persist template choice (localStorage + base de données)
  useEffect(() => {
    localStorage.setItem('cv_template_id', templateId);
  }, [templateId]);
  useEffect(() => {
    localStorage.setItem('cv_template_options', JSON.stringify(templateOptions));
  }, [templateOptions]);

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      apiPatch('/api/cv', { template_id: templateId, template_options: templateOptions }).catch(() => {
        /* ignore */
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [session, templateId, templateOptions]);

  const templateParams = { template_id: templateId, template_options: templateOptions };
  const templateKey = `${templateId}|${JSON.stringify(templateOptions)}|layout:${profileLayout ? '1' : '0'}`;

  // Garder HTML original/modifié pour l'iframe et CvEditablePreview
  const wantHighlight = !!(lastBaseCv && lastAdaptedCv);

  const templateIdForPreviewRef = useRef(templateId);
  const templateOptionsForPreviewRef = useRef(templateOptions);
  templateIdForPreviewRef.current = templateId;
  templateOptionsForPreviewRef.current = templateOptions;

  const prevHadSessionRef = useRef(false);
  const prevAdaptedCvRef = useRef(lastAdaptedCv);
  const prevWantHighlightRef = useRef(wantHighlight);
  const prevLastBaseCvRef = useRef(lastBaseCv);
  const prevLastSelectionA4Ref = useRef(lastSelectionA4);
  /** Pour déclencher un rendu preview immédiat quand le template sync (API / profil) sans attendre le debounce. */
  const prevCvPreviewTemplateKeyRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    setUnauthorizedCallback(() => {
      setAuthToken(null);
      supabase.auth.signOut();
    });
    fetchAuthSessionWithTimeout(supabase)
      .then((s) => {
        setSession(s);
        setAuthToken(s?.access_token ?? null);
        setAuthLoading(false);
      })
      .catch(() => {
        setAuthLoading(false);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (s) setMfaChallengeChecked(false);
    });
    return () => subscription?.unsubscribe();
  }, []);

  // Compte supprimé côté Supabase : le JWT peut rester valide un moment - getUser() interroge Auth et déclenche une déconnexion si l’utilisateur n’existe plus.
  useEffect(() => {
    if (!supabase || !session?.user?.id) return undefined;
    const kickIfGone = () => {
      supabase.auth.getUser().then(({ data, error }) => {
        if (error || !data?.user) {
          setAuthToken(null);
          supabase.auth.signOut({ scope: 'local' });
        }
      });
    };
    kickIfGone();
    const intervalMs = 90_000;
    const id = setInterval(kickIfGone, intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') kickIfGone();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', kickIfGone);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', kickIfGone);
    };
  }, [supabase, session?.user?.id]);

  // Si l'utilisateur a activé la MFA (optionnel), demander le code TOTP après connexion
  useEffect(() => {
    if (!session || authLoading || recoveryMode || !supabase?.auth?.mfa?.getAuthenticatorAssuranceLevel) return;
    if (mfaChallengeChecked) return;
    setMfaChallengeChecked(true);
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (error || !data) return;
        if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') setMfaChallengeRequired(true);
      })
      .catch(() => {
        /* ignore */
      });
  }, [session, authLoading, recoveryMode, mfaChallengeChecked]);

  useEffect(() => {
    ensureAnalyticsFirstTouch();
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let attr;
    try {
      attr = getStoredAttribution();
    } catch {
      attr = null;
    }
    if (!attr || !attr.partner_code) return;
    const key = `cv_bot_referral_capture_v1:${uid}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch {
      /* sessionStorage unavailable */
    }
    apiPost('/api/referral/capture', { attribution: attr })
      .then((res) => {
        if (res?.ok) {
          try {
            sessionStorage.setItem(key, '1');
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* keep silent: retry on next reload */
      });
  }, [session?.user?.id]);

  useViewAnalytics({ view: analyticsView, pathname, session });

  useEffect(() => {
    if (!session) {
      profileGateIdentityRef.current = '';
      return;
    }
    if (authLoading) return;
    const uid = session.user?.id || '';
    const email = (session.user?.email || '').trim();
    const identity = `${uid}|${email}`;
    const identityChanged = profileGateIdentityRef.current !== identity;
    if (identityChanged) {
      profileGateIdentityRef.current = identity;
      setOnboardingChecked(false);
    }
    setProfileCvLoadError(null);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        const empty = !data || (typeof data === 'object' && Object.keys(data).length === 0);
        setNeedsOnboarding(empty);
        if (data?.template_id !== undefined && (data.template_id || '').trim()) setTemplateId((data.template_id || '').trim() || 'minimal');
        if (data?.template_options !== undefined && typeof data.template_options === 'object') setTemplateOptions(data.template_options || {});
        if (data && typeof data === 'object' && 'layout' in data) {
          setProfileLayout(data.layout && typeof data.layout === 'object' ? data.layout : null);
        }
      })
      .catch(() => {
        setProfileCvLoadError('Impossible de charger ton profil. Vérifie ta connexion puis réessaie.');
        setNeedsOnboarding(false);
      })
      .finally(() => setOnboardingChecked(true));
  }, [session?.user?.id, session?.user?.email, authLoading, profileRefreshKey]);

  // Ancienne clé tutoriel unique → marquer les deux phases comme vues pour ce compte (évite de re-montrer le tour aux anciens utilisateurs).
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      if (localStorage.getItem('cv_bot_tour_done_main') === '1') {
        const p1k = `cv_bot_tour_done_main_phase1_${uid}`;
        const p2k = `cv_bot_tour_done_main_phase2_${uid}`;
        if (localStorage.getItem(p1k) !== '1') localStorage.setItem(p1k, '1');
        if (localStorage.getItem(p2k) !== '1') localStorage.setItem(p2k, '1');
      }
    } catch (_) { /* ignore */ }
  }, [session?.user?.id]);

  // Pont onboarding : focus sur le champ offre une fois sur la page CV (clic « Lancer ma première candidature »).
  useEffect(() => {
    if (!session?.user?.id || !isCvView || needsOnboarding || !onboardingChecked) return;
    try {
      const k = `cv_bot_post_onb_bridge_${session.user.id}`;
      if (sessionStorage.getItem(k) !== '1') return;
      sessionStorage.removeItem(k);
      const id = requestAnimationFrame(() => {
        cvChatInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    } catch (_) { /* ignore */ }
  }, [session?.user?.id, isCvView, needsOnboarding, onboardingChecked]);

  // Détecter erreur lien expiré (ex. réinitialisation mot de passe) sur /login
  useEffect(() => {
    if (pathname !== '/login') {
      setLoginOtpExpired(false);
      return;
    }
    if (typeof window === 'undefined' || authLoading) return;
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const code = params.get('error_code');
    const hasTokens = params.has('access_token') || params.has('refresh_token');
    if (hasTokens) return;
    const expiredCodes = ['otp_expired', 'expired_token', 'invalid_otp'];
    const expired = code && expiredCodes.includes(code);
    if (expired) {
      setLoginOtpExpired(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [pathname, authLoading]);

  // Redirections selon auth et route
  useEffect(() => {
    if (authLoading) return;
    if (!supabase) return;
    if (session) {
      const params = new URLSearchParams(location.search);
      if (pathname === '/' || pathname === '/login') {
        if (params.get('plan') === 'pro') {
          navigate(APP_DEFAULT_ROUTE, { replace: true });
          setTimeout(() => handleUpgradeClick(), 500);
        } else {
          const nextPath = params.get('next');
          const safeNext = nextPath && nextPath.startsWith('/app/') && !nextPath.includes('//') ? nextPath : null;
          if (safeNext) {
            navigate(safeNext, { replace: true });
          } else {
            navigate('/app', { replace: true });
          }
        }
      } else if (pathname === '/app' || pathname === '/app/') {
        const search = location.search || '';
        navigate(APP_DEFAULT_ROUTE + search, { replace: true });
      }
    } else {
      if (pathname.startsWith('/app')) {
        const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
        const search = typeof window !== 'undefined' ? (window.location.search || '') : '';
        const hasOAuthCallback = /(access_token|refresh_token)=/.test(hash) || /[?&]code=/.test(search);
        if (hasOAuthCallback) return;
        navigate('/', { replace: true });
      }
    }
  }, [session, pathname, authLoading, navigate, location.search]);

  /* /app sans sous-chemin reconnu → CV (évite état incohérent URL / contenu) */
  useEffect(() => {
    if (!session || authLoading) return;
    if (!pathname.startsWith('/app')) return;
    if (!isKnownAppPathname(pathname)) navigate(APP_DEFAULT_ROUTE, { replace: true });
  }, [session, authLoading, pathname, navigate]);

  const setPreviewHtml = (html) => {
    const s = typeof html === 'string' ? html : '';
    setPreviewHtmlFallback(s);
    const apply = () => {
      if (!iframeRef.current || !s) return false;
      const iframe = iframeRef.current;
      iframe.style.opacity = '0';
      iframe.srcdoc = s;
      const onLoad = () => {
        iframe.style.opacity = '1';
        iframe.removeEventListener('load', onLoad);
        resizeIframeToContent(iframe);
      };
      iframe.addEventListener('load', onLoad);
      return true;
    };
    if (!apply()) {
      requestAnimationFrame(() => {
        if (!apply()) requestAnimationFrame(() => { apply(); });
      });
    }
  };

  // Hauteur = document complet : un seul scroll sur .preview-wrap (pas de scroll dans l’iframe)
  const resizeIframeToContent = useCallback((iframe) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.documentElement) return;
      applyA4PageFramesToDocument(doc, {
        onLayout: () => syncCvPreviewIframeHeight(iframe),
      });
      syncCvPreviewIframeHeight(iframe);
    } catch (_) { /* cross-origin or not loaded */ }
  }, []);

  // Changement de template / options / HTML : réappliquer cadres A4 + hauteur (load sur srcdoc pas toujours fiable)
  useEffect(() => {
    if (!isCvView) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const run = () => {
      try {
        if (!iframe.contentDocument?.body) return;
        resizeIframeToContent(iframe);
      } catch (_) { /* ignore */ }
    };
    const t0 = window.setTimeout(run, 0);
    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 380);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [
    isCvView,
    templateKey,
    previewVariant,
    modifiedPreviewHtml,
    originalPreviewHtml,
    tourHighlightStepActive,
    tourDemoPreviewHtml,
    resizeIframeToContent,
  ]);

  const showError = (msg) => {
    setError(msg);
    setRapport(null);
  };
  const hideError = () => setError('');

  const loadInitialPreview = async (tid = templateId, opts = templateOptions) => {
    if (!session) {
      setPreviewHtml('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-family:Plus Jakarta Sans,sans-serif;padding:2rem;text-align:center"><p>Connecte-toi pour voir l\'aperçu de ton CV.</p></div>');
      return;
    }
    try {
      const params = new URLSearchParams({ template_id: tid });
      if (opts && Object.keys(opts).length > 0) {
        params.set('template_options', JSON.stringify(opts));
      }
      const html = await apiGet(`/api/cv/preview?${params.toString()}`);
      setPreviewHtml(html);
    } catch {
      setPreviewHtml('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-family:Plus Jakarta Sans,sans-serif;padding:2rem;text-align:center"><p>Complète ton profil pour voir l\'aperçu de ton CV ici.</p></div>');
    }
  };

  // Aperçu original / modifié : debounce si seuls template_id / template_options changent (sliders, couleurs).
  // Dépendre de session?.user?.id (pas de session) : Supabase renvoie souvent un nouvel objet session au refresh token,
  // ce qui relançait cet effet en boucle. Ne pas fetch hors onglet CV : évite travail réseau + flash quand on navigue ailleurs.
  useEffect(() => {
    if (!session) {
      prevHadSessionRef.current = false;
      return;
    }
    if (!isCvView) return;
    /** Pendant le flux NDJSON, le HTML arrive déjà dans le client - évite des POST /render-html en rafale. */
    if (adaptStreamMode) return;

    const sessionBecameActive = !prevHadSessionRef.current;
    prevHadSessionRef.current = true;

    const adaptChanged = lastAdaptedCv !== prevAdaptedCvRef.current;
    const highlightChanged = wantHighlight !== prevWantHighlightRef.current;
    const baseChanged = lastBaseCv !== prevLastBaseCvRef.current;
    const selectionChanged = lastSelectionA4 !== prevLastSelectionA4Ref.current;

    prevAdaptedCvRef.current = lastAdaptedCv;
    prevWantHighlightRef.current = wantHighlight;
    prevLastBaseCvRef.current = lastBaseCv;
    prevLastSelectionA4Ref.current = lastSelectionA4;

    const templateKeyChanged =
      prevCvPreviewTemplateKeyRef.current != null && prevCvPreviewTemplateKeyRef.current !== templateKey;
    prevCvPreviewTemplateKeyRef.current = templateKey;

    const immediate =
      sessionBecameActive
      || adaptChanged
      || highlightChanged
      || baseChanged
      || selectionChanged
      || templateKeyChanged;

    const run = () => {
      const tid = templateIdForPreviewRef.current;
      const opts = templateOptionsForPreviewRef.current;
      if (adaptChanged && suppressAdaptedPreviewRef.current && lastAdaptedCv) {
        suppressAdaptedPreviewRef.current = false;
        if (lastBaseCv) {
          postRenderHtml({ cv: lastBaseCv, template_id: tid, template_options: opts })
            .then((html) => setOriginalPreviewHtml(html))
            .catch(() => {
        /* ignore */
      });
        }
        return;
      }
      if (lastAdaptedCv) {
        postRenderHtml({
          cv: lastAdaptedCv,
          base_cv: lastBaseCv || undefined,
          highlight_changes: wantHighlight,
          template_id: tid,
          template_options: opts,
          selection_a4: lastSelectionA4 || undefined,
        })
          .then((html) => {
            setModifiedPreviewHtml(html);
          })
          .catch(() => {
        /* ignore */
      });
      } else if (!tourHighlightStepActive) {
        loadInitialPreview(tid, opts);
      }
      if (lastBaseCv) {
        postRenderHtml({ cv: lastBaseCv, template_id: tid, template_options: opts })
          .then((html) => setOriginalPreviewHtml(html))
          .catch(() => {
        /* ignore */
      });
      }
    };

    if (immediate) {
      run();
      return;
    }

    const t = setTimeout(run, TEMPLATE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [session?.user?.id, isCvView, templateKey, wantHighlight, lastAdaptedCv, lastBaseCv, lastSelectionA4, tourHighlightStepActive, adaptStreamMode]);

  // Tutoriel : surlignage vert réel (API render-html + highlight_changes), sur le CV adapté ou une démo
  useEffect(() => {
    if (!tourHighlightStepActive || !session || !isCvView) return;
    let cancelled = false;
    const run = async () => {
      try {
        if (lastAdaptedCv && lastBaseCv) {
          const html = await postRenderHtml({
            cv: lastAdaptedCv,
            base_cv: lastBaseCv,
            highlight_changes: true,
            template_id: templateId,
            template_options: templateOptions,
            selection_a4: lastSelectionA4 || undefined,
          });
          if (!cancelled) setModifiedPreviewHtml(html);
          return;
        }
        if (!lastAdaptedCv && (!lastBaseCv || !hasProfilMinContent(lastBaseCv))) {
          if (!cancelled) setTourDemoPreviewHtml(TOUR_INSTANT_GREEN_DEMO_HTML);
          return;
        }
        if (lastBaseCv && hasProfilMinContent(lastBaseCv)) {
          const adapted = buildTourDemoAdaptedFromBase(lastBaseCv);
          const html = await postRenderHtml({
            cv: adapted,
            base_cv: lastBaseCv,
            highlight_changes: true,
            template_id: templateId,
            template_options: templateOptions,
          });
          if (!cancelled) setTourDemoPreviewHtml(html);
          return;
        }
        const html = await postRenderHtml({
          cv: TOUR_STATIC_DEMO_ADAPTED_CV,
          base_cv: TOUR_STATIC_DEMO_BASE_CV,
          highlight_changes: true,
          template_id: templateId,
          template_options: templateOptions,
        });
        if (!cancelled) setTourDemoPreviewHtml(html);
      } catch {
        if (!cancelled) setTourDemoPreviewHtml(TOUR_INSTANT_GREEN_DEMO_HTML);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [
    tourHighlightStepActive,
    session?.user?.id,
    isCvView,
    lastAdaptedCv,
    lastBaseCv,
    templateId,
    templateOptions,
    lastSelectionA4,
  ]);

  useEffect(() => {
    if (tourHighlightStepActive) {
      prevTourHighlightRef.current = true;
      return;
    }
    setTourDemoPreviewHtml('');
    if (prevTourHighlightRef.current) {
      prevTourHighlightRef.current = false;
      if (!lastAdaptedCv && session && isCvView) {
        loadInitialPreview();
      }
      if (lastAdaptedCv) {
        postRenderHtml({
          cv: lastAdaptedCv,
          base_cv: lastBaseCv || undefined,
          highlight_changes: !!(lastBaseCv && lastAdaptedCv),
          template_id: templateId,
          template_options: templateOptions,
          selection_a4: lastSelectionA4 || undefined,
        })
          .then((html) => { setModifiedPreviewHtml(html); })
          .catch(() => {
        /* ignore */
      });
      }
    }
  }, [
    tourHighlightStepActive,
    lastAdaptedCv,
    lastBaseCv,
    session?.user?.id,
    isCvView,
    templateId,
    templateOptions,
    lastSelectionA4,
  ]);

  const loadApplications = async () => {
    try {
      const list = await apiGet('/api/applications' + (showArchived ? '?archived=1' : ''));
      setApplications(list);
    } catch {
      setApplications([]);
    }
  };

  /** Réinitialise l’espace « Adapter un CV » : nouveau fil de chat, nouvel adapt (sans toucher aux candidatures déjà enregistrées). */
  const resetAdaptationWorkspace = () => {
    setLastAdaptedCv(null);
    setLastAdaptationId(null);
    setLastSelectionA4(null);
    setRapport(null);
    setRapportBefore(null);
    setExportBlockVisible(false);
    setChatMessages([]);
    setChatInput('');
    setAdaptTodoPlan(null);
    setAdaptPlanLoading(false);
    setAdaptTodoExplain('');
    setAdaptTodoExplainLoading(false);
    setAdaptTodoLastAction('');
    try {
      const key = getPersistedPlanStorageKey();
      if (key) localStorage.removeItem(key);
    } catch {
      /* ignore localStorage */
    }
    setAnnonce('');
    setLastAdaptRunConfig(null);
    setAdaptRating(null);
    setApiAdaptDone(false);
    pendingAdaptResultRef.current = null;
    setOriginalPreviewHtml('');
    setModifiedPreviewHtml('');
    setPreviewHtmlFallback('');
    setPreviewVariant('modified');
    setSourceOffreValue('');
    setEntrepriseNom('');
    setPosteNom('');
    exportHintsRef.current = null;
    entrepriseFieldTouchedRef.current = false;
    setError('');
    setCvEditPanelOpen(false);
    setAdaptStepIndex(0);
    setAdaptStepLabels([
      'Analyse des mots-clés',
      'Extraction des compétences',
      'Réécriture du résumé',
      'Adaptation des expériences',
      'Optimisation ATS',
      'Finalisation',
    ]);
    setAdaptRunStepIds([]);
    setAdaptStreamRunningStepId(null);
    setAdaptStreamDoneStepIds([]);
    setAdaptStreamMode(false);
    setAdapting(false);
    apiGet('/api/cv')
      .then((cv) => {
        if (cv) {
          setLastBaseCv(cv);
          setFreshPreviewPhotoUrl(cv.photo_url ?? null);
        }
      })
      .catch(() => {
        /* ignore */
      });
    loadInitialPreview();
  };

  const requestNewCandidatureWorkspace = () => {
    if (adapting) return;
    if (lastAdaptedCv || chatMessages.length > 0) {
      const ok = window.confirm(
        "Démarrer une nouvelle candidature dans l'éditeur ? Le chat et l'aperçu de cette session seront effacés. Ta candidature reste dans « Mes candidatures » si elle a déjà été enregistrée.",
      );
      if (!ok) return;
    }
    trackEvent('new_candidature_workspace', { had_adapted_cv: !!lastAdaptedCv });
    resetAdaptationWorkspace();
  };

  // Vue CV : charger le CV depuis l’API puis l’aperçu (évite la course loadInitialPreview avant que le CV soit en base, ex. fin d’onboarding sur /app/cv).
  useEffect(() => {
    if (!session) return;
    if (view !== 'cv') return;
    if (!onboardingChecked || needsOnboarding) return;
    let cancelled = false;
    apiGet('/api/cv')
      .then((cv) => {
        if (cancelled) return;
        if (cv) {
          setLastBaseCv(cv);
          setFreshPreviewPhotoUrl(cv.photo_url ?? null);
        }
      })
      .catch(() => {
        /* ignore */
      })
      .then(() => {
        if (cancelled) return;
        const adapted = lastAdaptedCvRef.current;
        const tid = templateIdForPreviewRef.current;
        const opts = templateOptionsForPreviewRef.current;
        if (adapted) {
          postRenderHtml({
            cv: adapted,
            highlight_changes: false,
            selection_a4: lastSelectionA4 || undefined,
            template_id: tid,
            template_options: opts,
          })
            .then((html) => {
              if (cancelled) return;
              setPreviewHtml(html);
              setModifiedPreviewHtml(html);
            })
            .catch(() => loadInitialPreview(tid, opts));
        } else {
          loadInitialPreview(tid, opts);
        }
      });
    return () => { cancelled = true; };
  }, [view, session?.user?.id, onboardingChecked, needsOnboarding, profileRefreshKey, !!lastAdaptedCv, lastSelectionA4]);

  // Restaurer une todo en attente après refresh (persistance légère par plan_id)
  useEffect(() => {
    if (!session?.user?.id || view !== 'cv') return;
    if (lastAdaptedCv || adapting || adaptTodoPlan) return;
    let cancelled = false;
    const key = getPersistedPlanStorageKey();
    if (!key) return;
    let planId = '';
    try {
      planId = (localStorage.getItem(key) || '').trim();
    } catch {
      return;
    }
    if (!planId) return;
    apiGet(`/api/adapt-plan/${encodeURIComponent(planId)}`)
      .then((data) => {
        if (cancelled) return;
        const todo = Array.isArray(data?.todo) ? data.todo : [];
        setAdaptRunStepIds([]);
        setAdaptStreamRunningStepId(null);
        setAdaptStreamDoneStepIds([]);
        setAdaptTodoPlan({
          planId: data?.plan_id || planId,
          description: data?.description || '',
          todo,
          assistantMessage: data?.assistant_message || 'Plan restauré. Tu peux valider ou ajuster les étapes.',
          cvLanguage: data?.cv_language || null,
          offerLanguage: data?.offer_language || null,
          languageMismatch: Boolean(
            data?.language_mismatch
            || shouldPromptLanguageChoice(data?.cv_language, data?.offer_language),
          ),
          outputLanguage: null,
        });
        setAnnonce((data?.description || '').trim());
        if (
          data?.language_mismatch
          || shouldPromptLanguageChoice(data?.cv_language, data?.offer_language)
        ) {
          setAdaptLanguageMeta({
            cvLanguage: data?.cv_language || null,
            offerLanguage: data?.offer_language || null,
          });
          setAdaptLanguageModalOpen(true);
        }
        setChatMessages((prev) => (
          prev.some((m) => m.kind === 'todo_plan')
            ? prev
            : [...prev, { role: 'assistant', content: data?.assistant_message || 'Plan restauré.', kind: 'todo_plan' }]
        ));
      })
      .catch(() => {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      });
    return () => { cancelled = true; };
  }, [session?.user?.id, view, lastAdaptedCv, adapting, adaptTodoPlan, getPersistedPlanStorageKey]);

  // Sauvegarde locale du brouillon de l'offre pendant la saisie (avant adaptation).
  useEffect(() => {
    if (!session?.user?.id || view !== 'cv') return;
    if (lastAdaptedCv || adaptTodoPlan) return;
    const key = getAdaptDraftStorageKey();
    if (!key) return;
    try {
      const v = (chatInput || '').trim();
      if (!v) localStorage.removeItem(key);
      else localStorage.setItem(key, v);
    } catch {
      /* ignore localStorage */
    }
  }, [session?.user?.id, view, chatInput, lastAdaptedCv, adaptTodoPlan, getAdaptDraftStorageKey]);

  // Restauration du brouillon après refresh.
  useEffect(() => {
    if (!session?.user?.id || view !== 'cv') return;
    if (lastAdaptedCv || adaptTodoPlan || (chatInput || '').trim()) return;
    const key = getAdaptDraftStorageKey();
    if (!key) return;
    try {
      const draft = (localStorage.getItem(key) || '').trim();
      if (draft) setChatInput(draft);
    } catch {
      /* ignore localStorage */
    }
  }, [session?.user?.id, view, lastAdaptedCv, adaptTodoPlan, chatInput, getAdaptDraftStorageKey]);

  useEffect(() => {
    if (usage && usage.adaptations_used > 0) setFirstOfferNudgeOpen(false);
  }, [usage?.adaptations_used]);

  // Rappel modale : pas d’adaptation après un délai (navigation sous /app relance le compteur).
  useEffect(() => {
    if (!session?.user?.id || !onboardingChecked || needsOnboarding) return;
    if (!usage || usage.adaptations_used !== 0) return;
    try {
      if (localStorage.getItem(`cv_bot_first_offer_nudge_dismissed_${session.user.id}`) === '1') return;
    } catch {
      return;
    }
    if (!pathname.startsWith('/app')) return;
    const delayMs = 3 * 60 * 1000;
    const t = window.setTimeout(() => setFirstOfferNudgeOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [session?.user?.id, onboardingChecked, needsOnboarding, usage?.adaptations_used, pathname]);

  // Synchroniser template/options depuis le localStorage en passant sur l'onglet CV (au cas où modifié depuis Profil)
  useEffect(() => {
    if (view !== 'cv') return;
    try {
      const tid = localStorage.getItem('cv_template_id');
      const topt = localStorage.getItem('cv_template_options');
      if (tid) setTemplateId(tid);
      if (topt) setTemplateOptions(JSON.parse(topt));
    } catch {
      /* ignore localStorage */
    }
  }, [view]);

  // Export default dir : uniquement en app et sur la vue CV (pas sur la landing pour alléger le chemin critique)
  useEffect(() => {
    if (!pathname.startsWith('/app') || view !== 'cv') return;
    const saved = localStorage.getItem(STORAGE_EXPORT_DIR);
    if (saved) setExportDossierPath(saved);
    else {
      apiGet('/api/export-default-dir').then((data) => {
        if (data.path) setExportDossierPath((p) => p || data.path);
      }).catch(() => {
        /* ignore */
      });
    }
  }, [pathname, view]);

  useEffect(() => {
    if (supabase && !session) return;
    loadApplications();
  }, [showArchived, session?.user?.id]);

  const loadUsage = async () => {
    try {
      const data = await apiGet('/api/usage');
      setUsage(data);
    } catch {
      setUsage(null);
    }
  };

  useEffect(() => {
    if (supabase && !session) return;
    loadUsage();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!adapting) {
      pendingAdaptResultRef.current = null;
      setAdaptStreamMode(false);
      return;
    }
    if (adaptStreamMode) return;
    const id = setInterval(() => {
      setAdaptStepIndex((i) => Math.min(i + 1, adaptStepLabels.length - 1));
    }, 3800);
    return () => clearInterval(id);
  }, [adapting, adaptStepLabels, adaptStreamMode]);

  // Quand l’API a fini et l’animation est sur « Finalisation », on applique le résultat et on arrête
  useEffect(() => {
    if (!apiAdaptDone || adaptStepIndex !== adaptStepLabels.length - 1 || !adapting) return;
    const pending = pendingAdaptResultRef.current;
    if (pending) {
      if (pending.cv) setLastAdaptedCv(pending.cv);
      if (pending.adaptation_id != null) setLastAdaptationId(pending.adaptation_id);
      if (pending.selection_a4 !== undefined) setLastSelectionA4(pending.selection_a4);
      if (pending.rapport !== undefined) setRapport(pending.rapport);
      if (pending.rapportBefore !== undefined) setRapportBefore(pending.rapportBefore);
      if (pending.exportBlockVisible) setExportBlockVisible(true);
      setPreviewVariant('modified');
      if (pending.previewHtml) setPreviewHtml(pending.previewHtml);
      if (pending.modifiedPreviewHtml) {
        suppressAdaptedPreviewRef.current = true;
        setModifiedPreviewHtml(pending.modifiedPreviewHtml);
      }
      // Flux silencieux: pas de récapitulatif automatique dans le chat après adaptation.
      // Exception AXE-357 : notice si CV mixte ou langue offre ≠ langue CV.
      if (pending.languageNotice) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: pending.languageNotice }]);
      }
      if (pending.baseCv != null) setLastBaseCv(pending.baseCv);
      if (pending.export_hints != null && pending.adaptation_id != null) {
        exportHintsRef.current = { ...pending.export_hints, adaptation_id: pending.adaptation_id };
      } else if (pending.adaptation_id != null) {
        exportHintsRef.current = {
          adaptation_id: pending.adaptation_id,
          poste: '',
          entreprise: '',
          entreprise_confidence: 0,
        };
      }
      entrepriseFieldTouchedRef.current = false;
      if (pending.export_hints) {
        setPosteNom((p) => ((p && p.trim()) ? p : (pending.export_hints.poste || '')));
        setEntrepriseNom((e) => ((e && e.trim()) ? e : (pending.export_hints.entreprise || '')));
      }
      loadApplications();
      loadUsage();
      pendingAdaptResultRef.current = null;
      if (openPhase2AfterFirstAdaptRef.current) {
        openPhase2AfterFirstAdaptRef.current = false;
        bumpPostFirstAdaptTour();
      }
    } else {
      openPhase2AfterFirstAdaptRef.current = false;
    }
    setAdapting(false);
  }, [apiAdaptDone, adaptStepIndex, adapting, bumpPostFirstAdaptTour]);

  // Scroll vers la réponse / animation quand on lance un prompt
  useEffect(() => {
    if (adapting || adaptPlanLoading || chatMessages.length > 0) {
      const t = requestAnimationFrame(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [adapting, adaptPlanLoading, chatMessages.length]);

  useEffect(() => {
    if (!atsScoreOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setAtsScoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [atsScoreOpen]);

  // Ajuster l’échelle du preview CV pour tout voir sans scroll horizontal

  useEffect(() => {
    if (supabase && !session) return;
    if (view === 'candidatures') loadApplications();
  }, [view, session?.user?.id]);

  const openApplicationDetail = (id) => {
    setApplicationDetailId(id);
  };

  const closeApplicationDetail = () => {
    setApplicationDetailId(null);
  };

  const runPlannedAdaptation = async ({ description, selectedStepIds, source = 'chat_send', planId = null, outputLanguage = 'cv' }) => {
    try {
      adaptRunAbortRef.current?.abort();
    } catch (_) { /* ignore */ }
    adaptRunGenRef.current += 1;
    const myRunId = adaptRunGenRef.current;
    adaptActiveRunIdRef.current = myRunId;
    adaptRunAbortRef.current = new AbortController();
    const adaptSignal = adaptRunAbortRef.current.signal;
    openPhase2AfterFirstAdaptRef.current = true;
    setAdapting(true);
    setAdaptStreamMode(true);
    setAdaptRating(null);
    setApiAdaptDone(false);
    setAdaptStepIndex(0);
    setAdaptStreamRunningStepId(null);
    setAdaptStreamDoneStepIds([]);
    const selected = Array.isArray(selectedStepIds) ? selectedStepIds : [];
    setAdaptRunStepIds(selected);
    const labels = (adaptTodoPlan?.todo || [])
      .filter((s) => selected.includes(s.id))
      .map((s) => s.title)
      .filter(Boolean);
    setAdaptStepLabels(labels.length > 0 ? [...labels, 'Finalisation'] : ['Adaptation', 'Finalisation']);
    try {
      setAnnonce(description);
      trackEvent('job_description_pasted', { word_count: description.split(/\s+/).length, source });
      let streamedData = null;
      /** HTML complet du dernier segment de preview (chaque étape + final) - appliqué à l’iframe à chaque fin de segment. */
      let lastStreamPreviewHtml = '';
      let previewAccum = '';
      let previewPartialTimer = null;
      let streamStepLabels = [];
      await apiPostStream('/api/adapt-run-stream', {
        description,
        titre: posteNom || undefined,
        entreprise: entrepriseNom || undefined,
        plan_id: planId || undefined,
        selected_step_ids: selected,
        output_language: outputLanguage === 'offer' ? 'offer' : 'cv',
        ...templateParams,
      }, {
        signal: adaptSignal,
        onMessage: (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'started' && Array.isArray(msg.step_labels) && msg.step_labels.length > 0) {
            streamStepLabels = msg.step_labels;
            setAdaptStepLabels(msg.step_labels);
            setAdaptStepIndex(0);
            return;
          }
          if (msg.type === 'step_started' && Number.isInteger(msg.step_index)) {
            const idx = Math.max(0, Number(msg.step_index));
            setAdaptStepIndex((prev) => Math.max(prev, idx));
            if (msg.step_id) setAdaptStreamRunningStepId(String(msg.step_id));
            return;
          }
          if (msg.type === 'step_done' && Number.isInteger(msg.step_index)) {
            const next = Math.max(0, Number(msg.step_index) + 1);
            setAdaptStepIndex((prev) => Math.max(prev, next));
            if (msg.step_id) {
              setAdaptStreamDoneStepIds((prev) => (prev.includes(String(msg.step_id)) ? prev : [...prev, String(msg.step_id)]));
              setAdaptStreamRunningStepId(null);
            }
            return;
          }
          if (msg.type === 'preview_begin') {
            previewAccum = '';
            return;
          }
          if (msg.type === 'progress' && Number.isInteger(msg.step_index)) {
            const idx = Math.max(0, Number(msg.step_index));
            setAdaptStepIndex((prev) => Math.max(prev, idx));
            return;
          }
          if (msg.type === 'result' && msg.data) {
            streamedData = msg.data;
            return;
          }
          if (msg.type === 'preview_chunk') {
            if (msg.chunk) previewAccum += String(msg.chunk);
            if (msg.done) {
              if (previewPartialTimer) {
                clearTimeout(previewPartialTimer);
                previewPartialTimer = null;
              }
              lastStreamPreviewHtml = previewAccum;
              previewAccum = '';
              if (adaptActiveRunIdRef.current === myRunId && lastStreamPreviewHtml) {
                setPreviewVariant('modified');
                setModifiedPreviewHtml(lastStreamPreviewHtml);
              }
            } else if (previewAccum.length > 400) {
              /* Construction progressive du HTML (effet « réécriture ») sans bloquer le thread. */
              if (previewPartialTimer) clearTimeout(previewPartialTimer);
              previewPartialTimer = window.setTimeout(() => {
                previewPartialTimer = null;
                if (adaptActiveRunIdRef.current !== myRunId) return;
                setPreviewVariant('modified');
                setModifiedPreviewHtml(previewAccum);
              }, 48);
            }
            return;
          }
          if (msg.type === 'error') {
            const err = new Error(msg.detail || 'Erreur.');
            err.status = msg.status;
            throw err;
          }
        },
      });
      const data = streamedData;
      if (!data) throw new Error("Le flux d'adaptation s'est terminé sans résultat.");
      let baseCv = null;
      try {
        baseCv = await apiGet('/api/cv');
      } catch {
        /* fallback: lastBaseCv */
      }
      const html = lastStreamPreviewHtml || await postRenderHtml({
        ...templateParams,
        cv: data.cv,
        base_cv: baseCv ?? lastBaseCv ?? undefined,
        highlight_changes: true,
        selection_a4: data.selection_a4 || undefined,
      });
      const selectedSteps = Array.isArray(data?.todo_selected_steps) ? data.todo_selected_steps : selected;
      const touchedSections = [];
      if (selectedSteps.includes('rewrite_resume')) touchedSections.push('résumé');
      if (selectedSteps.includes('rewrite_experiences')) touchedSections.push('expériences');
      if (selectedSteps.includes('optimize_ats')) touchedSections.push('ATS');
      const sectionsText = touchedSections.length ? `Sections modifiées: ${touchedSections.join(', ')}.` : '';
      const summaryBase = data.rapport?.score_global != null
        ? `CV adapté (score ATS : ${data.rapport.score_global}/100). ${sectionsText} Tu peux affiner en envoyant un autre message ou modifier le texte avant téléchargement.`
        : `CV adapté à l'offre. ${sectionsText} Envoie un message pour affiner ou clique sur « Modifier le CV » pour éditer le texte.`;
      const languageNotice = adaptLanguageNotice(
        data.cv_language,
        data.offer_language,
        data.output_language,
      );
      const summary = withAdaptLanguageNotice(
        summaryBase,
        data.cv_language,
        data.offer_language,
        data.output_language,
      );
      setSourceOffreValue('');
      pendingAdaptResultRef.current = {
        cv: data.cv,
        adaptation_id: data.adaptation_id || null,
        selection_a4: data.selection_a4 || null,
        rapport: data.rapport || {},
        rapportBefore: data.rapport_before || null,
        export_hints: data.export_hints || null,
        exportBlockVisible: true,
        previewHtml: '',
        modifiedPreviewHtml: html,
        summary,
        languageNotice,
        baseCv: baseCv ?? lastBaseCv ?? undefined,
      };
      const labelsLen = streamStepLabels.length > 0 ? streamStepLabels.length : adaptStepLabels.length;
      setAdaptStepIndex((labelsLen > 0 ? labelsLen - 1 : 0));
      setApiAdaptDone(true);
      setAdaptTodoLastAction('');
      setLastAdaptRunConfig({
        description,
        selectedStepIds: selectedSteps,
        source: 'redo_available',
      });
      try {
        const key = getPersistedPlanStorageKey();
        if (key) localStorage.removeItem(key);
      } catch {
        /* ignore localStorage */
      }
      try {
        const draftKey = getAdaptDraftStorageKey();
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {
        /* ignore localStorage */
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        if (adaptActiveRunIdRef.current !== myRunId) return;
        setAdaptStreamMode(false);
        setAdaptStreamRunningStepId(null);
        setAdaptStreamDoneStepIds([]);
        setAdapting(false);
        return;
      }
      setApiAdaptDone(false);
      setAdaptStreamMode(false);
      pendingAdaptResultRef.current = null;
      openPhase2AfterFirstAdaptRef.current = false;
      if (e.status === 402 || (e.status === 403 && (e.message || '').toLowerCase().includes('plafond')) || (e.message && e.message.includes('épuisé'))) {
        setUpgradeModalVisible(true);
      } else {
        setError(e.message || "Erreur.");
      }
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Désolé, une erreur s\'est produite. ' + (e.message || '') }]);
      setAdapting(false);
    }
  };

  const handleRemoveTodoStep = (stepId) => {
    setAdaptTodoPlan((prev) => {
      if (!prev) return prev;
      const nextTodo = (prev.todo || []).filter((step) => step.id !== stepId);
      const selected = nextTodo.map((s) => s.id);
      if (prev.planId) {
        apiPatch(`/api/adapt-plan/${encodeURIComponent(prev.planId)}`, { selected_step_ids: selected }).catch(() => {
          /* ignore */
        });
      }
      const removed = (prev.todo || []).find((s) => s.id === stepId);
      setAdaptTodoLastAction(`Retirée: ${removed?.title || stepId}`);
      return { ...prev, todo: nextTodo };
    });
  };

  const applyAdaptLanguageChoice = (policy) => {
    const choice = policy === 'offer' ? 'offer' : 'cv';
    setAdaptLanguageModalOpen(false);
    setAdaptTodoPlan((prev) => (prev ? { ...prev, outputLanguage: choice } : prev));
    const pending = pendingAdaptAfterLanguageRef.current;
    pendingAdaptAfterLanguageRef.current = null;
    if (pending?.type === 'run') {
      const plan = adaptTodoPlan;
      if (!plan || adapting) return;
      const selected = (plan.todo || []).map((s) => s.id);
      if (!selected.length) return;
      runPlannedAdaptation({
        description: plan.description,
        selectedStepIds: selected,
        source: 'todo_confirm',
        planId: plan.planId || null,
        outputLanguage: choice,
      });
      return;
    }
    if (pending?.type === 'setup') {
      runDirectAdaptFromSetup({ ...pending, outputLanguage: choice });
    }
  };

  const runDirectAdaptFromSetup = async ({ fiche, pos, ent, userPreview, outputLanguage = 'cv' }) => {
    setAdapting(true);
    try {
      const data = await apiPost('/api/adapt', {
        description: fiche,
        titre: pos || undefined,
        entreprise: ent || undefined,
        output_language: outputLanguage === 'offer' ? 'offer' : 'cv',
        ...templateParams,
      });
      setLastAdaptedCv(data.cv);
      setLastAdaptationId(data.adaptation_id || null);
      if (data.export_hints && data.adaptation_id) {
        exportHintsRef.current = { ...data.export_hints, adaptation_id: data.adaptation_id };
      } else if (data.adaptation_id) {
        exportHintsRef.current = {
          adaptation_id: data.adaptation_id,
          poste: '',
          entreprise: '',
          entreprise_confidence: 0,
        };
      }
      entrepriseFieldTouchedRef.current = false;
      if (data.export_hints) {
        setPosteNom((p) => ((p && p.trim()) ? p : (data.export_hints.poste || '')));
        setEntrepriseNom((e) => ((e && e.trim()) ? e : (data.export_hints.entreprise || '')));
      }
      setLastSelectionA4(data.selection_a4 || null);
      setRapport(data.rapport || {});
      setRapportBefore(data.rapport_before || null);
      setExportBlockVisible(true);
      setPreviewVariant('modified');
      loadApplications();
      loadUsage();
      let baseCv = null;
      try {
        baseCv = await apiGet('/api/cv');
      } catch {
        /* ignore */
      }
      if (baseCv) setLastBaseCv(baseCv);
      const html = await postRenderHtml({
        ...templateParams,
        cv: data.cv,
        base_cv: baseCv ?? undefined,
        highlight_changes: true,
        selection_a4: data.selection_a4 || undefined,
      });
      setPreviewHtml(html);
      setModifiedPreviewHtml(html);
      const summary = withAdaptLanguageNotice(
        data.rapport?.score_global != null
          ? `CV adapté (score ${data.rapport.score_global}/100). Tu peux affiner en envoyant un autre message.`
          : 'CV adapté. Envoie un message pour affiner ou clique sur le texte pour éditer.',
        data.cv_language,
        data.offer_language,
        data.output_language,
      );
      setChatMessages([{ role: 'user', content: userPreview }, { role: 'assistant', content: summary }]);
      if (openPhase2AfterFirstAdaptRef.current) {
        openPhase2AfterFirstAdaptRef.current = false;
        bumpPostFirstAdaptTour();
      }
    } catch (e) {
      openPhase2AfterFirstAdaptRef.current = false;
      if (e.status === 402 || (e.status === 403 && (e.message || '').toLowerCase().includes('plafond')) || (e.message && e.message.includes('épuisé'))) {
        setUpgradeModalVisible(true);
      } else {
        showError(e.message || "Erreur lors de l'adaptation.");
      }
      setChatMessages([
        { role: 'user', content: userPreview },
        { role: 'assistant', content: 'Erreur : ' + (e.message || '') },
      ]);
    } finally {
      setAdapting(false);
    }
  };

  const handleRunTodoPlan = async () => {
    if (!adaptTodoPlan || adapting) return;
    const selected = (adaptTodoPlan.todo || []).map((s) => s.id);
    if (!selected.length) {
      setError('Active au moins une étape avant de lancer.');
      return;
    }
    if (adaptTodoPlan.languageMismatch && !adaptTodoPlan.outputLanguage) {
      pendingAdaptAfterLanguageRef.current = { type: 'run' };
      setAdaptLanguageMeta({
        cvLanguage: adaptTodoPlan.cvLanguage,
        offerLanguage: adaptTodoPlan.offerLanguage,
      });
      setAdaptLanguageModalOpen(true);
      return;
    }
    await runPlannedAdaptation({
      description: adaptTodoPlan.description,
      selectedStepIds: selected,
      source: 'todo_confirm',
      planId: adaptTodoPlan.planId || null,
      outputLanguage: adaptTodoPlan.outputLanguage || 'cv',
    });
  };

  const handleChatSend = async () => {
    const text = (chatInput || '').trim();
    if (!text || adapting || adaptPlanLoading) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    hideError();
    if (!lastAdaptedCv) {
      if (adaptTodoPlan) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: "Valide d'abord la todo (ou démarre une nouvelle candidature)." }]);
        return;
      }
      trackEvent('adapt_cta_clicked', {
        source: 'chat_send',
        desc_word_count: text.split(/\s+/).filter(Boolean).length,
      });
      setAdaptPlanLoading(true);
      try {
        const plan = await apiPost('/api/adapt-plan', {
          description: text,
          titre: posteNom || undefined,
          entreprise: entrepriseNom || undefined,
        });
        const todo = Array.isArray(plan?.todo) ? plan.todo : [];
        const mismatch = Boolean(
          plan?.language_mismatch
          || shouldPromptLanguageChoice(plan?.cv_language, plan?.offer_language),
        );
        setAnnonce(text);
        setAdaptRunStepIds([]);
        setAdaptStreamRunningStepId(null);
        setAdaptStreamDoneStepIds([]);
        setAdaptTodoPlan({
          planId: plan?.plan_id || null,
          description: text,
          todo,
          assistantMessage: plan?.assistant_message || "Voici un plan d'adaptation. Ajuste les étapes puis valide.",
          cvLanguage: plan?.cv_language || null,
          offerLanguage: plan?.offer_language || null,
          languageMismatch: mismatch,
          outputLanguage: mismatch ? null : 'cv',
        });
        setChatMessages((prev) => [...prev, {
          role: 'assistant',
          content: plan?.assistant_message || "Voici un plan d'adaptation. Ajuste les étapes puis valide.",
          kind: 'todo_plan',
        }]);
        if (mismatch) {
          setAdaptLanguageMeta({
            cvLanguage: plan?.cv_language || null,
            offerLanguage: plan?.offer_language || null,
          });
          setAdaptLanguageModalOpen(true);
        }
        try {
          const key = getPersistedPlanStorageKey();
          if (key && plan?.plan_id) localStorage.setItem(key, String(plan.plan_id));
        } catch {
          /* ignore localStorage */
        }
        try {
          const draftKey = getAdaptDraftStorageKey();
          if (draftKey) localStorage.removeItem(draftKey);
        } catch {
          /* ignore localStorage */
        }
      } catch (e) {
        if (e.status === 402 || (e.status === 403 && (e.message || '').toLowerCase().includes('plafond')) || (e.message && e.message.includes('épuisé'))) {
          setUpgradeModalVisible(true);
        } else {
          setError(e.message || "Erreur.");
        }
        setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Désolé, une erreur s\'est produite. ' + (e.message || '') }]);
      } finally {
        setAdaptPlanLoading(false);
      }
      return;
    }
    setAdapting(true);
    setAdaptStepLabels(['Analyse de la demande', 'Application des modifications', 'Finalisation']);
    try {
      const data = await apiPost('/api/adapt-refine', { cv: lastAdaptedCv, instruction: text });
      if (lastAdaptationId) {
        try {
          const patch = { full_cv: data.cv };
          if (lastSelectionA4 && typeof lastSelectionA4 === 'object') {
            patch.selection_a4 = lastSelectionA4;
          }
          await apiPatch(`/api/applications/${encodeURIComponent(lastAdaptationId)}`, patch);
        } catch (persistErr) {
          showError(persistErr.message || 'CV affiné en local - enregistrement serveur incomplet. Réessaie ou exporte le dossier.');
        }
      }
      const html = await postRenderHtml({
        ...templateParams,
        cv: data.cv,
        base_cv: lastBaseCv || undefined,
        highlight_changes: false,
        selection_a4: undefined,
      });
      pendingAdaptResultRef.current = {
        cv: data.cv,
        adaptation_id: lastAdaptationId,
        selection_a4: null,
        rapport,
        rapportBefore: null,
        exportBlockVisible: exportBlockVisible,
        previewHtml: html,
        modifiedPreviewHtml: html,
        summary: (() => {
          const touched = [];
          if (data?.tweaks?.resume) touched.push('résumé');
          if (Array.isArray(data?.tweaks?.experiences) && data.tweaks.experiences.length) touched.push('expériences');
          if (data?.tweaks?.mots_cles_cache) touched.push('ATS');
          const sectionText = touched.length ? ` Sections modifiées: ${touched.join(', ')}.` : '';
          return `Modifications appliquées.${sectionText} Tu peux continuer à affiner ou télécharger le CV.`;
        })(),
        baseCv: lastBaseCv ?? undefined,
      };
      setApiAdaptDone(true);
    } catch (e) {
      setApiAdaptDone(false);
      pendingAdaptResultRef.current = null;
      if (e.status === 402 || (e.status === 403 && (e.message || '').toLowerCase().includes('plafond')) || (e.message && e.message.includes('épuisé'))) {
        setUpgradeModalVisible(true);
      } else {
        setError(e.message || "Erreur.");
      }
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Désolé, une erreur s\'est produite. ' + (e.message || '') }]);
      setAdapting(false);
    }
  };

  const handleSaveCvEdits = (editedCv) => {
    if (!editedCv) return;
    setLastAdaptedCv(editedCv);
    postRenderHtml({
      ...templateParams,
      cv: editedCv,
      base_cv: lastBaseCv || undefined,
      highlight_changes: false,
      selection_a4: lastSelectionA4 || undefined,
    })
      .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
      .catch(() => {
        /* ignore */
      });
    setCvEditPanelOpen(false);
  };

  const [proModalVisible, setProModalVisible] = useState(false);

  // Retour Stripe (abo Pro) : URL nettoyée + rafraîchissement plan (webhook peut prendre quelques secondes)
  useEffect(() => {
    if (!session || authLoading || !pathname.startsWith('/app')) return;
    const params = new URLSearchParams(location.search);
    const isProSuccess = params.get('success') === 'pro';
    const isCheckoutCancel = params.get('cancel') === 'checkout';
    if (!isProSuccess && !isCheckoutCancel) return;
    params.delete('success');
    params.delete('cancel');
    const qs = params.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    if (!isProSuccess) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        try {
          const data = await apiGet('/api/usage');
          if (cancelled) return;
          setUsage(data);
          if (data?.plan === 'pro') {
            setProModalVisible(true);
            break;
          }
        } catch (_) { /* ignore */ }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();
    return () => { cancelled = true; };
  }, [session, authLoading, pathname, location.search, navigate]);

  const handleUpgradeClick = () => {
    setProModalVisible(true);
  };

  const handleStartCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { url } = await apiPost('/api/create-checkout-session', {});
      if (url) window.location.href = url;
      else setError('Impossible de créer la session de paiement.');
    } catch (e) {
      setError(e.message || 'Paiement non disponible.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscriptionClick = () => {
    setManageSubscriptionModalOpen(true);
  };

  const handleManageSubscriptionConfirm = async () => {
    setCheckoutLoading(true);
    setManageSubscriptionModalOpen(false);
    if (cancelReason || cancelReasonText.trim()) {
      try {
        await apiPost('/api/cancel-feedback', { reason: cancelReason, comment: cancelReasonText.trim() });
      } catch (_) { /* endpoint optionnel */ }
    }
    setCancelReason('');
    setCancelReasonText('');
    try {
      const { url } = await apiPost('/api/create-portal-session', {});
      if (url) window.location.href = url;
      else setError('Impossible d\'accéder au portail de gestion.');
    } catch (e) {
      if (e.status === 503) setError('Le portail de gestion des abonnements n\'est pas disponible (paiement non configuré).');
      else setError(e.message || 'Gestion non disponible.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const onPreviewVariantChange = (v) => {
    setPreviewVariant(v);
  };

  const executePdfDownload = async (templateOptsOverride, titreForPdf, entrepriseForPdf) => {
    if (!lastAdaptedCv) return;
    const preopenedWindow = prepareAppleDownloadWindow();
    const opts = templateOptsOverride ?? templateOptions;
    try {
      const pdfTemplateOptions = { ...opts, show_mots_cles_ats: opts?.show_mots_cles_ats !== false };
      const titre = (titreForPdf || '').trim();
      const ent = (entrepriseForPdf || '').trim();
      let pattern = '';
      try {
        pattern = localStorage.getItem(STORAGE_PDF_EXPORT_FILENAME_PATTERN) || '';
      } catch (_) { /* ignore */ }
      const suggestedFilename = buildAdaptedPdfFilename(pattern, {
        prenom: lastAdaptedCv?.prenom,
        nom: lastAdaptedCv?.nom,
        poste: titre,
        entreprise: ent,
      });
      let startIn = null;
      try {
        startIn = await getPdfSaveStartInDirectoryHandle();
      } catch (_) { /* ignore */ }
      const { blob } = await postPdfBlob({
        cv: lastAdaptedCv,
        titre: titre || undefined,
        entreprise: ent || undefined,
        selection_a4: lastSelectionA4 || undefined,
        template_id: templateId,
        template_options: pdfTemplateOptions,
      });
      await saveBlobWithPreferredMethod(blob, suggestedFilename, { preopenedWindow, startIn });
      const count = parseInt(localStorage.getItem('pdf_export_count') || '0', 10) + 1;
      localStorage.setItem('pdf_export_count', String(count));
      if (lastAdaptationId) {
        try {
          await apiPatch(`/api/applications/${encodeURIComponent(lastAdaptationId)}`, {
            poste: titre,
            entreprise: ent,
          });
        } catch (_) { /* suivi optionnel */ }
        loadApplications().then(() => {
          setJustAddedAppId(lastAdaptationId);
          navigate('/app/postule');
          setTimeout(() => setJustAddedAppId(null), 2800);
        });
      }
    } catch (e) {
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      showError(`Téléchargement PDF : ${e.message || e}${getDownloadPermissionHint()}`);
    }
  };

  const downloadBaseCvPdf = async () => {
    setBaseCvPdfLoading(true);
    const preopenedWindow = prepareAppleDownloadWindow();
    const opts = templateOptions;
    let base = null;
    try {
      base = await apiGet('/api/cv');
    } catch (_) { /* fallback below */ }
    if (!base) base = lastBaseCv;
    if (base) setLastBaseCv(base);
    if (!base) {
      setBaseCvPdfLoading(false);
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      showError('Impossible de charger ton CV de base. Vérifie ta connexion ou enregistre ton profil, puis réessaie.');
      return;
    }
    try {
      const pdfTemplateOptions = { ...opts, show_mots_cles_ats: opts?.show_mots_cles_ats !== false };
      const { blob, filename } = await postPdfBlob({
        cv: base,
        template_id: templateId,
        template_options: pdfTemplateOptions,
      });
      await saveBlobWithPreferredMethod(blob, filename || 'CV-base.pdf', { preopenedWindow });
      trackEvent('base_cv_pdf_downloaded', { template_id: templateId, source: 'cv_tab' });
    } catch (e) {
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      showError(`Téléchargement PDF : ${e.message || e}${getDownloadPermissionHint()}`);
    } finally {
      setBaseCvPdfLoading(false);
    }
  };

  const doDownloadPdf = async (templateOptsOverride) => {
    if (!lastAdaptedCv) return;
    const h = exportHintsRef.current;
    const hintsOk = !!(h && lastAdaptationId && h.adaptation_id === lastAdaptationId);
    const mergedPoste = (posteNom || '').trim() || (hintsOk ? (h.poste || '').trim() : '');
    const mergedEnt = (entrepriseNom || '').trim() || (hintsOk ? (h.entreprise || '').trim() : '');
    const conf = hintsOk && typeof h.entreprise_confidence === 'number' ? h.entreprise_confidence : 0;
    const needEntrepriseModal = !entrepriseFieldTouchedRef.current
      && (mergedEnt === '' || conf < EXPORT_ENTREPRISE_CONFIDENCE_OK);
    if (needEntrepriseModal) {
      pdfEntrepriseModalPendingOptsRef.current = templateOptsOverride;
      pdfEntrepriseModalMergedPosteRef.current = mergedPoste;
      setPdfEntrepriseModalValue(mergedEnt);
      setPdfEntrepriseModalOpen(true);
      return;
    }
    await executePdfDownload(templateOptsOverride, mergedPoste, mergedEnt);
  };

  const closePdfEntrepriseModal = () => {
    setPdfEntrepriseModalOpen(false);
    pdfEntrepriseModalPendingOptsRef.current = null;
  };

  const confirmPdfEntrepriseModal = async () => {
    const v = pdfEntrepriseModalValue.trim();
    setEntrepriseNom(v);
    entrepriseFieldTouchedRef.current = true;
    setPdfEntrepriseModalOpen(false);
    const opts = pdfEntrepriseModalPendingOptsRef.current;
    pdfEntrepriseModalPendingOptsRef.current = null;
    const posteEff = pdfEntrepriseModalMergedPosteRef.current;
    await executePdfDownload(opts, posteEff, v);
  };

  const runExportDossier = async (templateOptsOverride) => {
    if (!lastAdaptedCv) return;
    const h = exportHintsRef.current;
    const hintsOk = !!(h && lastAdaptationId && h.adaptation_id === lastAdaptationId);
    const posteEff = (posteNom || '').trim() || (hintsOk ? (h.poste || '').trim() : '');
    const entEff = (entrepriseNom || '').trim() || (hintsOk ? (h.entreprise || '').trim() : '');
    if (!posteEff) {
      showError("Indiquez l'intitulé du poste.");
      return;
    }
    if (!(posteNom || '').trim() && posteEff) setPosteNom(posteEff);
    if (!(entrepriseNom || '').trim() && entEff) setEntrepriseNom(entEff);
    const params = { template_id: templateId, template_options: templateOptsOverride ?? templateOptions };
    hideError();
    setExporting(true);

    const updateAppMeta = async () => {
      if (lastAdaptationId) {
        try {
          await apiPatch(`/api/applications/${encodeURIComponent(lastAdaptationId)}`, {
            poste: posteEff,
            entreprise: entEff,
          });
          loadApplications();
        } catch {
          /* patch application meta: non-bloquant */
        }
      }
    };

    try {
      const pickerAvailable = typeof showDirectoryPicker === 'function';
      const usePicker = pickerAvailable;
      if (usePicker) {
        const rootHandle = await showDirectoryPicker();
        const folderName = getExportFolderName(entEff, posteEff);
        const subDir = await rootHandle.getDirectoryHandle(folderName, { create: true });
        const { blob } = await apiPostBlob('/api/export-dossier-zip', {
          cv: lastAdaptedCv,
          titre: posteEff,
          entreprise: entEff,
          description: annonce,
          adaptation_id: lastAdaptationId || undefined,
          selection_a4: lastSelectionA4 || undefined,
          ...params,
        });
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(blob);
        const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        const filesWritten = [];
        for (const path of entries) {
          const name = path.includes('/') ? path.slice(path.indexOf('/') + 1) : path;
          const fileBlob = await zip.files[path].async('blob');
          const f = await subDir.getFileHandle(name, { create: true });
          const w = await f.createWritable();
          await w.write(fileBlob);
          await w.close();
          filesWritten.push(name);
        }
        setRapport({
          score_global: null,
          folder: rootHandle.name + '/' + folderName,
          files: filesWritten,
        });
        await updateAppMeta();
      } else {
        const data = await apiPost('/api/export-dossier', {
          cv: lastAdaptedCv,
          titre: posteEff,
          entreprise: entEff,
          description: annonce,
          dossier: exportDossierPath.trim() || undefined,
          selection_a4: lastSelectionA4 || undefined,
          ...params,
        });
        if (exportDossierPath.trim()) localStorage.setItem(STORAGE_EXPORT_DIR, exportDossierPath.trim());
        setRapport({ ...rapport, folder: data.folder, files: data.files || [] });
        await updateAppMeta();
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        hideError();
      } else {
        showError('Export dossier : ' + (e.message || e));
      }
    } finally {
      setExporting(false);
    }
  };

  const handleTemplateOptionsModalAfterClose = () => {
    const pending = preExportPendingActionRef.current;
    if (!pending) return;
    preExportPendingActionRef.current = null;
    try {
      localStorage.setItem(STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE, '1');
    } catch (_) { /* ignore */ }
    const opts = templateOptions;
    if (pending === 'pdf') {
      if (shouldShowExportAtsBlockModal()) {
        setExportAtsBlockModalShowMotsCles(opts?.show_mots_cles_ats !== false);
        setExportAtsBlockReminderMode('every');
        setExportAtsBlockPendingAction('pdf');
        setExportAtsBlockModalOpen(true);
      } else {
        const count = parseInt(localStorage.getItem('pdf_export_count') || '0', 10);
        if (count < 3) {
          setPendingPdfAction('pdf');
          setAtsDisclaimerVisible(true);
        } else {
          doDownloadPdf();
        }
      }
    } else if (pending === 'dossier') {
      if (shouldShowExportAtsBlockModal()) {
        setExportAtsBlockModalShowMotsCles(opts?.show_mots_cles_ats !== false);
        setExportAtsBlockReminderMode('every');
        setExportAtsBlockPendingAction('dossier');
        setExportAtsBlockModalOpen(true);
      } else {
        void runExportDossier();
      }
    }
  };

  const closeExportAtsBlockModal = () => {
    setExportAtsBlockModalOpen(false);
    setExportAtsBlockPendingAction(null);
  };

  const confirmExportAtsBlockModal = () => {
    const nextOpts = { ...templateOptions, show_mots_cles_ats: exportAtsBlockModalShowMotsCles };
    setTemplateOptions(nextOpts);
    if (exportAtsBlockReminderMode === 'snooze7') {
      localStorage.setItem(STORAGE_EXPORT_ATS_BLOCK_SNOOZE, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } else {
      localStorage.removeItem(STORAGE_EXPORT_ATS_BLOCK_SNOOZE);
    }
    setExportAtsBlockModalOpen(false);
    const action = exportAtsBlockPendingAction;
    setExportAtsBlockPendingAction(null);
    if (action === 'pdf') {
      const count = parseInt(localStorage.getItem('pdf_export_count') || '0', 10);
      if (count < 3) {
        pendingExportTemplateOptionsRef.current = nextOpts;
        setPendingPdfAction('pdf');
        setAtsDisclaimerVisible(true);
      } else {
        doDownloadPdf(nextOpts);
      }
    } else if (action === 'dossier') {
      runExportDossier(nextOpts);
    }
  };

  const handlePdf = () => {
    if (!lastAdaptedCv) return;
    if (preExportPendingActionRef.current) return;
    if (shouldShowPreExportTemplateOptions()) {
      preExportPendingActionRef.current = 'pdf';
      setExportPrepTemplateOptionsNonce((n) => n + 1);
      return;
    }
    if (shouldShowExportAtsBlockModal()) {
      setExportAtsBlockModalShowMotsCles(templateOptions?.show_mots_cles_ats !== false);
      setExportAtsBlockReminderMode('every');
      setExportAtsBlockPendingAction('pdf');
      setExportAtsBlockModalOpen(true);
      return;
    }
    const count = parseInt(localStorage.getItem('pdf_export_count') || '0', 10);
    if (count < 3) {
      setPendingPdfAction('pdf');
      setAtsDisclaimerVisible(true);
    } else {
      doDownloadPdf();
    }
  };

  // Quand on switch sur "original", afficher le HTML de base dans l'iframe
  useEffect(() => {
    if (!isCvView || previewVariant !== 'original') return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (originalPreviewHtml) {
      iframe.srcdoc = originalPreviewHtml;
      return;
    }
    if (lastBaseCv) {
      postRenderHtml({
        cv: lastBaseCv,
        template_id: templateId,
        template_options: templateOptions,
      })
        .then((html) => {
          setOriginalPreviewHtml(html);
          if (iframeRef.current) iframeRef.current.srcdoc = html;
        })
        .catch(() => {
        /* ignore */
      });
    }
  }, [previewVariant, isCvView, originalPreviewHtml, lastBaseCv, templateId, templateOptions, templateKey]);

  // Quand on switch sur "modified", afficher le HTML modifié dans l'iframe
  useEffect(() => {
    if (!isCvView || previewVariant !== 'modified') return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (tourHighlightStepActive && tourDemoPreviewHtml) {
      iframe.srcdoc = tourDemoPreviewHtml;
      return;
    }
    if (modifiedPreviewHtml) {
      iframe.srcdoc = modifiedPreviewHtml;
      return;
    }
    if (!lastAdaptedCv && previewHtmlFallback) {
      iframe.srcdoc = previewHtmlFallback;
    }
  }, [previewVariant, isCvView, modifiedPreviewHtml, tourDemoPreviewHtml, tourHighlightStepActive, previewHtmlFallback, lastAdaptedCv, templateKey]);

  const handleExportDossier = async () => {
    if (!lastAdaptedCv) return;
    const h = exportHintsRef.current;
    const hintsOk = !!(h && lastAdaptationId && h.adaptation_id === lastAdaptationId);
    const mergedPoste = (posteNom || '').trim() || (hintsOk ? (h.poste || '').trim() : '');
    if (!mergedPoste) {
      showError("Indiquez l'intitulé du poste.");
      return;
    }
    if (preExportPendingActionRef.current) return;
    if (shouldShowPreExportTemplateOptions()) {
      preExportPendingActionRef.current = 'dossier';
      setExportPrepTemplateOptionsNonce((n) => n + 1);
      return;
    }
    if (shouldShowExportAtsBlockModal()) {
      setExportAtsBlockModalShowMotsCles(templateOptions?.show_mots_cles_ats !== false);
      setExportAtsBlockReminderMode('every');
      setExportAtsBlockPendingAction('dossier');
      setExportAtsBlockModalOpen(true);
      return;
    }
    await runExportDossier();
  };

  const handleStatutChange = async (id, statut, extra = {}) => {
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(id)}`, { statut, ...extra });
      setCandidaturesError('');
      loadApplications();
    } catch (e) {
      setCandidaturesError(e?.message || 'Impossible de mettre à jour le statut.');
    }
  };

  const handleStatutSelect = (app, newStatut) => {
    if (newStatut === 'refus') {
      setStatutModalType('refus');
      setStatutModalAppId(app.id);
      setStatutModalApp(app);
      setRefusRaisonType(app.refus_raison_type || '');
      setRefusRaison(app.refus_raison || '');
      return;
    }
    if (newStatut === 'interview') {
      setStatutModalType('interview');
      setStatutModalAppId(app.id);
      setStatutModalApp(app);
      setInterviewType(app.interview_type || '');
      setInterviewFeedback(app.interview_feedback || '');
      setInterviewDate(app.interview_date || '');
      return;
    }
    handleStatutChange(app.id, newStatut);
  };

  const submitRefusModal = async (skipFeedback) => {
    if (!statutModalAppId) return;
    setStatutModalSubmitting(true);
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(statutModalAppId)}`, {
        statut: 'refus',
        ...(skipFeedback ? {} : { refus_raison_type: refusRaisonType || undefined, refus_raison: refusRaison || undefined }),
      });
      loadApplications();
      setStatutModalType(null);
      setStatutModalAppId(null);
      setStatutModalApp(null);
      setCandidaturesError('');
    } catch (e) {
      setCandidaturesError(e.message || 'Erreur enregistrement');
    } finally {
      setStatutModalSubmitting(false);
    }
  };

  const submitInterviewModal = async () => {
    if (!statutModalAppId) return;
    setStatutModalSubmitting(true);
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(statutModalAppId)}`, {
        statut: 'interview',
        interview_type: interviewType || undefined,
        interview_feedback: interviewFeedback || undefined,
        interview_date: interviewDate || undefined,
      });
      loadApplications();
      setStatutModalType(null);
      setStatutModalAppId(null);
      setStatutModalApp(null);
      setCandidaturesError('');
    } catch (e) {
      setCandidaturesError(e.message || 'Erreur enregistrement');
    } finally {
      setStatutModalSubmitting(false);
    }
  };

  const handleKanbanDrop = (targetStatut, app) => {
    setKanbanDraggedId(null);
    setKanbanDragOverColumn(null);
    if (targetStatut === 'refus') {
      handleStatutSelect(app, 'refus');
      return;
    }
    if (targetStatut === 'interview') {
      handleStatutSelect(app, 'interview');
      return;
    }
    handleStatutChange(app.id, targetStatut);
  };

  const handleArchive = async (id, isArchived) => {
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(id)}`, { archived: isArchived });
      loadApplications();
    } catch {
      /* ignore */
    }
  };

  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [firstOfferNudgeOpen, setFirstOfferNudgeOpen] = useState(false);
  const [manageSubscriptionModalOpen, setManageSubscriptionModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonText, setCancelReasonText] = useState('');

  const handleSignOut = async () => {
    setSignOutConfirmOpen(false);
    if (supabase) await supabase.auth.signOut();
  };

  /** Prod : bloque /app sur petit écran (sauf Mes candidatures — liste mobile AXE-381). Opt-out : VITE_ALLOW_MOBILE_APP=true */
  const MOBILE_APP_GATE_MAX_PX = 768;
  const mobileAppGateActive =
    import.meta.env.PROD &&
    import.meta.env.VITE_ALLOW_MOBILE_APP !== 'true' &&
    import.meta.env.VITE_ALLOW_MOBILE_APP !== '1';
  const [mobileViewportTooNarrow, setMobileViewportTooNarrow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_APP_GATE_MAX_PX}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_APP_GATE_MAX_PX}px)`);
    const sync = () => setMobileViewportTooNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showMobileAppGate =
    mobileAppGateActive &&
    mobileViewportTooNarrow &&
    pathname.startsWith('/app') &&
    !pathname.startsWith(APP_ROUTES.postule);

  useEffect(() => {
    if (!showMobileAppGate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showMobileAppGate]);

  const showProfileCvLoadError =
    !!session && pathname.startsWith('/app') && onboardingChecked && !!profileCvLoadError;

  useEffect(() => {
    if (!showProfileCvLoadError) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showProfileCvLoadError]);

  const handleProfileSaveSuccess = () => {
    if (!lastAdaptedCv) loadInitialPreview();
  };

  useEffect(() => {
    const trimmed = applicationSearchQuery.trim();
    if (trimmed === '') {
      setApplicationSearchDebounced('');
      return;
    }
    const t = setTimeout(() => setApplicationSearchDebounced(trimmed), 200);
    return () => clearTimeout(t);
  }, [applicationSearchQuery]);

  useEffect(() => {
    if (!candidaturesAddMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (candidaturesAddMenuRef.current && !candidaturesAddMenuRef.current.contains(e.target)) {
        setCandidaturesAddMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setCandidaturesAddMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [candidaturesAddMenuOpen]);

  const filteredApplications = useMemo(() => {
    const q = applicationSearchDebounced.toLowerCase();
    let list = applications;
    if (q) {
      list = list.filter((app) => {
        const poste = ((app.poste || app.poste_offre || '') + ' ').toLowerCase();
        const entreprise = ((app.entreprise || '') + ' ').toLowerCase();
        const source = ((app.source_offre || '') + ' ').toLowerCase();
        const date = ((app.date || '') + ' ').toLowerCase();
        return poste.includes(q) || entreprise.includes(q) || source.includes(q) || date.includes(q);
      });
    }
    if (candidaturesMetricFilter === 'relancer') {
      list = list.filter((app) => isApplicationToFollowUp(app));
    }
    return list;
  }, [applications, applicationSearchDebounced, candidaturesMetricFilter]);

  const filteredNonArchivedCount = useMemo(
    () => filteredApplications.filter((a) => !a.archived).length,
    [filteredApplications],
  );
  const filteredArchived = useMemo(
    () => filteredApplications.filter((a) => a.archived),
    [filteredApplications],
  );

  const applicationStats = useMemo(() => computeApplicationMetrics(applications), [applications]);

  /* Mode full Supabase : sans config Supabase, on n'affiche que l'écran de configuration */
  if (!supabase) {
    return (
      <div className="login-screen">
        <div className="login-screen-card">
          <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
          <h1>AxeL Job</h1>
          <p className="login-screen-intro">
            Configure Supabase pour utiliser l'application. Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env</code> (voir <code>.env.example</code>).
          </p>
        </div>
      </div>
    );
  }

  /* Réinitialisation mot de passe : utilisateur arrivé via le lien email, doit définir un nouveau mot de passe */
  if (session && recoveryMode) {
    return <RecoveryPasswordForm onDone={() => setRecoveryMode(false)} />;
  }

  /* MFA optionnel : si l'utilisateur a activé la MFA, demander le code TOTP avant d'accéder à l'app */
  if (session && mfaChallengeRequired) {
    return (
      <MfaChallengeScreen
        onSuccess={() => {
          setMfaChallengeRequired(false);
          supabase?.auth?.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setAuthToken(s?.access_token ?? null);
          });
        }}
      />
    );
  }

  /* Non connecté : login visible tout de suite (AXE-372), sans attendre getSession. */
  if (!session) {
    if (pathname === '/login') {
      return (
        <div className="login-screen">
          <button type="button" className="login-screen-back" onClick={() => navigate('/')} aria-label="Retour à l'accueil">
            &larr; Retour à l&apos;accueil
          </button>
          <div className="login-screen-card">
            <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
            <h1>AxeL Job</h1>
            <p className="login-screen-intro">Adapte ton CV à chaque offre en quelques secondes.</p>
            {loginOtpExpired && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>
                Le lien de connexion a expiré ou n&apos;est plus valide. Demande un nouveau lien ci-dessous.
              </div>
            )}
            <AuthForm onSuccess={() => setAuthLoading(false)} />
          </div>
        </div>
      );
    }
    if (pathname === '/') {
      return <Suspense fallback={<div className="landing" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span aria-hidden>Chargement…</span></div>}><LandingPage onCtaClick={() => navigate('/login')} onProClick={() => navigate('/login?plan=pro')} /></Suspense>;
    }
    const marketing = renderPublicMarketingPage(pathname, navigate);
    if (marketing) return marketing;
    if (authLoading || pathname.startsWith('/app')) {
      return (
        <div className="landing" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span aria-live="polite">Chargement…</span>
        </div>
      );
    }
    return <NotFoundPage />;
  }

  /* Connecté : redirection / ou /login vers /app (useEffect) ; pages publiques hors /app ; sinon 404 */
  if (!authLoading && session && (pathname === '/' || pathname === '/login')) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span aria-live="polite">Chargement…</span>
      </div>
    );
  }
  if (!authLoading && session && !pathname.startsWith('/app')) {
    const marketing = renderPublicMarketingPage(pathname, navigate);
    if (marketing) return marketing;
    return <NotFoundPage />;
  }

  const showOnboardingBoot = !!(session && pathname.startsWith('/app') && !onboardingChecked);

  return (
    <Suspense fallback={<div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span aria-hidden>Chargement…</span></div>}>
    <div className="app-shell">
      {showMobileAppGate && (
        <div className="app-mobile-gate" role="dialog" aria-modal="true" aria-labelledby="app-mobile-gate-title">
          <div className="app-mobile-gate-card">
            <img src="/favicon.svg" alt="" className="app-mobile-gate-logo" width={48} height={48} />
            <h1 id="app-mobile-gate-title">L’app AxeL Job sur téléphone, c’est pour bientôt</h1>
            <p className="app-mobile-gate-lead">
              La version mobile du tableau de bord arrive. En attendant, les <strong>pages du site</strong> (guides, FAQ, articles) restent accessibles sur ton téléphone.
            </p>
            <p className="app-mobile-gate-hint">
              Pour adapter ton CV, l’aperçu et le suivi des candidatures, ça fonctionne <strong>beaucoup mieux sur ordinateur</strong> - repasse depuis un PC ou une grande tablette.
            </p>
            <div className="app-mobile-gate-actions">
              <button type="button" className="button button-primary" onClick={() => navigate('/faq')}>
                Voir le site (FAQ, guides…)
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
      {showProfileCvLoadError && (
        <div className="app-mobile-gate" role="alertdialog" aria-modal="true" aria-labelledby="profile-load-err-title">
          <div className="app-mobile-gate-card">
            <h1 id="profile-load-err-title">Profil inaccessible</h1>
            <p className="app-mobile-gate-lead">{profileCvLoadError}</p>
            <div className="app-mobile-gate-actions">
              <button type="button" className="button button-primary" onClick={() => setProfileRefreshKey((k) => k + 1)}>
                Réessayer
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
      {showOnboardingBoot && (
        <div className="app-onboarding-boot" role="status" aria-live="polite" aria-busy="true">
          <span className="app-onboarding-boot-spinner" aria-hidden />
          <span>Chargement…</span>
        </div>
      )}
      <AppTopbar
        session={session}
        usage={usage}
        checkoutLoading={checkoutLoading}
        onUpgradeClick={handleUpgradeClick}
        onProBadgeClick={() => setProModalVisible(true)}
        onCookieSettingsClick={() => {
          if (typeof window.axelOpenCookieSettings === 'function') window.axelOpenCookieSettings();
        }}
        onSignOutClick={() => setSignOutConfirmOpen(true)}
        onPromoRedeemed={loadUsage}
      />

      <main className="app-main" id="main-content">
        {needsOnboarding && onboardingChecked && (
          <OnboardingWizard
            session={session}
            onComplete={(target) => {
              setNeedsOnboarding(false);
              setOnboardingChecked(true);
              setProfileRefreshKey((k) => k + 1);
              if (target !== 'profil' && session?.user?.id) {
                try {
                  localStorage.removeItem(`cv_bot_tour_done_main_phase1_${session.user.id}`);
                } catch (_) { /* ignore */ }
              }
              if (target === 'profil') navigate('/app/profil');
              else navigate('/app/cv');
            }}
          />
        )}
        <div id="viewCv" className={`view-panel app-page cv-chat-page ${isCvView ? 'active' : ''}`} style={{ display: isCvView ? 'flex' : 'none' }}>
          <header className="page-header">
            <div className="page-title-row">
              <div className="page-title-row-left">
                <h1 className="page-title">Adapter un CV</h1>
                <button type="button" className="page-tour-help" onClick={handleRestartTour} title="Revoir le tutoriel" aria-label="Revoir le tutoriel">
                  ?
                </button>
              </div>
              <p className="page-subtitle" title="Colle une offre d'emploi, l'IA adapte ton CV. Affine par chat, puis exporte en PDF.">
                Colle une offre d&apos;emploi, l&apos;IA adapte ton CV. Affine par chat, puis exporte en PDF.
              </p>
              <div className="page-title-row-actions">
                <button
                  type="button"
                  className="button button-secondary button--sm btn-new-adapt-session"
                  onClick={requestNewCandidatureWorkspace}
                  disabled={adapting}
                  title="Vider le chat et l’aperçu pour adapter ton CV à une autre offre (sans supprimer tes candidatures enregistrées)"
                >
                  Nouvelle candidature
                </button>
                <button
                  type="button"
                  className="button button-secondary button--sm btn-new-adapt-session"
                  onClick={async () => {
                    if (!lastAdaptRunConfig || adapting) return;
                    setChatMessages((prev) => [...prev, { role: 'user', content: 'Relancer la dernière adaptation' }]);
                    await runPlannedAdaptation({
                      description: lastAdaptRunConfig.description,
                      selectedStepIds: lastAdaptRunConfig.selectedStepIds || [],
                      source: 'redo_last_adaptation',
                    });
                  }}
                  disabled={adapting || !lastAdaptRunConfig}
                  title="Relancer la dernière adaptation avec les mêmes étapes"
                >
                  Relancer la dernière adaptation
                </button>
              </div>
            </div>
          </header>
          {usage && usage.plan === 'free' && usage.adaptations_used >= 2 && (
            <div className="free-plan-banner">
              <span>{(() => {
                const rem = usage.adaptations_quota_remaining ?? (usage.adaptations_limit - usage.adaptations_used);
                return rem <= 0 ? 'Tes adaptations gratuites sont épuisées.' : `Il te reste ${rem} adaptation${rem > 1 ? 's' : ''} gratuite${rem > 1 ? 's' : ''}.`;
              })()}</span>
              <button type="button" className="button button-primary button--sm" onClick={handleUpgradeClick} disabled={checkoutLoading}>
                {checkoutLoading ? '…' : 'Passer Pro - 10€/mois'}
              </button>
            </div>
          )}
          {usage && usage.adaptations_used === 0 && (
            <div className="zero-adapt-banner" role="status">
              <span>
                Prochaine étape : colle une offre dans le champ ci-dessous et envoie (Entrée). C’est ce qui déclenche l’adaptation et crée ta candidature.
              </span>
            </div>
          )}
          <div className="cv-chat-layout" data-analytics-section="cv_workspace">
            <div className="cv-chat-area" data-analytics-section="chat">
              <div className="cv-chat-messages" role="log">
                {chatMessages.length === 0 && (
                  <div className="cv-chat-placeholder">
                    <p>{annonce.trim() ? "Demande à l'IA d'ajuster ton CV (ex. « Mets plus en valeur mon expérience en React »)." : "Colle l'annonce ou décris le poste. L'IA adaptera ton CV. Tu pourras affiner par message."}</p>
                    {usage && usage.plan === 'free' && (
                      <p className="usage-hint">{usage.adaptations_used} / {usage.adaptations_limit} adaptations gratuites</p>
                    )}
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`cv-chat-msg cv-chat-msg--${m.role}`}>
                    <div className={`cv-chat-msg-content ${m.role === 'user' ? 'cv-chat-msg-content--user-collapsible' : ''}`}>
                      {m.kind === 'todo_plan' && adaptTodoPlan ? (
                        <div className="cv-chat-todo-card">
                          <div className="cv-chat-todo-header">
                            <p className="cv-chat-todo-title">
                              {(adaptTodoPlan.assistantMessage || m.content || "Plan d'adaptation")}
                            </p>
                            <span className="cv-chat-todo-badge">
                              {(adaptTodoPlan.todo || []).length} étape(s)
                            </span>
                          </div>
                          <div className="cv-chat-todo-list">
                            {(adaptTodoPlan.todo || []).map((step) => {
                              const sid = String(step.id);
                              const inRun = adaptRunStepIds.length === 0 || adaptRunStepIds.includes(sid);
                              const progressState = !inRun
                                ? ''
                                : lastAdaptedCv && !adapting
                                  ? 'cv-chat-todo-item--done'
                                  : adapting
                                    ? (adaptStreamDoneStepIds.includes(sid)
                                        ? 'cv-chat-todo-item--done'
                                        : adaptStreamRunningStepId === sid
                                          ? 'cv-chat-todo-item--running'
                                          : '')
                                    : '';
                              return (
                                <div key={step.id} className={`cv-chat-todo-item ${progressState}`}>
                                  <span className="cv-chat-todo-item-title">{step.title}</span>
                                  {!adapting && !lastAdaptedCv && (
                                    <button
                                      type="button"
                                      className="cv-chat-todo-item-remove"
                                      onClick={() => handleRemoveTodoStep(step.id)}
                                      title={`Retirer ${step.title}`}
                                      aria-label={`Retirer ${step.title}`}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {!lastAdaptedCv && (
                            <div className="cv-chat-todo-actions">
                              <button type="button" className="button button-primary button--sm" onClick={handleRunTodoPlan} disabled={adapting}>
                                Valider et lancer
                              </button>
                              <button type="button" className="button button-secondary button--sm" onClick={requestNewCandidatureWorkspace} disabled={adapting}>
                                Annuler
                              </button>
                            </div>
                          )}
                          {adaptTodoLastAction ? <p className="cv-chat-todo-last-action">{adaptTodoLastAction}</p> : null}
                        </div>
                      ) : (
                        <>
                          {m.role === 'user' && typeof m.content === 'string' && m.content.length > 280 && !expandedUserMessages[i]
                            ? `${m.content.slice(0, 280)}…`
                            : m.content}
                          {m.role === 'user' && typeof m.content === 'string' && m.content.length > 280 ? (
                            <button
                              type="button"
                              className={`cv-chat-msg-toggle ${expandedUserMessages[i] ? 'is-expanded' : 'is-collapsed'}`}
                              onClick={() => setExpandedUserMessages((prev) => ({ ...prev, [i]: !prev[i] }))}
                              aria-expanded={!!expandedUserMessages[i]}
                              title={expandedUserMessages[i] ? 'Réduire' : 'Afficher tout'}
                            >
                              {expandedUserMessages[i] ? <HiChevronUp aria-hidden="true" /> : <HiChevronDown aria-hidden="true" />}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {adaptPlanLoading && !lastAdaptedCv && (
                  <div className="cv-chat-msg cv-chat-msg--assistant" aria-live="polite" aria-busy="true">
                    <div className="cv-chat-msg-content cv-chat-plan-loading">
                      <div className="cv-chat-plan-loading__shimmer" aria-hidden="true" />
                      <p className="cv-chat-plan-loading__title">Préparation de ton plan</p>
                      <p className="cv-chat-plan-loading__hint">Lecture de l’offre et repérage des points à adapter…</p>
                      <div className="cv-chat-plan-loading__dots" aria-hidden="true">
                        <span className="cv-chat-plan-loading__dot" />
                        <span className="cv-chat-plan-loading__dot" />
                        <span className="cv-chat-plan-loading__dot" />
                      </div>
                    </div>
                  </div>
                )}
                {adapting && (
                  <div className="cv-chat-msg cv-chat-msg--assistant">
                    <div className="cv-chat-msg-content cv-adapt-steps-wrap">
                      <p className="cv-adapt-steps-title">Adaptation du CV en cours…</p>
                      <div className="cv-adapt-steps" role="list" aria-label="Étapes d’adaptation">
                        {adaptStepLabels.map((label, i) => (
                          <div
                            key={i}
                            className={`cv-adapt-step ${i < adaptStepIndex ? 'cv-adapt-step--done' : i === adaptStepIndex ? 'cv-adapt-step--current' : ''}`}
                            role="listitem"
                          >
                            <span className="cv-adapt-step-icon">
                              {i < adaptStepIndex ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              ) : i === adaptStepIndex ? (
                                <span className="cv-adapt-step-spinner" aria-hidden="true" />
                              ) : (
                                <span className="cv-adapt-step-dot" aria-hidden="true" />
                              )}
                            </span>
                            <span className="cv-adapt-step-label">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="cv-adapt-progress-bar">
                        <div className="cv-adapt-progress-fill" style={{ width: `${((adaptStepIndex + 0.5) / adaptStepLabels.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatMessagesEndRef} aria-hidden="true" style={{ height: 0 }} />
              </div>
              {error && <div className="error cv-chat-error">{error}</div>}
              <div className="cv-chat-input-bar">
                <textarea
                  ref={cvChatInputRef}
                  className="cv-chat-input"
                  placeholder={
                    adaptPlanLoading
                      ? 'Préparation de ton plan…'
                      : adaptTodoPlan && !lastAdaptedCv
                        ? "Valide d'abord la todo puis lance l'adaptation."
                        : "Colle une offre d'emploi ou décris ce que tu veux modifier..."
                  }
                  value={chatInput}
                  onChange={(e) => {
                    const el = e.target;
                    setChatInput(el.value);
                    requestAnimationFrame(() => {
                      el.style.height = 'auto';
                      if (!el.value.trim()) {
                        el.style.removeProperty('height');
                        return;
                      }
                      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
                    });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  rows={1}
                  disabled={adapting || adaptPlanLoading || (!!adaptTodoPlan && !lastAdaptedCv)}
                />
                <button type="button" className="cv-chat-input-send" onClick={handleChatSend} disabled={adapting || adaptPlanLoading || !chatInput.trim() || (!!adaptTodoPlan && !lastAdaptedCv)} aria-label="Envoyer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                </button>
              </div>
            </div>
            <div className="cv-chat-preview" data-analytics-section="preview">
              <div className="cv-tpl-scope" style={{ ['--cv-font-heading']: templateOptions?.font && TPL_FONT_SAFE[templateOptions.font] ? TPL_FONT_SAFE[templateOptions.font] : undefined }}>
                <TemplatePicker
                  templates={templatesList}
                  templateId={templateId}
                  templateOptions={templateOptions}
                  onChangeTemplate={(id) => { handleUserPickTemplate(id); trackEvent('template_changed', { template_id: id }); }}
                  onChangeOptions={setTemplateOptions}
                  openOptionsFromSupport={location.state?.supportHighlight?.openTemplateOptions}
                  openOptionsNonce={exportPrepTemplateOptionsNonce}
                  onOptionsModalClosed={handleTemplateOptionsModalAfterClose}
                  optionsPreviewHtml={previewVariant === 'original' ? (originalPreviewHtml || previewHtmlFallback) : (modifiedPreviewHtml || previewHtmlFallback)}
                  optionsPreviewLoading={false}
                  profileLayout={profileLayout}
                  onBetaUnavailable={() => {
                    showError('Crée d’abord un design dans Profil → active le mode Beta, puis reviens choisir « Beta » ici.');
                  }}
                  extraBarLeft={(
                    <button
                      type="button"
                      className="tpl-btn-bar-extra"
                      onClick={downloadBaseCvPdf}
                      disabled={baseCvPdfLoading}
                      title="Télécharger ton CV de profil (sans adaptation) en PDF, avec le template et les options actuels"
                    >
                      <span className="tpl-btn-bar-extra-icon" aria-hidden>
                        <HiArrowDownTray size={16} strokeWidth={2} />
                      </span>
                      Exporter en PDF
                    </button>
                  )}
                />
              </div>
              {lastAdaptedCv && adaptRating === null && (
                <div className="adapt-rating-bar">
                  <span className="adapt-rating-label">Ce résultat te convient ?</span>
                  <div className="adapt-rating-btns">
                    {[
                      { value: 'up', label: 'Bien', svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> },
                      { value: 'neutral', label: 'Moyen', svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
                      { value: 'down', label: 'Pas top', svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg> },
                    ].map(({ value, label, svg }) => (
                      <button
                        key={value}
                        type="button"
                        className={`adapt-rating-btn adapt-rating-btn--${value}`}
                        onClick={() => {
                          setAdaptRating(value);
                          trackEvent('adaptation_rated', {
                            rating: value,
                            adaptation_id: lastAdaptationId,
                            score_ats: rapport?.score_global,
                          });
                        }}
                        title={label}
                      >
                        {svg}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {adaptRating && (
                <div className="adapt-rating-bar adapt-rating-bar--done">
                  <span className="adapt-rating-thanks">Merci pour ton retour !</span>
                </div>
              )}
              {lastBaseCv && lastAdaptedCv && (
                <div className="preview-variant-row">
                  <div className="preview-variant-toggle-wrap">
                    <button type="button" className={`preview-variant-toggle-btn${previewVariant === 'original' ? ' active' : ''}`} onClick={() => onPreviewVariantChange('original')}>Original</button>
                    <button type="button" className={`preview-variant-toggle-btn${previewVariant === 'modified' ? ' active' : ''}`} onClick={() => onPreviewVariantChange('modified')}>Modifié</button>
                  </div>
                  <span className="preview-editable-hint-inline">Clique sur le texte pour modifier.</span>
                </div>
              )}
              <div className="preview-wrap" ref={previewWrapRef}>
                <div className="preview-a4-sheet">
                {previewVariant === 'modified' && lastAdaptedCv && !(templateId || '').startsWith('custom_') && ['classic', 'minimal', 'modern', 'bold', 'creative', 'elegant', 'executive'].includes((templateId || '').trim()) ? (
                  <CvEditablePreview
                    cv={{
                      ...lastAdaptedCv,
                      photo_url: freshPreviewPhotoUrl !== undefined ? freshPreviewPhotoUrl : lastAdaptedCv.photo_url,
                    }}
                    baseCv={lastBaseCv}
                    templateId={templateId}
                    layoutRefreshKey={templateKey}
                    templateOptions={templateOptions}
                    showPhoto={(templateId || '').trim() !== 'minimal' && templateOptions?.show_photo !== false}
                    showMotsClesAts={templateOptions?.show_mots_cles_ats !== false}
                    onPhotoSessionExpired={handlePhotoSessionExpired}
                    previewHtmlWithInlineCss={modifiedPreviewHtml}
                    onChange={(updatedCv) => {
                      setLastAdaptedCv(updatedCv);
                      trackEvent('cv_manually_edited', { adaptation_id: lastAdaptationId });
                      postRenderHtml({
                        ...templateParams,
                        cv: updatedCv,
                        base_cv: lastBaseCv || undefined,
                        highlight_changes: false,
                      })
                        .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
                        .catch(() => {
        /* ignore */
      });
                    }}
                  />
                ) : (
                  <div
                    className={`preview-iframe-wrap${adapting && adaptStreamMode ? ' preview-iframe-wrap--adapt-live' : ''}`}
                  >
                    <iframe
                      ref={iframeRef}
                      key={`adapt-preview-${previewVariant}-${templateKey}`}
                      title="Aperçu du CV"
                      onLoad={(e) => resizeIframeToContent(e.target)}
                    />
                  </div>
                )}
                </div>
              </div>
              {exportBlockVisible && lastAdaptedCv && (
                <div className="cv-chat-export" data-analytics-section="export">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Entreprise"
                    value={entrepriseNom}
                    onChange={(e) => {
                      entrepriseFieldTouchedRef.current = true;
                      setEntrepriseNom(e.target.value);
                    }}
                  />
                  <input type="text" className="input-field" placeholder="Intitulé du poste" value={posteNom} onChange={(e) => setPosteNom(e.target.value)} />
                  {lastAdaptationId && (
                    <select className="input-field" value={sourceOffreValue} onChange={(e) => {
                      const v = e.target.value;
                      setSourceOffreValue(v);
                      const aid = lastAdaptationId;
                      if (!aid) return;
                      if (sourceOffreDebounceRef.current) clearTimeout(sourceOffreDebounceRef.current);
                      const trimmed = v.trim();
                      if (!trimmed) return;
                      sourceOffreDebounceRef.current = setTimeout(() => {
                        apiPatch(`/api/applications/${encodeURIComponent(aid)}`, { source_offre: trimmed }).catch(() => {
        /* ignore */
      });
                      }, 800);
                    }} style={{ maxWidth: '150px' }}>
                      <option value="">Source</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Site entreprise">Site entreprise</option>
                      <option value="APEC">APEC</option>
                      <option value="Indeed">Indeed</option>
                      <option value="Autre">Autre</option>
                    </select>
                  )}
                  {rapport?.score_global != null && (
                    <>
                      <div className="ats-score-inline">
                        <button
                          type="button"
                          className="ats-score-trigger"
                          onClick={() => {
                            setAtsScoreOpen(true);
                            trackEvent('ats_details_opened', { score: rapport?.score_global });
                          }}
                          aria-expanded={atsScoreOpen}
                          aria-haspopup="dialog"
                          aria-controls="ats-score-modal"
                        >
                          <span className="ats-score-pill-label">Score ATS</span>
                          {rapportBefore?.score_global != null && rapportBefore.score_global !== rapport.score_global ? (
                            <span className="ats-score-value">
                              <span className="ats-score-before">{rapportBefore.score_global}</span>
                              <span className="ats-score-arrow">&rarr;</span>
                              <span className="ats-score-after">{rapport.score_global}/100</span>
                            </span>
                          ) : (
                            <span className="ats-score-value">{rapport.score_global}/100</span>
                          )}
                        </button>
                      </div>
                      {atsScoreOpen && (
                        <div
                          className="ats-score-modal-overlay"
                          role="presentation"
                          onClick={() => setAtsScoreOpen(false)}
                        >
                          <div
                            id="ats-score-modal"
                            className="ats-score-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="ats-score-modal-title"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="ats-score-modal-header">
                              <h3 id="ats-score-modal-title">Score ATS - {rapport.score_global}/100</h3>
                              <button
                                type="button"
                                className="ats-score-modal-close"
                                onClick={() => setAtsScoreOpen(false)}
                                aria-label="Fermer"
                              >
                                ×
                              </button>
                            </div>
                            <p className="ats-score-modal-intro">
                              Indicatif sur 100, calculé à partir de l&apos;offre : chaque ligne ci-dessous est une note sur 100,
                              pondérée (pourcentage indiqué) pour former le score global. Ce n&apos;est pas le score d&apos;un logiciel de recrutement précis.
                            </p>
                            {rapport.detail && (
                              <div className="ats-score-section ats-detail-bars">
                                <strong>Détail par catégorie</strong>
                                {[
                                  { key: 'keyword_coverage', label: 'Mots-clés', weight: 35 },
                                  { key: 'ats_section', label: 'Section ATS', weight: 15 },
                                  { key: 'structure', label: 'Structure', weight: 20 },
                                  { key: 'title_match', label: 'Titre', weight: 15 },
                                  { key: 'skills_match', label: 'Compétences', weight: 15 },
                                ].map(({ key, label, weight }) => (
                                  <div key={key} className="ats-bar-row">
                                    <span className="ats-bar-label">{label} <span className="ats-bar-weight">({weight}%)</span></span>
                                    <div className="ats-bar-track">
                                      <div className="ats-bar-fill" style={{ width: `${rapport.detail[key] || 0}%` }} />
                                    </div>
                                    <span className="ats-bar-value">{rapport.detail[key] ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="cv-chat-export-btns">
                    <button type="button" className="button button-success" onClick={handlePdf} disabled={exporting}>Télécharger le PDF</button>
                    <button type="button" className="button button-secondary" onClick={handleExportDossier} disabled={exporting} aria-busy={exporting}>
                      {exporting ? (
                        <>
                          <span className="export-spinner" aria-hidden="true" />
                          Export en cours…
                        </>
                      ) : (
                        typeof showDirectoryPicker === 'function' ? 'Dossier complet (choisir un dossier…)' : 'Dossier complet'
                      )}
                    </button>
                  </div>
                  {exporting && (
                    <p className="cv-chat-export-loading" role="status">Préparation du dossier (PDF, fichiers)…</p>
                  )}
                </div>
              )}
            </div>
          </div>
          {exporting && (
            <div className="application-detail-overlay linkedin-sync-overlay export-overlay" role="dialog" aria-modal="true" aria-live="polite" aria-busy="true">
              <div className="linkedin-sync-modal export-modal" onClick={(e) => e.stopPropagation()}>
                <div className="export-overlay-spinner" aria-hidden="true" />
                <h3 style={{ marginTop: '1rem' }}>Export du dossier en cours</h3>
                <p className="profile-subtitle" style={{ marginTop: 0 }}>Génération du PDF et des fichiers…</p>
              </div>
            </div>
          )}

          {cvEditPanelOpen && lastAdaptedCv && (
            <CvEditPanel cv={lastAdaptedCv} onSave={handleSaveCvEdits} onClose={() => setCvEditPanelOpen(false)} />
          )}
        </div>

        <div id="viewCandidatures" className={`view-panel app-page view-candidatures ${view === 'candidatures' ? 'active' : ''}`} style={{ display: view === 'candidatures' ? 'flex' : 'none' }}>
          <header className="page-header page-header-dashboard">
            <div className="page-title-row">
              <h1 className="page-title">Mes candidatures</h1>
              <p className="page-subtitle" title="Suis toutes tes candidatures ici. Glisse les cartes pour changer le statut.">
                Suis toutes tes candidatures ici. Glisse les cartes pour changer le statut.
              </p>
              <div className="dashboard-header-actions page-title-row-actions">
                <div className="candidatures-add-menu" ref={candidaturesAddMenuRef}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="btn-new-candidature candidatures-add-menu-trigger"
                    aria-expanded={candidaturesAddMenuOpen}
                    aria-haspopup="menu"
                    aria-controls="candidatures-add-menu"
                    onClick={() => setCandidaturesAddMenuOpen((open) => !open)}
                  >
                    <HiPlus aria-hidden />
                    Ajouter
                    <HiChevronDown aria-hidden className={`candidatures-add-menu-chevron${candidaturesAddMenuOpen ? ' is-open' : ''}`} />
                  </Button>
                  {candidaturesAddMenuOpen && (
                    <div
                      id="candidatures-add-menu"
                      className="candidatures-add-menu-panel"
                      role="menu"
                      aria-label="Ajouter une candidature"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="candidatures-add-menu-item"
                        data-attr="candidatures-header-cta-new"
                        data-track="cta"
                        data-zone="header"
                        data-level="primary"
                        onClick={() => {
                          setCandidaturesAddMenuOpen(false);
                          setSetupModalOpen(true);
                        }}
                      >
                        Nouvelle candidature
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="candidatures-add-menu-item"
                        data-attr="candidatures-header-cta-manual"
                        data-track="cta"
                        data-zone="header"
                        data-level="secondary"
                        onClick={() => {
                          setCandidaturesAddMenuOpen(false);
                          setAddManualModalOpen(true);
                        }}
                      >
                        Hors app
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>
          {usage && usage.adaptations_used === 0 && (
            <div className="zero-adapt-banner zero-adapt-banner--compact" role="status">
              <span>Tes candidatures apparaîtront ici après une adaptation. Commence par coller une offre sur </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="zero-adapt-banner-link"
                onClick={() => navigate('/app/cv')}
                data-attr="candidatures-banner-cta-adapt"
                data-track="cta"
                data-zone="banner"
                data-level="secondary"
              >
                Adapter un CV
              </Button>
              <span>.</span>
            </div>
          )}
          <div className="page-content applications-full candidatures-page" data-section="candidatures" data-analytics-section="candidatures_board">
            <div className="candidatures-page-inner">
              {candidaturesError && (
                <div
                  className="candidatures-error"
                  role="alert"
                  aria-live="assertive"
                >
                  <span className="candidatures-error-msg">{candidaturesError}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="candidatures-error-dismiss"
                    onClick={() => setCandidaturesError('')}
                    aria-label="Fermer l’erreur"
                  >
                    Fermer
                  </Button>
                </div>
              )}
              <div className="candidatures-toolbar" data-section="candidatures-toolbar">
                <div
                  className="candidatures-metrics candidatures-metrics--compact"
                  data-section="candidatures-stats"
                  data-analytics-section="candidatures_stats"
                  role="group"
                  aria-label="Indicateurs candidatures"
                >
                  <Button
                    type="button"
                    variant={candidaturesMetricFilter === 'relancer' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={`candidatures-metric-chip${applicationStats.toFollowUp > 0 ? ' candidatures-metric-chip--alert' : ''}`}
                    aria-pressed={candidaturesMetricFilter === 'relancer'}
                    title="À postuler ou envoyée depuis 14 jours ou plus — clic pour filtrer"
                    onClick={() => setCandidaturesMetricFilter((f) => (f === 'relancer' ? null : 'relancer'))}
                  >
                    <span className="candidatures-metric-chip-label">À relancer</span>
                    <span className="candidatures-metric-chip-value">{applicationStats.toFollowUp}</span>
                  </Button>
                  <div
                    className="candidatures-metric-chip candidatures-metric-chip--static"
                    title="Part des candidatures envoyées ayant reçu une réponse (réponse, entretien, offre ou refus)"
                  >
                    <span className="candidatures-metric-chip-label">Taux de réponse</span>
                    <span className="candidatures-metric-chip-value">
                      {applicationStats.responseRatePct == null ? '—' : `${applicationStats.responseRatePct}%`}
                    </span>
                  </div>
                  <div
                    className="candidatures-metric-chip candidatures-metric-chip--static"
                    title="Moyenne des jours entre envoi et première réponse employeur (nécessite date_reponse)"
                  >
                    <span className="candidatures-metric-chip-label">Délai moyen</span>
                    <span className="candidatures-metric-chip-value">
                      {applicationStats.avgResponseDays == null
                        ? '—'
                        : `${applicationStats.avgResponseDays} j`}
                    </span>
                  </div>
                  <span className="candidatures-metric-total" title="Candidatures non archivées">
                    {applicationStats.total} candidature{applicationStats.total !== 1 ? 's' : ''}
                  </span>
                  {candidaturesMetricFilter === 'relancer' && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="candidatures-metric-clear"
                      onClick={() => setCandidaturesMetricFilter(null)}
                    >
                      Afficher tout
                    </Button>
                  )}
                </div>
                <div className="candidatures-controls" data-section="candidatures-controls">
                  <label className="applications-toggle">
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Afficher les archivées
                  </label>
                  <div className="applications-search-wrap">
                    <input
                      type="search"
                      className="applications-search"
                      placeholder="Rechercher par poste, entreprise, source, date…"
                      value={applicationSearchQuery}
                      onChange={(e) => setApplicationSearchQuery(e.target.value)}
                      aria-label="Filtrer les candidatures"
                      data-attr="candidatures-controls-input-search"
                      data-track="input"
                      data-zone="controls"
                      data-level="tertiary"
                    />
                    {applicationSearchDebounced && (
                      <span className="applications-search-count">
                        {filteredNonArchivedCount} résultat{filteredNonArchivedCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="candidatures-board">
                <div className="kanban-board" data-section="candidatures-board-desktop" aria-label="Tableau kanban des candidatures">
                  {KANBAN_COLUMNS.map((col) => {
                    const columnApps = filteredApplications.filter((app) => {
                      if (app.archived) return false;
                      const s = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                      return s === col.id;
                    });
                    return (
                      <div
                        key={col.id}
                        className={`kanban-column kanban-column--${col.id} ${kanbanDragOverColumn === col.id ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setKanbanDragOverColumn(col.id); }}
                        onDragLeave={() => setKanbanDragOverColumn(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setKanbanDragOverColumn(null);
                          const appId = e.dataTransfer.getData('application/id');
                          const app = applications.find((a) => a.id === appId);
                          if (app) handleKanbanDrop(col.id, app);
                        }}
                      >
                        <div className="kanban-column-header">
                          <span className="kanban-column-title">{col.label}</span>
                          <span className="kanban-column-count">{columnApps.length}</span>
                        </div>
                        <div className="kanban-column-cards">
                          {columnApps.map((app) => (
                            <CandidatureBoardCard
                              key={app.id}
                              app={app}
                              variant="kanban"
                              isDragging={kanbanDraggedId === app.id}
                              justAdded={justAddedAppId === app.id}
                              onView={() => openApplicationDetail(app.id)}
                              onArchive={() => handleArchive(app.id, true)}
                              onDragStart={(e) => {
                                setKanbanDraggedId(app.id);
                                e.dataTransfer.setData('application/id', app.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setKanbanDraggedId(null)}
                            />
                          ))}
                          {columnApps.length === 0 && (
                            <div className="kanban-column-empty" aria-hidden="true">
                              Glisse une carte ici
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="candidatures-list-mobile"
                  data-section="candidatures-list-mobile"
                  data-analytics-section="candidatures_list_mobile"
                  aria-label="Liste des candidatures par statut"
                >
                  {KANBAN_COLUMNS.map((col) => {
                    const sectionApps = filteredApplications.filter((app) => {
                      if (app.archived) return false;
                      const s = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                      return s === col.id;
                    });
                    if (sectionApps.length === 0) return null;
                    return (
                      <section
                        key={col.id}
                        className={`candidatures-list-section candidatures-list-section--${col.id}`}
                        aria-labelledby={`candidatures-list-${col.id}`}
                      >
                        <h3 className="candidatures-list-section-title" id={`candidatures-list-${col.id}`}>
                          <span>{col.label}</span>
                          <span className="candidatures-list-section-count">{sectionApps.length}</span>
                        </h3>
                        <div className="candidatures-list-section-cards">
                          {sectionApps.map((app) => (
                            <CandidatureBoardCard
                              key={app.id}
                              app={app}
                              variant="list"
                              justAdded={justAddedAppId === app.id}
                              onView={() => openApplicationDetail(app.id)}
                              onArchive={() => handleArchive(app.id, true)}
                              onStatutChange={(statut) => handleKanbanDrop(statut, app)}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            {applications.filter((a) => !a.archived).length === 0 && !showArchived && (
              <div className="applications-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
                </svg>
                <h3>Pas encore de candidature</h3>
                <p>Adapte ton CV à une offre d'emploi pour créer ta première candidature.</p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => setSetupModalOpen(true)}
                  data-attr="candidatures-empty-cta-start"
                  data-track="cta"
                  data-zone="empty"
                  data-level="primary"
                >
                  Lancer ma première candidature
                </Button>
              </div>
            )}
            {applicationSearchDebounced && filteredNonArchivedCount === 0 && applications.filter((a) => !a.archived).length > 0 && (
              <div className="applications-empty-state applications-search-empty">
                <p>Aucun résultat pour « {applicationSearchDebounced} ».</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setApplicationSearchQuery('')}
                  data-attr="candidatures-search-empty-cta-clear"
                  data-track="cta"
                  data-zone="empty"
                  data-level="secondary"
                >
                  Effacer la recherche
                </Button>
              </div>
            )}
            {showArchived && filteredArchived.length > 0 && (
              <div className="kanban-archived">
                <h3 className="kanban-archived-title">Archivées</h3>
                <div className="applications-list kanban-archived-list">
                  {filteredArchived.map((app) => {
                    const titre = app.poste || app.poste_offre || 'Sans intitulé';
                    const entreprise = (app.entreprise || '').trim();
                    const statutVal = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                    const dateAbs = formatApplicationDateLabel(app.date);
                    const dateRel = formatApplicationRelativeLabel(app.date);
                    return (
                      <div key={app.id} className="application-card archived">
                        <div className="app-card-top">
                          <CompanyLogo companyName={entreprise || app.entreprise} className="app-company-logo" size={32} />
                          <div className="app-card-text">
                            <div className="app-title">{titre}</div>
                            {entreprise ? <div className="app-meta">{entreprise}</div> : null}
                          </div>
                          <time className="app-date" title={dateAbs || undefined}>{dateRel}</time>
                        </div>
                        <div className="app-actions">
                          <Button type="button" variant="secondary" size="sm" onClick={() => openApplicationDetail(app.id)}>Voir</Button>
                          <select className="app-statut" value={statutVal} onChange={(e) => handleStatutChange(app.id, e.target.value)}>
                            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <Button type="button" variant="tertiary" size="sm" onClick={() => handleArchive(app.id, false)}>Désarchiver</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Popup : Ajouter une candidature hors app */}
        {addManualModalOpen && (
          <div className="application-detail-overlay setup-modal-overlay" onClick={() => setAddManualModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="add-manual-modal-title">
            <div className="setup-modal add-manual-modal" onClick={(e) => e.stopPropagation()}>
              <h2 id="add-manual-modal-title">Ajouter une candidature (hors app)</h2>
              <p className="setup-modal-intro">Tu as postulé ailleurs ? Saisis les infos pour suivre cette candidature dans le tableau.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const poste = addManualPoste.trim();
                const entreprise = addManualEntreprise.trim();
                if (!poste && !entreprise) {
                  showError('Renseigne au moins le poste ou l\'entreprise.');
                  return;
                }
                setAddManualSubmitting(true);
                hideError();
                try {
                  const data = await apiPost('/api/applications', {
                    poste,
                    entreprise,
                    statut: addManualStatut,
                    source_offre: addManualSource.trim() || undefined,
                  });
                  const appId = data.id;
                  for (const { type, file } of [
                    { type: 'lettre', file: addManualPdfLettre },
                    { type: 'cv', file: addManualPdfCv },
                    { type: 'fiche', file: addManualPdfFiche },
                  ]) {
                    if (file && (file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf'))) {
                      const form = new FormData();
                      form.append('type', type);
                      form.append('file', file);
                      await apiPostFormData(`/api/applications/${encodeURIComponent(appId)}/upload-doc`, form);
                    }
                  }
                  loadApplications();
                  setJustAddedAppId(appId);
                  setAddManualModalOpen(false);
                  setAddManualPoste('');
                  setAddManualEntreprise('');
                  setAddManualStatut('candidature_envoyee');
                  setAddManualSource('');
                  setAddManualPdfLettre(null);
                  setAddManualPdfCv(null);
                  setAddManualPdfFiche(null);
                } catch (err) {
                  showError(err.message || 'Impossible d\'ajouter la candidature.');
                } finally {
                  setAddManualSubmitting(false);
                }
              }}>
                <label className="setup-field">
                  <span>Intitulé du poste</span>
                  <input type="text" value={addManualPoste} onChange={(e) => setAddManualPoste(e.target.value)} placeholder="ex. Analyste Risk & Contrôle" />
                </label>
                <label className="setup-field">
                  <span>Entreprise</span>
                  <input type="text" value={addManualEntreprise} onChange={(e) => setAddManualEntreprise(e.target.value)} placeholder="ex. Société Dupont" />
                </label>
                <label className="setup-field">
                  <span>Statut</span>
                  <select value={addManualStatut} onChange={(e) => setAddManualStatut(e.target.value)}>
                    {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="setup-field">
                  <span>Source de l&apos;offre (optionnel)</span>
                  <input type="text" value={addManualSource} onChange={(e) => setAddManualSource(e.target.value)} placeholder="ex. LinkedIn, Indeed…" />
                </label>
                <div className="setup-field setup-field-docs">
                  <span className="setup-field-label">Documents (optionnel)</span>
                  <p className="setup-field-hint">Joins tes PDF pour y accéder depuis le dashboard.</p>
                  <label className="setup-file-label">
                    <span>Lettre de motivation (PDF)</span>
                    <input type="file" accept=".pdf,application/pdf" onChange={(e) => setAddManualPdfLettre(e.target.files?.[0] || null)} />
                    {addManualPdfLettre && <span className="setup-file-name">{addManualPdfLettre.name}</span>}
                  </label>
                  <label className="setup-file-label">
                    <span>CV (PDF)</span>
                    <input type="file" accept=".pdf,application/pdf" onChange={(e) => setAddManualPdfCv(e.target.files?.[0] || null)} />
                    {addManualPdfCv && <span className="setup-file-name">{addManualPdfCv.name}</span>}
                  </label>
                  <label className="setup-file-label">
                    <span>Fiche de poste (PDF)</span>
                    <input type="file" accept=".pdf,application/pdf" onChange={(e) => setAddManualPdfFiche(e.target.files?.[0] || null)} />
                    {addManualPdfFiche && <span className="setup-file-name">{addManualPdfFiche.name}</span>}
                  </label>
                </div>
                <div className="setup-modal-actions">
                  <Button type="submit" variant="primary" disabled={addManualSubmitting} loading={addManualSubmitting}>
                    {addManualSubmitting ? 'Ajout…' : 'Ajouter'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setAddManualModalOpen(false)}>Annuler</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Popup Setup : Nouvelle Candidature */}
        {setupModalOpen && (
          <div className="application-detail-overlay setup-modal-overlay" onClick={() => setSetupModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="setup-modal-title">
            <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
              <h2 id="setup-modal-title">Nouvelle Candidature</h2>
              <p className="setup-modal-intro">Renseigne l&apos;entreprise et la fiche de poste. L&apos;IA adaptera ton CV dans l&apos;espace de travail.</p>
              <label className="setup-field">
                <span>Nom de l&apos;entreprise</span>
                <input type="text" value={setupEntreprise} onChange={(e) => setSetupEntreprise(e.target.value)} placeholder="ex. Société Dupont" />
              </label>
              <label className="setup-field">
                <span>Intitulé du poste (optionnel, améliore le score ATS)</span>
                <input type="text" value={setupPoste} onChange={(e) => setSetupPoste(e.target.value)} placeholder="ex. Analyste Risk & Contrôle" />
              </label>
              <label className="setup-field">
                <span>Lien ou texte de la fiche de poste</span>
                <textarea value={setupFiche} onChange={(e) => setSetupFiche(e.target.value)} placeholder="Colle le lien de l'annonce ou le texte de l'offre…" rows={6} />
              </label>
              <div className="setup-modal-actions">
                <button type="button" className="button button-primary" onClick={async () => {
                  const fiche = setupFiche.trim();
                  const ent = setupEntreprise.trim();
                  const pos = setupPoste.trim();
                  trackEvent('adapt_cta_clicked', {
                    source: 'setup_modal',
                    desc_word_count: fiche.split(/\s+/).filter(Boolean).length,
                  });
                  setSetupModalOpen(false);
                  setSetupEntreprise('');
                  setSetupPoste('');
                  setSetupFiche('');
                  navigate('/app/cv');
                  hideError();
                  resetAdaptationWorkspace();
                  setEntrepriseNom(ent);
                  setPosteNom(pos);
                  setAnnonce(fiche);
                  setAdaptRating(null);
                  openPhase2AfterFirstAdaptRef.current = true;
                  const userPreview = fiche.slice(0, 300) + (fiche.length > 300 ? '…' : '');
                  setChatMessages([{ role: 'user', content: userPreview }]);
                  try {
                    setAdapting(true);
                    const langMeta = await apiPost('/api/adapt-language', {
                      description: fiche,
                      titre: pos || undefined,
                      entreprise: ent || undefined,
                    });
                    if (shouldPromptLanguageChoice(langMeta.cv_language, langMeta.offer_language)) {
                      setAdapting(false);
                      pendingAdaptAfterLanguageRef.current = { type: 'setup', fiche, pos, ent, userPreview };
                      setAdaptLanguageMeta({
                        cvLanguage: langMeta.cv_language,
                        offerLanguage: langMeta.offer_language,
                      });
                      setAdaptLanguageModalOpen(true);
                      return;
                    }
                    await runDirectAdaptFromSetup({
                      fiche,
                      pos,
                      ent,
                      userPreview,
                      outputLanguage: 'cv',
                    });
                  } catch (e) {
                    openPhase2AfterFirstAdaptRef.current = false;
                    if (e.status === 402 || (e.status === 403 && (e.message || '').toLowerCase().includes('plafond')) || (e.message && e.message.includes('épuisé'))) {
                      setUpgradeModalVisible(true);
                    } else {
                      showError(e.message || "Erreur lors de l'adaptation.");
                    }
                    setChatMessages([
                      { role: 'user', content: userPreview },
                      { role: 'assistant', content: 'Erreur : ' + (e.message || '') },
                    ]);
                    setAdapting(false);
                  }
                }} disabled={!setupFiche.trim()}>
                  Démarrer l&apos;adaptation
                </button>
                <button type="button" className="button button-secondary" onClick={() => setSetupModalOpen(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        <div id="viewProfil" className={`view-panel app-page view-profil ${view === 'profil' ? 'active' : ''}`} style={{ display: view === 'profil' ? 'flex' : 'none' }}>
          <header className="page-header">
            <div className="page-title-row">
              <h1 className="page-title">Profil</h1>
              <p className="page-subtitle" title="Ton CV de base. Modifications enregistrées automatiquement.">
                Ton CV de base. Modifications enregistrées automatiquement.
              </p>
            </div>
            {usage && usage.adaptations_used === 0 && (
              <div className="zero-adapt-banner zero-adapt-banner--compact" role="status">
                <span>Pour adapter ton CV à une offre, va sur </span>
                <button type="button" className="zero-adapt-banner-link" onClick={() => navigate('/app/cv')}>Adapter un CV</button>
                <span> et colle l’annonce.</span>
              </div>
            )}
          </header>
          <div className="page-content" data-analytics-section="profil_editor">
            <ProfileView isActive={view === 'profil'} onSaveSuccess={handleProfileSaveSuccess} session={session} refreshKey={profileRefreshKey} usage={usage} onUpgradeClick={handleUpgradeClick} onUsageRefresh={loadUsage} onBillingPortalClick={() => setManageSubscriptionModalOpen(true)} templatesList={templatesList} templateId={templateId} templateOptions={templateOptions} onTemplateIdChange={handleUserPickTemplate} onTemplateOptionsChange={setTemplateOptions} onPhotoSessionExpired={handlePhotoSessionExpired} />
          </div>
        </div>

        <div id="viewSettings" className={`view-panel app-page view-settings ${view === 'settings' ? 'active' : ''}`} style={{ display: view === 'settings' ? 'flex' : 'none' }} data-analytics-section="settings_page">
          <header className="page-header">
            <div className="page-title-row">
              <h1 className="page-title">Paramètres</h1>
              <p className="page-subtitle" title="Compte, export PDF, éditeur et confidentialité.">
                Compte, export PDF, éditeur et confidentialité.
              </p>
            </div>
          </header>
          <div className="page-content">
            <SettingsView
              session={session}
              usage={usage}
              templateId={templateId}
              templatesList={templatesList}
              onUpgradeClick={handleUpgradeClick}
              onBillingPortalClick={() => setManageSubscriptionModalOpen(true)}
              onCookieSettingsClick={() => {
                if (typeof window.axelOpenCookieSettings === 'function') window.axelOpenCookieSettings();
              }}
            />
          </div>
        </div>

        <div id="viewSupport" className={`view-panel app-page view-support ${view === 'support' ? 'active' : ''}`} style={{ display: view === 'support' ? 'flex' : 'none' }} data-analytics-section="support_page">
          <div className="support-hero">
            <h1 className="support-hero-title">Support</h1>
            <p className="support-hero-subtitle">
              On t&apos;aide à tirer le meilleur de AxeL Job. Sujets fréquents ci-dessous, ouvre un ticket pour une réponse par email, ou écris-nous à{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
          <div className="page-content support-page-content">
            <section className="support-usecases">
              <h2 className="support-section-title">Use cases classiques</h2>
              <div className="support-usecase-grid">
                {SUPPORT_TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      className="support-usecase-card support-usecase-card--clickable"
                      onClick={() => navigate(topic.route, { state: { supportHighlight: { route: topic.route, selector: topic.selector, title: topic.bubbleTitle, content: topic.bubbleContent, position: topic.position, ...(topic.openTemplateOptions && { openTemplateOptions: true }) } } })}
                    >
                      <div className="support-usecase-icon-wrap">
                        <Icon className="support-usecase-icon" aria-hidden />
                      </div>
                      <h3 className="support-usecase-title">{topic.title}</h3>
                      <p className="support-usecase-desc">{topic.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>
            <SupportTicketSection />
            {usage?.is_support && <SupportReplySection />}
          </div>
        </div>

        <div
          id="viewMonitoring"
          className={`view-panel app-page view-monitoring ${view === 'monitoring' ? 'active' : ''}`}
          style={{ display: view === 'monitoring' ? 'flex' : 'none' }}
          data-analytics-section="monitoring_dashboard"
        >
          <MonitoringDashboard usage={usage} />
        </div>

        {applicationDetailId && (
          <ApplicationDetailModal
            applicationDetailId={applicationDetailId}
            applications={applications}
            onClose={closeApplicationDetail}
            onPosteUpdated={loadApplications}
            letterGenEnabled={usage?.plan === 'pro' || !!usage?.paywall_disabled}
            onUpgradeClick={handleUpgradeClick}
          />
        )}

        {statutModalType === 'refus' && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }} role="dialog" aria-modal="true">
            <div className="linkedin-sync-modal quali-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Raison du refus (optionnel)</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>Pour ton mémoire / analyse : indique si tu connais la raison du refus.</p>
              {statutModalApp && <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{statutModalApp.entreprise} - {statutModalApp.poste}</p>}
              <label className="input-label">Type de raison</label>
              <select className="input-field" value={refusRaisonType} onChange={(e) => setRefusRaisonType(e.target.value)}>
                <option value="">- Choisir -</option>
                <option value="Profil non retenu">Profil non retenu</option>
                <option value="Poste pourvu">Poste pourvu</option>
                <option value="Pas de réponse après relance">Pas de réponse après relance</option>
                <option value="Autre">Autre</option>
              </select>
              <label className="input-label">Précisions (texte libre)</label>
              <textarea className="input-field" value={refusRaison} onChange={(e) => setRefusRaison(e.target.value)} rows={3} placeholder="Optionnel" />
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={() => submitRefusModal(false)} disabled={statutModalSubmitting}>
                  {statutModalSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="button button-secondary" onClick={() => submitRefusModal(true)} disabled={statutModalSubmitting}>
                  Passer (refus sans détail)
                </button>
                <button type="button" className="button button-secondary" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        <AdaptLanguageChoiceDialog
          open={adaptLanguageModalOpen}
          cvLanguage={adaptLanguageMeta?.cvLanguage}
          offerLanguage={adaptLanguageMeta?.offerLanguage}
          onKeepCv={() => applyAdaptLanguageChoice('cv')}
          onUseOffer={() => applyAdaptLanguageChoice('offer')}
        />

        {upgradeModalVisible && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => setUpgradeModalVisible(false)} role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
            <div className="linkedin-sync-modal upgrade-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="upgrade-modal-title">Crédits gratuits épuisés</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>
                Passe en Pro pour continuer à adapter tes CV sans limite.
              </p>
              <ul style={{ textAlign: 'left', margin: '1rem 0', paddingLeft: '1.25rem', color: 'var(--text)' }}>
                <li>Adaptations IA illimitées</li>
                <li>Suivi de candidatures illimité</li>
                <li>Lettre de motivation ciblée</li>
              </ul>
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={() => { setUpgradeModalVisible(false); handleStartCheckout(); }} disabled={checkoutLoading}>
                  {checkoutLoading ? 'Redirection…' : 'Passer en Pro - 10€/mois'}
                </button>
                <button type="button" className="button button-secondary" onClick={() => setUpgradeModalVisible(false)}>
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        )}

        {proModalVisible && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => setProModalVisible(false)} role="dialog" aria-modal="true">
            <div className="linkedin-sync-modal upgrade-modal pro-details-modal" onClick={(e) => e.stopPropagation()}>
              {usage?.plan === 'pro' ? (
                <>
                  <div className="pro-badge-big">Pro</div>
                  <h3>Tu es abonné Pro</h3>
                  <p className="profile-subtitle" style={{ marginTop: 0 }}>
                    Tu profites de tous les avantages du forfait Pro.
                  </p>
                  <ul className="pro-features-list">
                    <li><span className="pro-check"><HiCheck size={14} strokeWidth={2.5} /></span>Adaptations IA illimitées</li>
                    <li><span className="pro-check"><HiCheck size={14} strokeWidth={2.5} /></span>Suivi de candidatures illimité</li>
                    <li><span className="pro-check"><HiCheck size={14} strokeWidth={2.5} /></span>Lettre de motivation ciblée</li>
                  </ul>
                  <div className="linkedin-sync-actions" style={{ marginTop: '1rem', flexDirection: 'column', gap: '0.5rem' }}>
                    <button type="button" className="button button-secondary" onClick={() => { setProModalVisible(false); handleManageSubscriptionClick(); }} disabled={checkoutLoading}>
                      {checkoutLoading ? 'Redirection…' : 'Gérer mon abonnement / Annuler'}
                    </button>
                    <button type="button" className="button button-ghost" onClick={() => setProModalVisible(false)}>
                      Fermer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Passer en Pro</h3>
                  <p className="profile-subtitle" style={{ marginTop: 0 }}>
                    Débloque tout le potentiel d'AxeL Job pour décrocher le poste idéal.
                  </p>
                  <div className="pro-comparison">
                    <div className="pro-comparison-col">
                      <h4>Gratuit</h4>
                      <ul>
                        <li>3 adaptations IA</li>
                        <li>5 candidatures suivies</li>
                        <li>Tous les templates</li>
                      </ul>
                    </div>
                    <div className="pro-comparison-col pro-comparison-col--pro">
                      <h4>Pro - 10€/mois</h4>
                      <ul>
                        <li><strong>Illimité</strong> - adaptations IA</li>
                        <li><strong>Illimité</strong> - candidatures</li>
                        <li>Lettre de motivation ciblée</li>
                        <li>Tous les templates</li>
                      </ul>
                    </div>
                  </div>
                  <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" className="button button-primary" onClick={() => { setProModalVisible(false); handleStartCheckout(); }} disabled={checkoutLoading}>
                      {checkoutLoading ? 'Redirection…' : 'Passer en Pro - 10€/mois'}
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setProModalVisible(false)}>
                      Plus tard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {signOutConfirmOpen && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => setSignOutConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="signout-confirm-title">
            <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="signout-confirm-title">Déconnexion</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>Tu es sûr de vouloir te déconnecter ?</p>
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={handleSignOut}>Oui, me déconnecter</button>
                <button type="button" className="button button-secondary" onClick={() => setSignOutConfirmOpen(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {firstOfferNudgeOpen && session?.user?.id && usage?.adaptations_used === 0 && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => setFirstOfferNudgeOpen(false)} role="dialog" aria-modal="true" aria-labelledby="first-offer-nudge-title">
            <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="first-offer-nudge-title">Colle une première offre</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>
                C’est l’étape qui adapte ton CV à un poste réel. Va sur « Adapter un CV », colle le texte de l’annonce (ou le lien) dans le champ en bas, puis envoie.
              </p>
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setFirstOfferNudgeOpen(false);
                    navigate('/app/cv');
                    requestAnimationFrame(() => cvChatInputRef.current?.focus());
                    trackEvent('first_offer_nudge_cta', { action: 'go_cv' });
                  }}
                >
                  Coller une offre
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setFirstOfferNudgeOpen(false);
                    try {
                      localStorage.setItem(`cv_bot_first_offer_nudge_dismissed_${session.user.id}`, '1');
                    } catch (_) { /* ignore */ }
                    trackEvent('first_offer_nudge_cta', { action: 'dismiss' });
                  }}
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        )}

        {manageSubscriptionModalOpen && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => setManageSubscriptionModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="manage-sub-title">
            <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="manage-sub-title">Gérer mon abonnement</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>Tu seras redirigé vers le portail de gestion. Si tu envisages d&apos;annuler, peux-tu nous dire pourquoi ? (optionnel)</p>
              <label className="input-label" style={{ display: 'block', marginTop: '0.75rem' }}>Raison</label>
              <select className="input-field" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ width: '100%', marginTop: '0.25rem' }}>
                <option value="">- Choisir -</option>
                <option value="trop_cher">Trop cher</option>
                <option value="pas_utile">Pas utile pour moi</option>
                <option value="autre">Autre</option>
              </select>
              <label className="input-label" style={{ display: 'block', marginTop: '0.75rem' }}>Commentaire (optionnel)</label>
              <textarea className="input-field" value={cancelReasonText} onChange={(e) => setCancelReasonText(e.target.value)} placeholder="Ton avis nous aide à nous améliorer…" rows={2} style={{ width: '100%', marginTop: '0.25rem', resize: 'vertical' }} />
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={handleManageSubscriptionConfirm} disabled={checkoutLoading}>{checkoutLoading ? 'Redirection…' : 'Accéder au portail'}</button>
                <button type="button" className="button button-secondary" onClick={() => setManageSubscriptionModalOpen(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {statutModalType === 'interview' && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }} role="dialog" aria-modal="true">
            <div className="linkedin-sync-modal quali-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Entretien - quelques infos (optionnel)</h3>
              <p className="profile-subtitle" style={{ marginTop: 0 }}>Pour ton mémoire : type d’entretien et ressenti.</p>
              {statutModalApp && <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{statutModalApp.entreprise} - {statutModalApp.poste}</p>}
              <label className="input-label">Type d’entretien</label>
              <select className="input-field" value={interviewType} onChange={(e) => setInterviewType(e.target.value)}>
                <option value="">- Choisir -</option>
                <option value="Téléphone">Téléphone</option>
                <option value="Visio">Visio</option>
                <option value="Présentiel">Présentiel</option>
                <option value="Autre">Autre</option>
              </select>
              <label className="input-label">Comment s’est passé l’entretien ? (texte libre)</label>
              <textarea className="input-field" value={interviewFeedback} onChange={(e) => setInterviewFeedback(e.target.value)} rows={3} placeholder="Optionnel" />
              <label className="input-label">Date de l’entretien (optionnel)</label>
              <input type="date" className="input-field" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={submitInterviewModal} disabled={statutModalSubmitting}>
                  {statutModalSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="button button-secondary" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {session && onboardingChecked && !needsOnboarding && isCvView && (
          <>
            <GuidedTour key={`tour-p1-${guidedTourUid}-${tourRestartKey}-${phase1DismissForAdaptKey}`} steps={TOUR_STEPS_PHASE1} tourKey={tourKeyPhase1} autoOpenDelayMs={0} onStepChange={handleTourStepChange} />
            <GuidedTour
              key={`tour-p2-${guidedTourUid}-${tourRestartKey}`}
              steps={TOUR_STEPS_PHASE2}
              tourKey={tourKeyPhase2}
              enableAutoOpen={false}
              openTrigger={phase2TourOpenTrigger}
              onStepChange={handleTourPhase2StepChange}
            />
          </>
        )}

        {session && location.state?.supportHighlight && (pathname === location.state.supportHighlight.route || pathname.startsWith(location.state.supportHighlight.route + '/')) && (
          <SupportHighlight
            selector={location.state.supportHighlight.selector}
            title={location.state.supportHighlight.title}
            content={location.state.supportHighlight.content}
            position={location.state.supportHighlight.position}
            onClose={() => navigate(pathname, { replace: true, state: {} })}
          />
        )}

        {exportAtsBlockModalOpen && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={closeExportAtsBlockModal} role="dialog" aria-modal="true" aria-labelledby="export-ats-block-title">
            <div className="linkedin-sync-modal export-ats-block-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="export-ats-block-title">Avant l&apos;export</h3>
              {exportAtsBlockModalShowMotsCles ? (
                <>
                  <p className="export-ats-block-lead">
                    Le <strong>bloc mots-clés ATS</strong> est <strong>activé</strong> pour cet export : une section en bas du CV reprend des termes utiles aux logiciels de tri.
                    Le texte est volontairement très discret (couleur proche du fond) : un recruteur qui ouvre le PDF voit surtout le titre de section, pas une liste de mots en évidence.
                  </p>
                  <p className="export-ats-block-muted">
                    Ça peut aider le parsing automatique lorsque les mots correspondent bien à ton profil et à l&apos;annonce. En revanche, certains recruteurs n&apos;aiment pas l&apos;idée d&apos;un bloc « caché » - le risque est faible si les termes restent honnêtes, mais c&apos;est toi qui valides ce compromis avant d&apos;envoyer le CV.
                  </p>
                </>
              ) : (
                <>
                  <p className="export-ats-block-lead">
                    Tu exportes <strong>sans</strong> le bloc dédié « mots-clés ATS » : c&apos;est un choix tout à fait pertinent.
                  </p>
                  <p className="export-ats-block-muted">
                    Beaucoup de candidats s&apos;en passent : intégrer les mots-clés dans le résumé et les expériences suffit souvent pour les ATS modernes. Le bloc séparé n&apos;est pas obligatoire - c&apos;est une option d&apos;optimisation, pas une condition pour un bon CV.
                  </p>
                </>
              )}
              <div className="export-ats-block-toggle-row">
                <div className="tpl-toggle-row-text">
                  <span className="tpl-toggle-row-title">Inclure le bloc mots-clés ATS dans l&apos;export</span>
                  <span className="tpl-toggle-row-hint">Tu peux changer ici sans aller dans les réglages du modèle</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={exportAtsBlockModalShowMotsCles}
                  className={`tpl-toggle${exportAtsBlockModalShowMotsCles ? ' tpl-toggle--on' : ''}`}
                  onClick={() => setExportAtsBlockModalShowMotsCles((v) => !v)}
                >
                  <span className="tpl-toggle-knob" />
                </button>
              </div>
              <fieldset className="export-ats-block-fieldset">
                <legend className="export-ats-block-legend">Cette fenêtre</legend>
                <label className="export-ats-block-radio">
                  <input
                    type="radio"
                    name="export-ats-reminder"
                    checked={exportAtsBlockReminderMode === 'every'}
                    onChange={() => setExportAtsBlockReminderMode('every')}
                  />
                  <span>Me la montrer à chaque export (recommandé pour bien garder le contrôle)</span>
                </label>
                <label className="export-ats-block-radio">
                  <input
                    type="radio"
                    name="export-ats-reminder"
                    checked={exportAtsBlockReminderMode === 'snooze7'}
                    onChange={() => setExportAtsBlockReminderMode('snooze7')}
                  />
                  <span>Ne plus l&apos;afficher pendant 7 jours après validation</span>
                </label>
              </fieldset>
              <div className="linkedin-sync-actions export-ats-block-actions">
                <button type="button" className="button button-primary" onClick={confirmExportAtsBlockModal}>
                  Valider et continuer
                </button>
                <button type="button" className="button button-secondary" onClick={closeExportAtsBlockModal}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {pdfEntrepriseModalOpen && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={closePdfEntrepriseModal} role="dialog" aria-modal="true" aria-labelledby="pdf-entreprise-modal-title">
            <div className="linkedin-sync-modal export-ats-block-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="pdf-entreprise-modal-title">Nom de l&apos;entreprise</h3>
              <p className="export-ats-block-muted" style={{ marginTop: '0.5rem' }}>
                Pour retrouver cette candidature dans ton suivi, un nom d&apos;entreprise clair aide beaucoup.
                Nous ne sommes pas sûrs de l&apos;avoir bien détecté depuis l&apos;annonce : vérifie ou complète ci-dessous (tu peux aussi laisser vide).
              </p>
              <label className="setup-field" style={{ marginTop: '1rem', display: 'block' }}>
                <span>Entreprise</span>
                <input
                  type="text"
                  className="input-field"
                  value={pdfEntrepriseModalValue}
                  onChange={(e) => setPdfEntrepriseModalValue(e.target.value)}
                  placeholder="ex. Société recruteuse"
                  autoFocus
                />
              </label>
              <div className="linkedin-sync-actions export-ats-block-actions" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="button button-primary" onClick={() => void confirmPdfEntrepriseModal()}>
                  Télécharger le PDF
                </button>
                <button type="button" className="button button-secondary" onClick={closePdfEntrepriseModal}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {atsDisclaimerVisible && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => { setAtsDisclaimerVisible(false); setPendingPdfAction(null); pendingExportTemplateOptionsRef.current = null; }} role="dialog" aria-modal="true">
            <div className="linkedin-sync-modal ats-disclaimer-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Information importante</h3>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text)' }}>
                Ce CV a été généré et adapté par une intelligence artificielle.
                Bien que l'outil optimise le contenu pour les filtres ATS (Applicant Tracking Systems),
                <strong> nous ne garantissons pas </strong> que le CV passera tous les filtres automatiques
                de tous les recruteurs.
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--muted)' }}>
                Il est de votre responsabilité de relire et vérifier l'exactitude des informations
                avant tout envoi. AxeL Job ne saurait être tenu responsable d'éventuelles inexactitudes
                ou du résultat de vos candidatures.
              </p>
              <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="button button-primary" onClick={() => {
                  setAtsDisclaimerVisible(false);
                  if (pendingPdfAction === 'pdf') {
                    const o = pendingExportTemplateOptionsRef.current;
                    pendingExportTemplateOptionsRef.current = null;
                    doDownloadPdf(o ?? undefined);
                  }
                  setPendingPdfAction(null);
                }}>
                  J'ai compris, télécharger
                </button>
                <button type="button" className="button button-secondary" onClick={() => { setAtsDisclaimerVisible(false); setPendingPdfAction(null); pendingExportTemplateOptionsRef.current = null; }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </Suspense>
  );
}
