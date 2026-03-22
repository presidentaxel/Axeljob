import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import DOMPurify from 'dompurify';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  apiGet,
  apiPost,
  apiPatch,
  apiPostBlob,
  apiPostFormData,
  apiGetBlob,
  setAuthToken,
  setUnauthorizedCallback,
  trackEvent,
} from './api';
import { supabase } from './lib/supabase';
import AuthForm from './components/AuthForm';
import AppTopbar from './components/AppTopbar';
import CompanyLogo from './components/CompanyLogo';
import { NotFoundPage } from './components/ErrorPages';
import { CONTACT_EMAIL, STORAGE_EXPORT_DIR, STATUT_LABELS, KANBAN_COLUMNS, getExportFolderName } from './constants';
import { HiDocumentText, HiArrowDownTray, HiClipboardDocumentList, HiPencilSquare, HiChatBubbleLeftRight, HiCheck, HiSwatch } from 'react-icons/hi2';
import { lazyWithChunkReload, clearChunkErrorReloadKey } from './lib/lazyChunkReload';
import { getViewFromPathname } from './lib/appRoutes';
import { syncRobotsMeta } from './lib/seoHead';

const ProfileView = lazyWithChunkReload(() => import('./components/ProfileView'));
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
import './App.css';
import './styles/TemplatePicker.css';
import './styles/GuidedTour.css';
import { formatApplicationDateLabel } from './lib/applicationDates';


/** URL logo entreprise (Clearbit, open source). Fallback: pas d’image. */

/** Affiche le logo entreprise ou l’initiale (style app bancaire). */

const TPL_FONT_SAFE = { 'Plus Jakarta Sans': "'Plus Jakarta Sans', Arial, sans-serif", 'Inter': "'Inter', Arial, sans-serif", 'Georgia': "Georgia, 'Times New Roman', serif" };

/** Évite de rappeler render-html à chaque pas de curseur (réglages template). */
const TEMPLATE_PREVIEW_DEBOUNCE_MS = 150;

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
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading || code.length !== 6}>
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
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
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
          <button type="button" className="btn btn-primary" onClick={handleSave}>Enregistrer les modifications</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

const TOUR_STEPS = [
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

const TOUR_STEP_PREVIEW_AI_HIGHLIGHT = 'preview-ai-highlight';

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
            <button type="button" className="btn btn-secondary support-ticket-another" onClick={sendAnother}>
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
              <button type="submit" className="btn btn-primary support-ticket-submit" disabled={loading}>
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

  const sendAnother = () => { setSuccess(false); };
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
  const isCvView = view === 'cv';
  const [annonce, setAnnonce] = useState('');
  const [lastAdaptedCv, setLastAdaptedCv] = useState(null);
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
  /* sidebar removed - now using topbar layout */
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [loginOtpExpired, setLoginOtpExpired] = useState(false);
  const [applicationDetailId, setApplicationDetailId] = useState(null);
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('cv');
  const [detailCvHtml, setDetailCvHtml] = useState('');
  const [detailLetterHtml, setDetailLetterHtml] = useState('');
  const [detailLetterLoading, setDetailLetterLoading] = useState(false);
  const [detailDownloading, setDetailDownloading] = useState(null);
  const iframeRef = useRef(null);
  const previewWrapRef = useRef(null);
  const exportDirHandleRef = useRef(null);
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
  /** true quand l’API a répondu ; on n’affiche le résultat qu’une fois l’animation à la dernière étape */
  const [apiAdaptDone, setApiAdaptDone] = useState(false);
  const pendingAdaptResultRef = useRef(null);
  const sourceOffreDebounceRef = useRef(null);
  const [kanbanDraggedId, setKanbanDraggedId] = useState(null);
  const [kanbanDragOverColumn, setKanbanDragOverColumn] = useState(null);
  const [atsDisclaimerVisible, setAtsDisclaimerVisible] = useState(false);
  const [pendingPdfAction, setPendingPdfAction] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [cvEditPanelOpen, setCvEditPanelOpen] = useState(false);
  const [atsScoreOpen, setAtsScoreOpen] = useState(false);
  const [adaptRating, setAdaptRating] = useState(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupEntreprise, setSetupEntreprise] = useState('');
  const [setupPoste, setSetupPoste] = useState('');
  const [setupFiche, setSetupFiche] = useState('');
  const [addManualModalOpen, setAddManualModalOpen] = useState(false);
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
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);
  const [mfaChallengeChecked, setMfaChallengeChecked] = useState(false);
  const [templateId, setTemplateId] = useState(() => localStorage.getItem('cv_template_id') || 'classic');
  const [templateOptions, setTemplateOptions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cv_template_options') || '{}'); } catch { return {}; }
  });
  const [templatesList, setTemplatesList] = useState([]);
  const [tourRestartKey, setTourRestartKey] = useState(0);
  const [tourHighlightStepActive, setTourHighlightStepActive] = useState(false);
  const [tourDemoPreviewHtml, setTourDemoPreviewHtml] = useState('');
  const prevTourHighlightRef = useRef(false);

  const handleTourStepChange = useCallback((step) => {
    setTourHighlightStepActive(step?.id === TOUR_STEP_PREVIEW_AI_HIGHLIGHT);
  }, []);

  const handleRestartTour = () => {
    try { localStorage.removeItem('cv_bot_tour_done_main'); } catch (_) {}
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

  // Liste des templates : fetch en app (avec token si session pour avoir les templates perso dans « Mes templates »)
  useEffect(() => {
    if (!pathname.startsWith('/app')) return;
    apiGet('/api/templates')
      .then((data) => setTemplatesList(Array.isArray(data) ? data : []))
      .catch(() => setTemplatesList([]));
  }, [pathname, session]);

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
      apiPatch('/api/cv', { template_id: templateId, template_options: templateOptions }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [session, templateId, templateOptions]);

  const templateParams = { template_id: templateId, template_options: templateOptions };
  const templateKey = templateId + '|' + JSON.stringify(templateOptions);

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

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    setUnauthorizedCallback(() => {
      setAuthToken(null);
      supabase.auth.signOut();
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null);
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
      .catch(() => {});
  }, [session, authLoading, recoveryMode, mfaChallengeChecked]);

  // Check if profile is empty → show onboarding + display name (prénom + nom) ; sync template_id / template_options depuis l’API pour persistance entre sessions
  useEffect(() => {
    if (!session || authLoading) return;
    setUserDisplayName(session.user?.email?.split('@')[0] || 'Compte');
    setOnboardingChecked(false);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        const empty = !data || (typeof data === 'object' && Object.keys(data).length === 0);
        setNeedsOnboarding(empty);
        const prenom = (data?.prenom || '').trim();
        const nom = (data?.nom || '').trim();
        if (prenom || nom) {
          setUserDisplayName([prenom, nom].filter(Boolean).join(' '));
        }
        if (data?.template_id !== undefined && (data.template_id || '').trim()) setTemplateId((data.template_id || '').trim() || 'classic');
        if (data?.template_options !== undefined && typeof data.template_options === 'object') setTemplateOptions(data.template_options || {});
      })
      .catch(() => {
        setNeedsOnboarding(true);
      })
      .finally(() => setOnboardingChecked(true));
  }, [session?.user?.id, session?.user?.email, authLoading]);

  useEffect(() => {
    if (session && view) trackEvent('page_view', { view });
  }, [session, view]);

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
          navigate('/app/cv', { replace: true });
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
        navigate('/app/cv' + search, { replace: true });
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
    const ok =
      pathname === '/app' ||
      pathname === '/app/' ||
      pathname.startsWith('/app/cv') ||
      pathname.startsWith('/app/postule') ||
      pathname.startsWith('/app/profil') ||
      pathname.startsWith('/app/linkedin') ||
      pathname.startsWith('/app/support') ||
      pathname.startsWith('/app/monitoring');
    if (!ok) navigate('/app/cv', { replace: true });
  }, [session, authLoading, pathname, navigate]);

  const setPreviewHtml = (html) => {
    setPreviewHtmlFallback(typeof html === 'string' ? html : '');
    if (!iframeRef.current) return;
    const iframe = iframeRef.current;
    iframe.style.opacity = '0';
    iframe.srcdoc = html;
    const onLoad = () => {
      iframe.style.opacity = '1';
      iframe.removeEventListener('load', onLoad);
      resizeIframeToContent(iframe);
    };
    iframe.addEventListener('load', onLoad);
  };

  // Une seule zone de scroll (.preview-wrap) : l’iframe s’adapte à la hauteur du contenu
  const resizeIframeToContent = (iframe) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.documentElement) return;
      const height = Math.max(
        doc.documentElement.scrollHeight,
        doc.documentElement.offsetHeight,
        doc.body?.scrollHeight ?? 0,
        doc.body?.offsetHeight ?? 0
      );
      if (height > 0) iframe.style.height = `${height}px`;
    } catch (_) { /* cross-origin or not loaded */ }
  };

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

    const immediate = sessionBecameActive || adaptChanged || highlightChanged || baseChanged || selectionChanged;

    const run = () => {
      const tid = templateIdForPreviewRef.current;
      const opts = templateOptionsForPreviewRef.current;
      if (lastAdaptedCv) {
        apiPost('/api/render-html', {
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
          .catch(() => {});
      } else if (!tourHighlightStepActive) {
        loadInitialPreview(tid, opts);
      }
      if (lastBaseCv) {
        apiPost('/api/render-html', { cv: lastBaseCv, template_id: tid, template_options: opts })
          .then((html) => setOriginalPreviewHtml(html))
          .catch(() => {});
      }
    };

    if (immediate) {
      run();
      return;
    }

    const t = setTimeout(run, TEMPLATE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [session?.user?.id, isCvView, templateKey, wantHighlight, lastAdaptedCv, lastBaseCv, lastSelectionA4, tourHighlightStepActive]);

  // Tutoriel : surlignage vert réel (API render-html + highlight_changes), sur le CV adapté ou une démo
  useEffect(() => {
    if (!tourHighlightStepActive || !session || !isCvView) return;
    let cancelled = false;
    const run = async () => {
      try {
        if (lastAdaptedCv && lastBaseCv) {
          const html = await apiPost('/api/render-html', {
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
        if (lastBaseCv && hasProfilMinContent(lastBaseCv)) {
          const adapted = buildTourDemoAdaptedFromBase(lastBaseCv);
          const html = await apiPost('/api/render-html', {
            cv: adapted,
            base_cv: lastBaseCv,
            highlight_changes: true,
            template_id: templateId,
            template_options: templateOptions,
          });
          if (!cancelled) setTourDemoPreviewHtml(html);
          return;
        }
        const html = await apiPost('/api/render-html', {
          cv: TOUR_STATIC_DEMO_ADAPTED_CV,
          base_cv: TOUR_STATIC_DEMO_BASE_CV,
          highlight_changes: true,
          template_id: templateId,
          template_options: templateOptions,
        });
        if (!cancelled) setTourDemoPreviewHtml(html);
      } catch {
        if (!cancelled) setTourDemoPreviewHtml('');
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
        apiPost('/api/render-html', {
          cv: lastAdaptedCv,
          base_cv: lastBaseCv || undefined,
          highlight_changes: !!(lastBaseCv && lastAdaptedCv),
          template_id: templateId,
          template_options: templateOptions,
          selection_a4: lastSelectionA4 || undefined,
        })
          .then((html) => { setModifiedPreviewHtml(html); })
          .catch(() => {});
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
    setAnnonce('');
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
    setError('');
    setCvEditPanelOpen(false);
    setAdaptStepIndex(0);
    setAdapting(false);
    apiGet('/api/cv')
      .then((cv) => {
        if (cv) {
          setLastBaseCv(cv);
          setFreshPreviewPhotoUrl(cv.photo_url ?? null);
        }
      })
      .catch(() => {});
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

  useEffect(() => {
    if (!session) return;
    loadInitialPreview();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    if (view !== 'cv') return;
    // Toujours récupérer le CV (photo URL fraîche pour la preview)
    apiGet('/api/cv').then((cv) => {
      if (cv) {
        setLastBaseCv(cv);
        setFreshPreviewPhotoUrl(cv.photo_url ?? null);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on veut la valeur courante de lastAdaptedCv au retour sur l’onglet CV, pas une re-exécution à chaque changement de référence
    if (lastAdaptedCv) {
      apiPost('/api/render-html', { cv: lastAdaptedCv, highlight_changes: false, selection_a4: lastSelectionA4 || undefined, ...templateParams })
        .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
        .catch(() => loadInitialPreview());
    } else {
      loadInitialPreview();
    }
    // Ne pas mettre lastAdaptedCv en dépendance : au retour sur l’onglet CV on affiche
    // la dernière version adaptée (valeur à l’exécution), sans recharger le CV de base.
  }, [view, session?.user?.id]);

  // Synchroniser template/options depuis le localStorage en passant sur l'onglet CV (au cas où modifié depuis Profil)
  useEffect(() => {
    if (view !== 'cv') return;
    try {
      const tid = localStorage.getItem('cv_template_id');
      const topt = localStorage.getItem('cv_template_options');
      if (tid) setTemplateId(tid);
      if (topt) setTemplateOptions(JSON.parse(topt));
    } catch (_) {}
  }, [view]);

  // Export default dir : uniquement en app et sur la vue CV (pas sur la landing pour alléger le chemin critique)
  useEffect(() => {
    if (!pathname.startsWith('/app') || view !== 'cv') return;
    const saved = localStorage.getItem(STORAGE_EXPORT_DIR);
    if (saved) setExportDossierPath(saved);
    else {
      apiGet('/api/export-default-dir').then((data) => {
        if (data.path) setExportDossierPath((p) => p || data.path);
      }).catch(() => {});
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

  const adaptSteps = [
    'Analyse des mots-clés',
    'Extraction des compétences',
    'Réécriture du résumé',
    'Adaptation des expériences',
    'Optimisation ATS',
    'Finalisation',
  ];

  useEffect(() => {
    if (!adapting) {
      setAdaptStepIndex(0);
      setApiAdaptDone(false);
      pendingAdaptResultRef.current = null;
      return;
    }
    const id = setInterval(() => {
      setAdaptStepIndex((i) => Math.min(i + 1, adaptSteps.length - 1));
    }, 3800);
    return () => clearInterval(id);
  }, [adapting]);

  // Quand l’API a fini et l’animation est sur « Finalisation », on applique le résultat et on arrête
  useEffect(() => {
    if (!apiAdaptDone || adaptStepIndex !== adaptSteps.length - 1 || !adapting) return;
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
      if (pending.modifiedPreviewHtml) setModifiedPreviewHtml(pending.modifiedPreviewHtml);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: pending.summary }]);
      if (pending.baseCv != null) setLastBaseCv(pending.baseCv);
      loadApplications();
      loadUsage();
      pendingAdaptResultRef.current = null;
    }
    setAdapting(false);
  }, [apiAdaptDone, adaptStepIndex, adapting]);

  // Scroll vers la réponse / animation quand on lance un prompt
  useEffect(() => {
    if (adapting || chatMessages.length > 0) {
      const t = requestAnimationFrame(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [adapting, chatMessages.length]);

  useEffect(() => {
    if (!atsScoreOpen) return;
    const close = (e) => {
      if (e.target.closest('.ats-score-bar')) return;
      setAtsScoreOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [atsScoreOpen]);

  // Ajuster l’échelle du preview CV pour tout voir sans scroll horizontal

  useEffect(() => {
    if (supabase && !session) return;
    if (view === 'candidatures') loadApplications();
  }, [view, session?.user?.id]);

  const openApplicationDetail = async (id) => {
    setApplicationDetailId(null);
    setApplicationDetail(null);
    setDetailCvHtml('');
    setDetailLetterHtml('');
    setDetailTab('cv');
    try {
      const payload = await apiGet(`/api/applications/${encodeURIComponent(id)}`);
      setApplicationDetailId(id);
      setApplicationDetail(payload);
      if (payload.lettre_html) setDetailLetterHtml(payload.lettre_html);
    } catch (e) {
      setError(e.message || 'Impossible de charger la candidature.');
    }
  };

  const closeApplicationDetail = () => {
    setApplicationDetailId(null);
    setApplicationDetail(null);
    setDetailCvHtml('');
    setDetailLetterHtml('');
  };

  useEffect(() => {
    if (!applicationDetail || detailTab !== 'cv') return;
    const fullCv = applicationDetail.full_cv;
    if (!fullCv) return;
    apiPost('/api/render-html', { cv: fullCv, ...templateParams })
      .then((html) => setDetailCvHtml(html))
      .catch(() => setDetailCvHtml('<p>Erreur chargement aperçu CV.</p>'));
  }, [applicationDetail, detailTab]);

  const handleGenerateLetter = async () => {
    if (!applicationDetailId) return;
    setDetailLetterLoading(true);
    try {
      const data = await apiPost(`/api/applications/${encodeURIComponent(applicationDetailId)}/generate-letter`);
      if (data && data.lettre_html) {
        setDetailLetterHtml(data.lettre_html);
        setApplicationDetail((prev) => (prev ? { ...prev, lettre_html: data.lettre_html } : null));
      } else {
        setError('Lettre non disponible.');
      }
    } catch (e) {
      setError(e.message || 'Génération lettre impossible.');
    } finally {
      setDetailLetterLoading(false);
    }
  };


  const handleDetailDownload = async (type) => {
    if (!applicationDetailId) return;
    const path = `/api/applications/${encodeURIComponent(applicationDetailId)}/download/${type}`;
    setDetailDownloading(type);
    try {
      const { blob, filename } = await apiGetBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || (type === 'cv' ? 'cv.pdf' : type === 'lettre' ? 'lettre.pdf' : 'fiche.pdf');
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Téléchargement impossible.');
    } finally {
      setDetailDownloading(null);
    }
  };

  const handleChatSend = async () => {
    const text = (chatInput || '').trim();
    if (!text || adapting) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    hideError();
    setAdapting(true);
    try {
      if (!lastAdaptedCv) {
        setAnnonce(text);
        trackEvent('job_description_pasted', { word_count: text.split(/\s+/).length });
        setAdaptRating(null);
        const data = await apiPost('/api/adapt', {
          description: text,
          titre: posteNom || undefined,
          entreprise: entrepriseNom || undefined,
          ...templateParams,
        });
        let baseCv = null;
        try {
          baseCv = await apiGet('/api/cv');
        } catch {}
        const html = await apiPost('/api/render-html', {
          cv: data.cv,
          base_cv: baseCv ?? lastBaseCv ?? undefined,
          highlight_changes: true,
          selection_a4: data.selection_a4 || undefined,
          ...templateParams,
        });
        const summary = data.rapport?.score_global != null
          ? `CV adapté (score ATS : ${data.rapport.score_global}/100). Tu peux affiner en envoyant un autre message ou modifier le texte avant téléchargement.`
          : 'CV adapté à l\'offre. Envoie un message pour affiner ou clique sur « Modifier le CV » pour éditer le texte.';
        setSourceOffreValue('');
        pendingAdaptResultRef.current = {
          cv: data.cv,
          adaptation_id: data.adaptation_id || null,
          selection_a4: data.selection_a4 || null,
          rapport: data.rapport || {},
          rapportBefore: data.rapport_before || null,
          exportBlockVisible: true,
          previewHtml: html,
          modifiedPreviewHtml: html,
          summary,
          baseCv: baseCv ?? lastBaseCv ?? undefined,
        };
        setApiAdaptDone(true);
      } else {
        const data = await apiPost('/api/adapt-refine', { cv: lastAdaptedCv, instruction: text });
        const html = await apiPost('/api/render-html', { cv: data.cv, highlight_changes: false, selection_a4: undefined, ...templateParams });
        pendingAdaptResultRef.current = {
          cv: data.cv,
          adaptation_id: lastAdaptationId,
          selection_a4: null,
          rapport,
          rapportBefore: null,
          exportBlockVisible: exportBlockVisible,
          previewHtml: html,
          modifiedPreviewHtml: html,
          summary: 'Modifications appliquées. Tu peux continuer à affiner ou télécharger le CV.',
          baseCv: lastBaseCv ?? undefined,
        };
        setApiAdaptDone(true);
      }
    } catch (e) {
      setApiAdaptDone(false);
      pendingAdaptResultRef.current = null;
      if (e.status === 402 || (e.message && e.message.includes('épuisé'))) {
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
    apiPost('/api/render-html', { cv: editedCv, highlight_changes: false, selection_a4: lastSelectionA4 || undefined, ...templateParams })
      .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
      .catch(() => {});
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

  const doDownloadPdf = async () => {
    if (!lastAdaptedCv) return;
    try {
      const pdfTemplateOptions = { ...templateOptions, show_mots_cles_ats: templateOptions?.show_mots_cles_ats !== false };
      const blob = await apiPostBlob('/api/pdf', {
        cv: lastAdaptedCv,
        titre: posteNom || undefined,
        selection_a4: lastSelectionA4 || undefined,
        template_id: templateId,
        template_options: pdfTemplateOptions,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'CV.pdf';
      a.click();
      URL.revokeObjectURL(a.href);
      const count = parseInt(localStorage.getItem('pdf_export_count') || '0', 10) + 1;
      localStorage.setItem('pdf_export_count', String(count));
      if (lastAdaptationId) {
        loadApplications().then(() => {
          setJustAddedAppId(lastAdaptationId);
          navigate('/app/postule');
          setTimeout(() => setJustAddedAppId(null), 2800);
        });
      }
    } catch (e) {
      showError('Téléchargement PDF : ' + (e.message || e));
    }
  };

  const handlePdf = () => {
    if (!lastAdaptedCv) return;
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
    if (!iframeRef.current) return;
    if (originalPreviewHtml) {
      iframeRef.current.srcdoc = originalPreviewHtml;
      return;
    }
    if (lastBaseCv) {
      apiPost('/api/render-html', { cv: lastBaseCv, ...templateParams })
        .then((html) => {
          setOriginalPreviewHtml(html);
          if (iframeRef.current) iframeRef.current.srcdoc = html;
        })
        .catch(() => {});
    }
  }, [previewVariant, isCvView, originalPreviewHtml, lastBaseCv]);

  // Quand on switch sur "modified", afficher le HTML modifié dans l'iframe
  useEffect(() => {
    if (!isCvView || previewVariant !== 'modified') return;
    if (!iframeRef.current) return;
    if (tourHighlightStepActive && tourDemoPreviewHtml) {
      iframeRef.current.srcdoc = tourDemoPreviewHtml;
      return;
    }
    if (modifiedPreviewHtml) {
      iframeRef.current.srcdoc = modifiedPreviewHtml;
    }
  }, [previewVariant, isCvView, modifiedPreviewHtml, tourDemoPreviewHtml, tourHighlightStepActive]);

  const handleExportDossier = async () => {
    if (!lastAdaptedCv) return;
    if (!posteNom.trim()) {
      showError("Indiquez l'intitulé du poste.");
      return;
    }
    hideError();
    setExporting(true);

    const updateAppMeta = async () => {
      if (lastAdaptationId) {
        try {
          await apiPatch(`/api/applications/${encodeURIComponent(lastAdaptationId)}`, {
            poste: posteNom,
            entreprise: entrepriseNom,
          });
          loadApplications();
        } catch {}
      }
    };

    try {
      const pickerAvailable = typeof showDirectoryPicker === 'function';
      const usePicker = pickerAvailable;
      if (usePicker) {
        const rootHandle = await showDirectoryPicker();
        const folderName = getExportFolderName(entrepriseNom, posteNom);
        const subDir = await rootHandle.getDirectoryHandle(folderName, { create: true });
        const blob = await apiPostBlob('/api/export-dossier-zip', {
          cv: lastAdaptedCv,
          titre: posteNom,
          entreprise: entrepriseNom,
          description: annonce,
          adaptation_id: lastAdaptationId || undefined,
          selection_a4: lastSelectionA4 || undefined,
          ...templateParams,
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
          titre: posteNom,
          entreprise: entrepriseNom,
          description: annonce,
          dossier: exportDossierPath.trim() || undefined,
          selection_a4: lastSelectionA4 || undefined,
          ...templateParams,
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

  const handleBrowseExportDir = async () => {
    if (typeof showDirectoryPicker !== 'function') {
      setExportDossierPath('');
      return;
    }
    try {
      const handle = await showDirectoryPicker();
      exportDirHandleRef.current = handle;
      setExportDossierPath('');
      setRapport((r) => (r ? { ...r, folder: null, files: null } : null));
    } catch (e) {
      if (e.name !== 'AbortError') setError('Parcourir : ' + (e.message || e));
    }
  };

  const handleStatutChange = async (id, statut, extra = {}) => {
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(id)}`, { statut, ...extra });
      loadApplications();
    } catch {}
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
    } catch (e) {
      setError(e.message || 'Erreur enregistrement');
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
    } catch (e) {
      setError(e.message || 'Erreur enregistrement');
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
    } catch {}
  };

  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [manageSubscriptionModalOpen, setManageSubscriptionModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonText, setCancelReasonText] = useState('');

  const handleSignOut = async () => {
    setSignOutConfirmOpen(false);
    if (supabase) await supabase.auth.signOut();
  };

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

  const filteredApplications = useMemo(() => {
    const q = applicationSearchDebounced.toLowerCase();
    if (!q) return applications;
    return applications.filter((app) => {
      const poste = ((app.poste || app.poste_offre || '') + ' ').toLowerCase();
      const entreprise = ((app.entreprise || '') + ' ').toLowerCase();
      const source = ((app.source_offre || '') + ' ').toLowerCase();
      const date = ((app.date || '') + ' ').toLowerCase();
      return poste.includes(q) || entreprise.includes(q) || source.includes(q) || date.includes(q);
    });
  }, [applications, applicationSearchDebounced]);

  const filteredNonArchivedCount = useMemo(
    () => filteredApplications.filter((a) => !a.archived).length,
    [filteredApplications],
  );
  const filteredArchived = useMemo(
    () => filteredApplications.filter((a) => a.archived),
    [filteredApplications],
  );

  const applicationStats = (() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const statutPostule = new Set(['a_postuler', 'candidature_envoyee', 'reponse_recue']);
    let countToday = 0, countYesterday = 0, countMonth = 0, countLastMonth = 0, total = 0;
    applications.forEach((app) => {
      const statut = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
      if (!statutPostule.has(statut)) return;
      total++;
      const d = (app.date || '').trim().split(/\s+/)[0];
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (d === today) countToday++;
      if (d === yesterdayStr) countYesterday++;
      if (d.startsWith(thisMonth)) countMonth++;
      if (d.startsWith(lastMonth)) countLastMonth++;
    });
    const todayPct = countYesterday > 0 ? Math.round(((countToday - countYesterday) / countYesterday) * 100) : (countToday > 0 ? 100 : 0);
    const monthPct = countLastMonth > 0 ? Math.round(((countMonth - countLastMonth) / countLastMonth) * 100) : (countMonth > 0 ? 100 : 0);
    return { countToday, countMonth, total, todayPct, monthPct };
  })();

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

  /* Non connecté : landing (/) ou login (/login) */
  if (!authLoading && !session) {
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
    const marketing = renderPublicMarketingPage(pathname, navigate);
    if (marketing) return marketing;
    if (pathname === '/') {
      return <Suspense fallback={<div className="landing" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span aria-hidden>Chargement…</span></div>}><LandingPage onCtaClick={() => navigate('/login')} onProClick={() => navigate('/login?plan=pro')} /></Suspense>;
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
      />

      <main className="app-main" id="main-content">
        {needsOnboarding && onboardingChecked && (
          <OnboardingWizard
            session={session}
            onComplete={(target) => {
              setNeedsOnboarding(false);
              setProfileRefreshKey((k) => k + 1);
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
              <button
                type="button"
                className="btn btn-secondary btn-new-adapt-session"
                onClick={requestNewCandidatureWorkspace}
                disabled={adapting}
                title="Vider le chat et l’aperçu pour adapter ton CV à une autre offre (sans supprimer tes candidatures enregistrées)"
              >
                Nouvelle candidature
              </button>
            </div>
            <p className="page-subtitle">Colle une offre d'emploi, l'IA adapte ton CV. Affine par chat, puis exporte en PDF.</p>
          </header>
          {usage && usage.plan === 'free' && usage.adaptations_used >= 2 && (
            <div className="free-plan-banner">
              <span>{usage.adaptations_limit - usage.adaptations_used <= 0 ? 'Tes adaptations gratuites sont épuisées.' : `Il te reste ${usage.adaptations_limit - usage.adaptations_used} adaptation${usage.adaptations_limit - usage.adaptations_used > 1 ? 's' : ''} gratuite${usage.adaptations_limit - usage.adaptations_used > 1 ? 's' : ''}.`}</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleUpgradeClick} disabled={checkoutLoading}>
                {checkoutLoading ? '…' : 'Passer Pro - 10€/mois'}
              </button>
            </div>
          )}
          <div className="cv-chat-layout">
            <div className="cv-chat-area">
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
                    <div className="cv-chat-msg-content">{m.content}</div>
                  </div>
                ))}
                {adapting && (
                  <div className="cv-chat-msg cv-chat-msg--assistant">
                    <div className="cv-chat-msg-content cv-adapt-steps-wrap">
                      <p className="cv-adapt-steps-title">Adaptation du CV en cours…</p>
                      <div className="cv-adapt-steps" role="list" aria-label="Étapes d’adaptation">
                        {adaptSteps.map((label, i) => (
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
                        <div className="cv-adapt-progress-fill" style={{ width: `${((adaptStepIndex + 0.5) / adaptSteps.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatMessagesEndRef} aria-hidden="true" style={{ height: 0 }} />
              </div>
              {error && <div className="error cv-chat-error">{error}</div>}
              <div className="cv-chat-input-bar">
                <textarea
                  className="cv-chat-input"
                  placeholder="Colle une offre d'emploi ou décris ce que tu veux modifier..."
                  value={chatInput}
                  onChange={(e) => {
                    const el = e.target;
                    setChatInput(el.value);
                    requestAnimationFrame(() => {
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
                    });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  rows={1}
                  disabled={adapting}
                />
                <button type="button" className="cv-chat-input-send" onClick={handleChatSend} disabled={adapting || !chatInput.trim()} aria-label="Envoyer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                </button>
              </div>
            </div>
            <div className="cv-chat-preview">
              <div className="cv-tpl-scope" style={{ ['--cv-font-heading']: templateOptions?.font && TPL_FONT_SAFE[templateOptions.font] ? TPL_FONT_SAFE[templateOptions.font] : undefined }}>
                <TemplatePicker
                  templates={templatesList}
                  templateId={templateId}
                  templateOptions={templateOptions}
                  onChangeTemplate={(id) => { setTemplateId(id); setTemplateOptions({}); trackEvent('template_changed', { template_id: id }); }}
                  onChangeOptions={setTemplateOptions}
                  userPlan={usage?.plan}
                  onUpgradeClick={handleUpgradeClick}
                  openOptionsFromSupport={location.state?.supportHighlight?.openTemplateOptions}
                  openModalToTab={new URLSearchParams(location.search || '').get('open') === 'template-perso' ? 'mine' : null}
                  onOpenFromUrlConsumed={() => navigate(location.pathname, { replace: true })}
                  optionsPreviewHtml={previewVariant === 'original' ? (originalPreviewHtml || previewHtmlFallback) : (modifiedPreviewHtml || previewHtmlFallback)}
                  optionsPreviewLoading={false}
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
                {previewVariant === 'modified' && lastAdaptedCv && !(templateId || '').startsWith('custom_') && ['classic', 'minimal', 'modern'].includes((templateId || '').trim()) ? (
                  <CvEditablePreview
                    cv={{
                      ...lastAdaptedCv,
                      photo_url: freshPreviewPhotoUrl !== undefined ? freshPreviewPhotoUrl : lastAdaptedCv.photo_url,
                    }}
                    baseCv={lastBaseCv}
                    templateId={templateId}
                    templateOptions={templateOptions}
                    showPhoto={templateOptions?.show_photo !== false}
                    showMotsClesAts={templateOptions?.show_mots_cles_ats !== false}
                    onPhotoSessionExpired={handlePhotoSessionExpired}
                    previewHtmlWithInlineCss={modifiedPreviewHtml}
                    onChange={(updatedCv) => {
                      setLastAdaptedCv(updatedCv);
                      trackEvent('cv_manually_edited', { adaptation_id: lastAdaptationId });
                      apiPost('/api/render-html', { cv: updatedCv, highlight_changes: false, ...templateParams })
                        .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
                        .catch(() => {});
                    }}
                  />
                ) : (
                  <div className="preview-iframe-wrap">
                    <iframe ref={iframeRef} title="Aperçu du CV" onLoad={(e) => resizeIframeToContent(e.target)} />
                  </div>
                )}
                </div>
              </div>
              {exportBlockVisible && lastAdaptedCv && (
                <div className="cv-chat-export">
                  <input type="text" className="input-field" placeholder="Entreprise" value={entrepriseNom} onChange={(e) => setEntrepriseNom(e.target.value)} />
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
                        apiPatch(`/api/applications/${encodeURIComponent(aid)}`, { source_offre: trimmed }).catch(() => {});
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
                    <div className="ats-score-inline">
                      <button
                        type="button"
                        className="ats-score-trigger"
                        onClick={() => { setAtsScoreOpen((v) => { if (!v) trackEvent('ats_details_opened', { score: rapport?.score_global }); return !v; }); }}
                        aria-expanded={atsScoreOpen}
                        aria-haspopup="dialog"
                      >
                        <span className="ats-score-label">Score ATS</span>
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
                      {atsScoreOpen && (
                        <div className="ats-score-dropdown ats-score-dropdown--export" role="dialog" aria-label="Détails du score ATS">
                          {rapport.detail && (
                            <div className="ats-score-section ats-detail-bars">
                              <strong>Détail du score</strong>
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
                                  <span className="ats-bar-value">{rapport.detail[key] || 0}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(rapport.strengths || []).length > 0 && (
                            <div className="ats-score-section">
                              <strong>Points forts</strong>
                              <ul>
                                {rapport.strengths.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="ats-score-section">
                            <strong>Points d&apos;amélioration</strong>
                            <ul>
                              {(rapport.weaknesses || []).map((w, i) => <li key={i}>{w}</li>)}
                              {(rapport.zones_a_adapter || []).includes('titre') && (
                                <li>Titre professionnel à aligner avec l&apos;offre</li>
                              )}
                              {(rapport.zones_a_adapter || []).includes('resume') && (
                                <li>Résumé / accroche à enrichir avec des mots-clés de l&apos;offre</li>
                              )}
                              {(rapport.mots_cles_manquants || []).length > 5 && (
                                <li>Intégrer davantage de mots-clés de l&apos;offre (ex. : {(rapport.mots_cles_manquants || []).slice(0, 5).join(', ')}…)</li>
                              )}
                              {(rapport.weaknesses || []).length === 0 && (rapport.zones_a_adapter || []).length === 0 && (rapport.mots_cles_manquants || []).length <= 5 && (
                                <li>Aucun point critique, tu peux affiner le style.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="cv-chat-export-btns">
                    <button type="button" className="btn btn-success" onClick={handlePdf} disabled={exporting}>Télécharger le PDF</button>
                    <button type="button" className="btn btn-secondary" onClick={handleExportDossier} disabled={exporting} aria-busy={exporting}>
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
            <div>
              <h1 className="page-title">Mes candidatures</h1>
              <p className="page-subtitle">Suis toutes tes candidatures ici. Glisse les cartes pour changer le statut.</p>
            </div>
            <div className="dashboard-header-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAddManualModalOpen(true)}>
                Ajouter une candidature (hors app)
              </button>
              <button type="button" className="btn btn-primary btn-new-candidature" onClick={() => setSetupModalOpen(true)}>
                Nouvelle Candidature
              </button>
            </div>
          </header>
          <div className="page-content applications-full">
            <div className="applications-stats">
              <div className="stat-card">
                <span className="stat-value">{applicationStats.countToday}</span>
                <span className="stat-label">Aujourd'hui</span>
                {applicationStats.countToday > 0 && (
                  <span className="stat-delta stat-delta-up">↑ +{applicationStats.todayPct}%</span>
                )}
              </div>
              <div className="stat-card">
                <span className="stat-value">{applicationStats.countMonth}</span>
                <span className="stat-label">Ce mois</span>
                {applicationStats.countMonth > 0 && (
                  <span className={`stat-delta ${applicationStats.monthPct >= 0 ? 'stat-delta-up' : 'stat-delta-down'}`}>
                    {applicationStats.monthPct >= 0 ? '↑' : '↓'} {applicationStats.monthPct >= 0 ? '+' : ''}{applicationStats.monthPct}%
                  </span>
                )}
              </div>
              <div className="stat-card">
                <span className="stat-value">{applicationStats.total}</span>
                <span className="stat-label">Total</span>
              </div>
            </div>
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
              />
              {applicationSearchDebounced && (
                <span className="applications-search-count">
                  {filteredNonArchivedCount} résultat{filteredNonArchivedCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="kanban-board">
              {KANBAN_COLUMNS.map((col) => {
                const columnApps = filteredApplications.filter((app) => {
                  if (app.archived) return false;
                  const s = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                  return s === col.id;
                });
                return (
                  <div
                    key={col.id}
                    className={`kanban-column ${kanbanDragOverColumn === col.id ? 'drag-over' : ''}`}
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
                      {columnApps.map((app) => {
                        const titre = app.poste || app.poste_offre || 'Sans intitulé';
                        const sousTitre = [app.entreprise].filter(Boolean).join(' · ');
                        const isDragging = kanbanDraggedId === app.id;
                        return (
                          <div
                            key={app.id}
                            className={`application-card kanban-card ${app.archived ? 'archived' : ''} ${isDragging ? 'dragging' : ''} ${justAddedAppId === app.id ? 'just-added' : ''}`}
                            draggable={!app.archived}
                            onDragStart={(e) => {
                              setKanbanDraggedId(app.id);
                              e.dataTransfer.setData('application/id', app.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setKanbanDraggedId(null)}
                          >
                            <div className="app-card-actions-icons">
                              <button type="button" className="btn btn-icon btn-icon-view" onClick={() => openApplicationDetail(app.id)} title="Voir" aria-label="Voir">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                              <button type="button" className="btn btn-icon btn-icon-archive" onClick={() => handleArchive(app.id, true)} title="Archiver" aria-label="Archiver">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                            <div className={`app-status-dot app-status-dot--${(app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee')}`} title={STATUT_LABELS[app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee']} aria-hidden />
                            <div className="app-card-top">
                              <CompanyLogo companyName={app.entreprise} className="app-company-logo" size={36} />
                              <div className="app-poste-date">
                                <div className="app-title">{titre}</div>
                                <div className="app-date">{formatApplicationDateLabel(app.date)}</div>
                              </div>
                            </div>
                            {sousTitre && <div className="app-meta">{sousTitre}</div>}
                            {(app.pdf_lettre_url || app.pdf_cv_url || app.pdf_fiche_url || app.pdf_cv_stored || app.pdf_fiche_stored || app.pdf_lettre_stored) && (
                              <div className="app-docs-badge" title="Documents PDF joints">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                                <span>PDF</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {applications.filter((a) => !a.archived).length === 0 && !showArchived && (
              <div className="applications-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ marginBottom: '1rem' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
                </svg>
                <h3>Pas encore de candidature</h3>
                <p>Adapte ton CV à une offre d'emploi pour créer ta première candidature.</p>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setSetupModalOpen(true)}>
                  Lancer ma première candidature
                </button>
              </div>
            )}
            {applicationSearchDebounced && filteredNonArchivedCount === 0 && applications.filter((a) => !a.archived).length > 0 && (
              <div className="applications-empty-state applications-search-empty">
                <p>Aucun résultat pour « {applicationSearchDebounced} ».</p>
                <button type="button" className="btn btn-secondary" onClick={() => setApplicationSearchQuery('')}>Effacer la recherche</button>
              </div>
            )}
            {showArchived && filteredArchived.length > 0 && (
              <div className="kanban-archived">
                <h3 className="kanban-archived-title">Archivées</h3>
                <div className="applications-list kanban-archived-list">
                  {filteredArchived.map((app) => {
                    const titre = app.poste || app.poste_offre || 'Sans intitulé';
                    const statutVal = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                    return (
                      <div key={app.id} className="application-card archived">
                        <div className="app-card-top">
                          <CompanyLogo companyName={app.entreprise} className="app-company-logo" size={36} />
                          <div className="app-poste-date">
                            <div className="app-title">{titre}</div>
                            <div className="app-date">{formatApplicationDateLabel(app.date)}</div>
                          </div>
                        </div>
                        <div className="app-actions">
                          <button type="button" className="btn btn-view" onClick={() => openApplicationDetail(app.id)}>Voir</button>
                          <select className="app-statut" value={statutVal} onChange={(e) => handleStatutChange(app.id, e.target.value)}>
                            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button type="button" className="btn btn-archive" onClick={() => handleArchive(app.id, false)}>Désarchiver</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                  <button type="submit" className="btn btn-primary" disabled={addManualSubmitting}>
                    {addManualSubmitting ? 'Ajout…' : 'Ajouter'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setAddManualModalOpen(false)}>Annuler</button>
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
                <button type="button" className="btn btn-primary" onClick={async () => {
                  const fiche = setupFiche.trim();
                  const ent = setupEntreprise.trim();
                  const pos = setupPoste.trim();
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
                  setAdapting(true);
                  const userPreview = fiche.slice(0, 300) + (fiche.length > 300 ? '…' : '');
                  setChatMessages([{ role: 'user', content: userPreview }]);
                  try {
                    const data = await apiPost('/api/adapt', { description: fiche, titre: pos || undefined, entreprise: ent || undefined, ...templateParams });
                    setLastAdaptedCv(data.cv);
                    setLastAdaptationId(data.adaptation_id || null);
                    setLastSelectionA4(data.selection_a4 || null);
                    setRapport(data.rapport || {});
                    setRapportBefore(data.rapport_before || null);
                    setExportBlockVisible(true);
                    setPreviewVariant('modified');
                    loadApplications();
                    loadUsage();
                    let baseCv = null;
                    try { baseCv = await apiGet('/api/cv'); } catch {}
                    if (baseCv) setLastBaseCv(baseCv);
                    const html = await apiPost('/api/render-html', { cv: data.cv, base_cv: baseCv ?? undefined, highlight_changes: true, selection_a4: data.selection_a4 || undefined, ...templateParams });
                    setPreviewHtml(html);
                    setModifiedPreviewHtml(html);
                    const summary = data.rapport?.score_global != null
                      ? `CV adapté (score ${data.rapport.score_global}/100). Tu peux affiner en envoyant un autre message.`
                      : 'CV adapté. Envoie un message pour affiner ou clique sur le texte pour éditer.';
                    setChatMessages([{ role: 'user', content: userPreview }, { role: 'assistant', content: summary }]);
                  } catch (e) {
                    if (e.status === 402 || (e.message && e.message.includes('épuisé'))) {
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
                }} disabled={!setupFiche.trim()}>
                  Démarrer l&apos;adaptation
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSetupModalOpen(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        <div id="viewProfil" className={`view-panel app-page view-profil ${view === 'profil' ? 'active' : ''}`} style={{ display: view === 'profil' ? 'flex' : 'none' }}>
          <header className="page-header">
            <h1 className="page-title">Profil</h1>
            <p className="page-subtitle">Ton CV de base. Modifications enregistrées automatiquement.</p>
          </header>
          <div className="page-content">
            <ProfileView onSaveSuccess={handleProfileSaveSuccess} session={session} refreshKey={profileRefreshKey} usage={usage} onUpgradeClick={handleUpgradeClick} onUsageRefresh={loadUsage} onBillingPortalClick={() => setManageSubscriptionModalOpen(true)} templatesList={templatesList} templateId={templateId} templateOptions={templateOptions} onTemplateIdChange={setTemplateId} onTemplateOptionsChange={setTemplateOptions} onPhotoSessionExpired={handlePhotoSessionExpired} />
          </div>
        </div>

        <div id="viewSupport" className={`view-panel app-page view-support ${view === 'support' ? 'active' : ''}`} style={{ display: view === 'support' ? 'flex' : 'none' }}>
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
        >
          <MonitoringDashboard usage={usage} />
        </div>

        {applicationDetailId && (
          <ApplicationDetailModal
            applicationDetailId={applicationDetailId}
            applications={applications}
            onClose={closeApplicationDetail}
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
                <button type="button" className="btn btn-primary" onClick={() => submitRefusModal(false)} disabled={statutModalSubmitting}>
                  {statutModalSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => submitRefusModal(true)} disabled={statutModalSubmitting}>
                  Passer (refus sans détail)
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

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
                <button type="button" className="btn btn-primary" onClick={() => { setUpgradeModalVisible(false); handleStartCheckout(); }} disabled={checkoutLoading}>
                  {checkoutLoading ? 'Redirection…' : 'Passer en Pro - 10€/mois'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setUpgradeModalVisible(false)}>
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
                    <li><span className="pro-check"><HiCheck size={14} strokeWidth={2.5} /></span>Templates premium</li>
                    <li><span className="pro-check"><HiCheck size={14} strokeWidth={2.5} /></span>Lettre de motivation ciblée</li>
                  </ul>
                  <div className="linkedin-sync-actions" style={{ marginTop: '1rem', flexDirection: 'column', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => { setProModalVisible(false); handleManageSubscriptionClick(); }} disabled={checkoutLoading}>
                      {checkoutLoading ? 'Redirection…' : 'Gérer mon abonnement / Annuler'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setProModalVisible(false)}>
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
                        <li>Templates de base</li>
                      </ul>
                    </div>
                    <div className="pro-comparison-col pro-comparison-col--pro">
                      <h4>Pro - 10€/mois</h4>
                      <ul>
                        <li><strong>Illimité</strong> - adaptations IA</li>
                        <li><strong>Illimité</strong> - candidatures</li>
                        <li>Templates premium</li>
                        <li>Lettre de motivation ciblée</li>
                      </ul>
                    </div>
                  </div>
                  <div className="linkedin-sync-actions" style={{ marginTop: '1rem' }}>
                    <button type="button" className="btn btn-primary" onClick={() => { setProModalVisible(false); handleStartCheckout(); }} disabled={checkoutLoading}>
                      {checkoutLoading ? 'Redirection…' : 'Passer en Pro - 10€/mois'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setProModalVisible(false)}>
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
                <button type="button" className="btn btn-primary" onClick={handleSignOut}>Oui, me déconnecter</button>
                <button type="button" className="btn btn-secondary" onClick={() => setSignOutConfirmOpen(false)}>Annuler</button>
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
                <button type="button" className="btn btn-primary" onClick={handleManageSubscriptionConfirm} disabled={checkoutLoading}>{checkoutLoading ? 'Redirection…' : 'Accéder au portail'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setManageSubscriptionModalOpen(false)}>Annuler</button>
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
                <button type="button" className="btn btn-primary" onClick={submitInterviewModal} disabled={statutModalSubmitting}>
                  {statutModalSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setStatutModalType(null); setStatutModalAppId(null); setStatutModalApp(null); }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {session && !needsOnboarding && isCvView && (
          <GuidedTour key={`tour-${tourRestartKey}`} steps={TOUR_STEPS} tourKey="main" onStepChange={handleTourStepChange} />
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

        {atsDisclaimerVisible && (
          <div className="application-detail-overlay linkedin-sync-overlay" onClick={() => { setAtsDisclaimerVisible(false); setPendingPdfAction(null); }} role="dialog" aria-modal="true">
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
                <button type="button" className="btn btn-primary" onClick={() => {
                  setAtsDisclaimerVisible(false);
                  if (pendingPdfAction === 'pdf') doDownloadPdf();
                  setPendingPdfAction(null);
                }}>
                  J'ai compris, télécharger
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setAtsDisclaimerVisible(false); setPendingPdfAction(null); }}>
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
