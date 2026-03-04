import { useState, useRef, useEffect } from 'react';
import {
  apiGet,
  apiPost,
  apiPatch,
  apiPostBlob,
  apiGetBlob,
  setAuthToken,
  setUnauthorizedCallback,
} from './api';
import { supabase } from './lib/supabase';
import ProfileView from './components/ProfileView';
import AuthForm from './components/AuthForm';
import './App.css';

const STORAGE_EXPORT_DIR = 'cv_bot_last_export_dir';
const STATUT_LABELS = {
  candidature_envoyee: 'Candidature envoyée',
  reponse_recue: 'Réponse reçue',
  interview: 'Interview',
  refus: 'Refus',
};

function getExportFolderName(entreprise, poste) {
  const sanitize = (s) => (s || '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const ent = sanitize(entreprise);
  const pos = sanitize(poste) || 'Sans intitulé';
  return ent ? ent + ' - ' + pos : pos;
}

/** URL logo entreprise (Clearbit, open source). Fallback: pas d’image. */
function getCompanyLogoUrl(companyName) {
  if (!companyName || typeof companyName !== 'string') return null;
  try {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const path = `/api/company-logo?company=${encodeURIComponent(companyName.trim())}`;
    return base ? `${base}${path}` : path;
  } catch {
    return null;
  }
}

/** Affiche le logo entreprise ou l’initiale (style app bancaire). */
function CompanyLogo({ companyName, className, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const url = getCompanyLogoUrl(companyName);
  const initial = (companyName || '?').trim().charAt(0).toUpperCase();
  if (failed || !url) {
    return (
      <div className={`company-logo-fallback ${className || ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={className}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export default function App() {
  const [view, setView] = useState('cv');
  const [annonce, setAnnonce] = useState('');
  const [lastAdaptedCv, setLastAdaptedCv] = useState(null);
  const [lastBaseCv, setLastBaseCv] = useState(null);
  const [lastAdaptationId, setLastAdaptationId] = useState(null);
  const [previewVariant, setPreviewVariant] = useState('modified');
  const [originalPreviewHtml, setOriginalPreviewHtml] = useState('');
  const [modifiedPreviewHtml, setModifiedPreviewHtml] = useState('');
  const [rapport, setRapport] = useState(null);
  const [error, setError] = useState('');
  const [exportBlockVisible, setExportBlockVisible] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [entrepriseNom, setEntrepriseNom] = useState('');
  const [posteNom, setPosteNom] = useState('');
  const [exportDossierPath, setExportDossierPath] = useState('');
  const [applications, setApplications] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [applicationDetailId, setApplicationDetailId] = useState(null);
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('cv');
  const [detailCvHtml, setDetailCvHtml] = useState('');
  const [detailLetterHtml, setDetailLetterHtml] = useState('');
  const [detailLetterLoading, setDetailLetterLoading] = useState(false);
  const [detailDownloading, setDetailDownloading] = useState(null);
  const iframeRef = useRef(null);
  const exportDirHandleRef = useRef(null);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null);
    });
    return () => subscription?.unsubscribe();
  }, []);

  const setPreviewHtml = (html) => {
    if (iframeRef.current) iframeRef.current.srcdoc = html;
  };

  const showError = (msg) => {
    setError(msg);
    setRapport(null);
  };
  const hideError = () => setError('');

  const loadInitialPreview = async () => {
    try {
      const html = await apiGet('/api/cv/preview');
      setPreviewHtml(html);
    } catch (e) {
      showError('Impossible de charger le CV. ' + (e.message || e));
    }
  };

  const loadApplications = async () => {
    try {
      const list = await apiGet('/api/applications' + (showArchived ? '?archived=1' : ''));
      setApplications(list);
    } catch {
      setApplications([]);
    }
  };

  useEffect(() => {
    if (supabase && !session) return;
    loadInitialPreview();
  }, [session?.user?.id]);

  useEffect(() => {
    if (supabase && !session) return;
    if (view !== 'cv') return;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on veut la valeur courante de lastAdaptedCv au retour sur l’onglet CV, pas une re-exécution à chaque changement de référence
    if (lastAdaptedCv) {
      apiPost('/api/render-html', { cv: lastAdaptedCv, highlight_changes: false })
        .then((html) => { setPreviewHtml(html); setModifiedPreviewHtml(html); })
        .catch(() => loadInitialPreview());
    } else {
      loadInitialPreview();
    }
    // Ne pas mettre lastAdaptedCv en dépendance : au retour sur l’onglet CV on affiche
    // la dernière version adaptée (valeur à l’exécution), sans recharger le CV de base.
  }, [view, session?.user?.id]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_EXPORT_DIR);
    if (saved) setExportDossierPath(saved);
    else {
      apiGet('/api/export-default-dir').then((data) => {
        if (data.path) setExportDossierPath((p) => p || data.path);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (supabase && !session) return;
    loadApplications();
  }, [showArchived, session?.user?.id]);

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
    apiPost('/api/render-html', { cv: fullCv })
      .then((html) => setDetailCvHtml(html))
      .catch(() => setDetailCvHtml('<p>Erreur chargement aperçu CV.</p>'));
  }, [applicationDetail, detailTab]);

  useEffect(() => {
    if (!applicationDetailId || !applicationDetail || detailTab !== 'lettre') return;
    if (detailLetterHtml) return;
    setDetailLetterLoading(true);
    apiPost(`/api/applications/${encodeURIComponent(applicationDetailId)}/generate-letter`)
      .catch(() => ({}))
      .then((data) => {
        if (data && data.lettre_html) setDetailLetterHtml(data.lettre_html);
        else setDetailLetterHtml('<p>Lettre non disponible.</p>');
      })
      .finally(() => setDetailLetterLoading(false));
  }, [applicationDetailId, applicationDetail, detailTab, detailLetterHtml]);


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

  const handleAdapt = async () => {
    const description = annonce.trim();
    if (!description) {
      showError("Colle d'abord l'annonce dans la zone de texte.");
      return;
    }
    hideError();
    setAdapting(true);
    try {
      const data = await apiPost('/api/adapt', { description });
      setLastAdaptedCv(data.cv);
      setLastAdaptationId(data.adaptation_id || null);
      setRapport(data.rapport || {});
      setExportBlockVisible(true);
      setPreviewVariant('modified');
      loadApplications();

      let baseCv = null;
      try {
        baseCv = await apiGet('/api/cv');
      } catch {}
      if (baseCv) {
        setLastBaseCv(baseCv);
        setOriginalPreviewHtml('');
      }
      const html = await apiPost('/api/render-html', {
        cv: data.cv,
        base_cv: baseCv,
        highlight_changes: true,
      });
      setPreviewHtml(html);
      setModifiedPreviewHtml(html);
    } catch (e) {
      showError(e.message || "Erreur lors de l'adaptation.");
    } finally {
      setAdapting(false);
    }
  };

  const onPreviewVariantChange = (v) => {
    setPreviewVariant(v);
    if (v === 'original') {
      if (originalPreviewHtml) setPreviewHtml(originalPreviewHtml);
      else if (lastBaseCv) {
        apiPost('/api/render-html', { cv: lastBaseCv })
          .then((html) => {
            setOriginalPreviewHtml(html);
            setPreviewHtml(html);
          })
          .catch(() => {});
      }
    } else if (modifiedPreviewHtml) {
      setPreviewHtml(modifiedPreviewHtml);
    }
  };

  const handlePdf = async () => {
    if (!lastAdaptedCv) return;
    try {
      const blob = await apiPostBlob('/api/pdf', {
        cv: lastAdaptedCv,
        titre: posteNom || undefined,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = blob.type === 'application/pdf' ? 'CV.pdf' : 'CV.pdf';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showError('Téléchargement PDF : ' + (e.message || e));
    }
  };

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
      const hasPickedHandle = exportDirHandleRef.current != null;
      const usePicker = (hasPickedHandle || (!exportDossierPath.trim() && typeof showDirectoryPicker === 'function'));
      if (usePicker) {
        const rootHandle = exportDirHandleRef.current ?? (await showDirectoryPicker());
        const folderName = getExportFolderName(entrepriseNom, posteNom);
        const subDir = await rootHandle.getDirectoryHandle(folderName, { create: true });
        const blob = await apiPostBlob('/api/export-dossier-zip', {
          cv: lastAdaptedCv,
          titre: posteNom,
          entreprise: entrepriseNom,
          description: annonce,
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
        exportDirHandleRef.current = null;
      } else {
        const data = await apiPost('/api/export-dossier', {
          cv: lastAdaptedCv,
          titre: posteNom,
          entreprise: entrepriseNom,
          description: annonce,
          dossier: exportDossierPath.trim() || undefined,
        });
        if (exportDossierPath.trim()) localStorage.setItem(STORAGE_EXPORT_DIR, exportDossierPath.trim());
        setRapport({ ...rapport, folder: data.folder, files: data.files || [] });
        await updateAppMeta();
      }
    } catch (e) {
      showError('Export dossier : ' + (e.message || e));
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

  const handleStatutChange = async (id, statut) => {
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(id)}`, { statut });
      loadApplications();
    } catch {}
  };

  const handleArchive = async (id, isArchived) => {
    try {
      await apiPatch(`/api/applications/${encodeURIComponent(id)}`, { archived: isArchived });
      loadApplications();
    } catch {}
  };

  const isCvView = view === 'cv';

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const handleProfileSaveSuccess = () => {
    if (!lastAdaptedCv) loadInitialPreview();
  };

  const applicationStats = (() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    let countToday = 0, countYesterday = 0, countMonth = 0, countLastMonth = 0;
    applications.forEach((app) => {
      const d = (app.date || '').trim().split(/\s+/)[0];
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (d === today) countToday++;
      if (d === yesterdayStr) countYesterday++;
      if (d.startsWith(thisMonth)) countMonth++;
      if (d.startsWith(lastMonth)) countLastMonth++;
    });
    const total = applications.length;
    const todayPct = countYesterday > 0 ? Math.round(((countToday - countYesterday) / countYesterday) * 100) : (countToday > 0 ? 100 : 0);
    const monthPct = countLastMonth > 0 ? Math.round(((countMonth - countLastMonth) / countLastMonth) * 100) : (countMonth > 0 ? 100 : 0);
    return { countToday, countMonth, total, todayPct, monthPct };
  })();

  /* Mode full Supabase : sans config Supabase, on n'affiche que l'écran de configuration */
  if (!supabase) {
    return (
      <div className="login-screen">
        <div className="login-screen-card">
          <img src="/favicon.ico" alt="CV Bot" className="login-screen-logo" onError={(e) => { e.target.onerror = null; e.target.src = '/Axel_CV.ico'; }} />
          <h1>CV Bot</h1>
          <p className="login-screen-intro">
            Configure Supabase pour utiliser l'application. Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env</code> (voir <code>.env.example</code>).
          </p>
        </div>
      </div>
    );
  }

  /* Non connecté : écran de connexion uniquement */
  if (!authLoading && !session) {
    return (
      <div className="login-screen">
        <div className="login-screen-card">
          <img src="/favicon.ico" alt="CV Bot" className="login-screen-logo" onError={(e) => { e.target.onerror = null; e.target.src = '/Axel_CV.ico'; }} />
          <h1>CV Bot</h1>
          <p className="login-screen-intro">Connecte-toi pour adapter ton CV et gérer tes candidatures.</p>
          <AuthForm onSuccess={() => setAuthLoading(false)} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src="/favicon.ico" alt="CV Bot" className="sidebar-logo" onError={(e) => { e.target.onerror = null; e.target.src = '/Axel_CV.ico'; }} />
        </div>
        <span className="sidebar-section-label">Principal</span>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-link ${isCvView ? 'active' : ''}`}
            onClick={() => setView('cv')}
            aria-current={isCvView ? 'page' : null}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
            </svg>
            <span>Adapter le CV</span>
          </button>
          <button
            type="button"
            className={`sidebar-link ${view === 'candidatures' ? 'active' : ''}`}
            onClick={() => setView('candidatures')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Postulé</span>
          </button>
          <button
            type="button"
            className={`sidebar-link ${view === 'profil' ? 'active' : ''}`}
            onClick={() => setView('profil')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Profil</span>
          </button>
          <button
            type="button"
            className={`sidebar-link ${view === 'linkedin' ? 'active' : ''}`}
            onClick={() => setView('linkedin')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            <span>Connexion LinkedIn</span>
          </button>
        </nav>
        {supabase && (
          <div className="sidebar-auth">
            <span className="sidebar-section-label">Compte</span>
            {authLoading ? (
              <span className="sidebar-auth-loading">Chargement…</span>
            ) : session ? (
              <div className="sidebar-auth-user">
                <span className="sidebar-auth-email" title={session.user?.email}>{session.user?.email?.split('@')[0] || 'Compte'}</span>
                <button type="button" className="btn btn-signout" onClick={handleSignOut}>Déconnexion</button>
              </div>
            ) : (
              <AuthForm onSuccess={() => setAuthLoading(false)} />
            )}
          </div>
        )}
      </aside>

      <header className="mobile-header">
        <button type="button" className="mobile-menu-btn" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <img src="/favicon.ico" alt="CV Bot" className="sidebar-logo mobile-logo" onError={(e) => { e.target.onerror = null; e.target.src = '/Axel_CV.ico'; }} />
      </header>

      <div className="app-main">
        <div id="viewCv" className={`view-panel ${isCvView ? 'active' : ''}`} style={{ display: isCvView ? 'flex' : 'none' }}>
          <main className="app-content">
            <div className="preview-pane">
              <h2>Aperçu du CV</h2>
              {lastBaseCv && lastAdaptedCv && (
                <div className="preview-variant-slider">
                  <span className={previewVariant === 'original' ? 'active' : ''}>Original</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="1"
                    value={previewVariant === 'original' ? 0 : 1}
                    onChange={(e) => onPreviewVariantChange(e.target.value === '0' ? 'original' : 'modified')}
                    aria-label="Afficher l’original ou le CV modifié"
                  />
                  <span className={previewVariant === 'modified' ? 'active' : ''}>Modifié</span>
                </div>
              )}
              <div className="preview-wrap">
                <iframe ref={iframeRef} title="Aperçu du CV" />
              </div>
            </div>
            <div className="side-pane">
              <h2>Annonce du poste</h2>
              <div className="section">
                <textarea
                  value={annonce}
                  onChange={(e) => setAnnonce(e.target.value)}
                  placeholder="Colle ici le texte complet de l'annonce (description du poste, missions, compétences requises…). Le CV sera adapté aux mots-clés de l'annonce."
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '0.75rem' }}
                  onClick={handleAdapt}
                  disabled={adapting}
                >
                  {adapting ? 'Adaptation en cours…' : 'Adapter le CV avec Gemini'}
                </button>
                {rapport && (
                  <div className="rapport">
                    <h3>Rapport d'adaptation</h3>
                    {rapport.folder != null ? (
                      <>
                        <p className="score">Dossier créé : {rapport.folder}</p>
                        <p>Fichiers : {(rapport.files || []).join(', ')}</p>
                      </>
                    ) : (
                      <>
                        <p className="score">Score de pertinence : {rapport.score_global != null ? rapport.score_global : '-'}/10</p>
                        <p>Zones modifiées : {(rapport.zones_a_adapter || []).join(', ') || 'aucune'}</p>
                        {(rapport.mots_cles_manquants || []).length > 0 && (
                          <p>Mots-clés intégrés : {(rapport.mots_cles_manquants || []).slice(0, 10).join(', ')}{(rapport.mots_cles_manquants || []).length > 10 ? '…' : ''}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {error && <div className="error">{error}</div>}
                {exportBlockVisible && (
                  <div style={{ marginTop: '1rem' }}>
                    <label className="input-label">Entreprise</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="ex. Edmond de Rothschild"
                      value={entrepriseNom}
                      onChange={(e) => setEntrepriseNom(e.target.value)}
                    />
                    <label className="input-label">Intitulé du poste</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="ex. Alternance Risk Manager"
                      value={posteNom}
                      onChange={(e) => setPosteNom(e.target.value)}
                    />
                    <label className="input-label">Dossier d'export (sous-dossier Entreprise - Poste)</label>
                    <div className="export-path-row">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="ex. D:\ESSEC\03. ALTERNANCE"
                        value={exportDossierPath}
                        onChange={(e) => setExportDossierPath(e.target.value)}
                      />
                      <button type="button" className="btn" onClick={handleBrowseExportDir}>Parcourir…</button>
                    </div>
                    <button type="button" className="btn btn-success" style={{ marginRight: '0.5rem' }} onClick={handlePdf}>
                      Exporter le CV en PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ marginTop: '0.35rem' }}
                      onClick={handleExportDossier}
                      disabled={exporting}
                    >
                      {exporting ? 'Création du dossier en cours…' : 'Exporter le dossier (CV + lettre + fiche de poste)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        <div id="viewCandidatures" className={`view-panel view-candidatures ${view === 'candidatures' ? 'active' : ''}`} style={{ display: view === 'candidatures' ? 'flex' : 'none' }}>
          <div className="applications-full">
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--muted)' }}>Mes candidatures</h2>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: 'var(--text)' }}>Suivi des postes auxquels tu as postulé.</p>
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
            <div className="applications-list">
                {applications.length === 0 && (
                  <p className="applications-empty">Aucune candidature. Adapte une annonce pour l'ajouter ici.</p>
                )}
                {applications.map((app) => {
                  const titre = app.poste || app.poste_offre || 'Sans intitulé';
                  const sousTitre = [app.entreprise, app.description_preview ? app.description_preview.slice(0, 60) + '…' : ''].filter(Boolean).join(' · ');
                  const statutVal = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
                  return (
                    <div key={app.id} className={`application-card ${app.archived ? 'archived' : ''}`}>
                      <div className="app-card-top">
                        <CompanyLogo companyName={app.entreprise} className="app-company-logo" size={40} />
                        <div className="app-poste-date">
                          <div className="app-title">{titre}</div>
                          <div className="app-date">{app.date}</div>
                        </div>
                      </div>
                      {sousTitre && <div className="app-meta">{sousTitre}</div>}
                      <div className="app-actions">
                        <button
                          type="button"
                          className="btn btn-view"
                          onClick={() => openApplicationDetail(app.id)}
                        >
                          Voir
                        </button>
                        <select
                          className="app-statut"
                          value={statutVal}
                          disabled={app.archived}
                          onChange={(e) => handleStatutChange(app.id, e.target.value)}
                        >
                          {Object.entries(STATUT_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-archive"
                          onClick={() => handleArchive(app.id, app.archived ? false : true)}
                        >
                          {app.archived ? 'Désarchiver' : 'Archiver'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>
        </div>

        <div id="viewProfil" className={`view-panel view-profil ${view === 'profil' ? 'active' : ''}`} style={{ display: view === 'profil' ? 'flex' : 'none' }}>
          <ProfileView onSaveSuccess={handleProfileSaveSuccess} session={session} />
        </div>

        <div id="viewLinkedIn" className={`view-panel view-linkedin ${view === 'linkedin' ? 'active' : ''}`} style={{ display: view === 'linkedin' ? 'flex' : 'none' }}>
          <div className="linkedin-connection-page">
            <h1>Connexion LinkedIn</h1>
            <p className="linkedin-connection-intro">
              Connecte-toi avec LinkedIn pour importer ta photo de profil et synchroniser ton CV avec ton profil (nom, prénom, expérience). Tu pourras ensuite utiliser « Mettre à jour depuis LinkedIn » et « Importer la photo LinkedIn » dans l’onglet Profil.
            </p>
            <AuthForm linkedInOnly onSuccess={() => {}} />
          </div>
        </div>

        {applicationDetail && (
          <div className="application-detail-overlay" onClick={closeApplicationDetail} role="dialog" aria-modal="true">
            <div className="application-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="application-detail-header">
                <CompanyLogo companyName={applicationDetail.entreprise} className="detail-company-logo" size={44} />
                <div className="detail-header-text">
                  <span className="detail-entreprise">{applicationDetail.entreprise || ''}</span>
                  <h3>{applicationDetail.poste || applicationDetail.poste_offre || 'Sans intitulé'}</h3>
                  {(() => { const app = applications.find(a => a.id === applicationDetailId); return app?.date ? <span className="detail-date">{app.date}</span> : null; })()}
                </div>
                <button type="button" className="btn-close-detail" onClick={closeApplicationDetail} aria-label="Fermer">×</button>
              </div>
              <div className="application-detail-tabs">
                <button type="button" className={detailTab === 'cv' ? 'active' : ''} onClick={() => setDetailTab('cv')}>CV</button>
                <button type="button" className={detailTab === 'lettre' ? 'active' : ''} onClick={() => setDetailTab('lettre')}>Lettre</button>
                <button type="button" className={detailTab === 'fiche' ? 'active' : ''} onClick={() => setDetailTab('fiche')}>Fiche de poste</button>
              </div>
              <div className="application-detail-downloads">
                <button type="button" className="btn btn-download" onClick={() => handleDetailDownload('cv')} disabled={!applicationDetail.full_cv || detailDownloading}>
                  {detailDownloading === 'cv' ? '…' : 'Télécharger CV PDF'}
                </button>
                <button type="button" className="btn btn-download" onClick={() => handleDetailDownload('lettre')} disabled={!applicationDetail.full_cv || detailDownloading}>
                  {detailDownloading === 'lettre' ? '…' : 'Télécharger lettre PDF'}
                </button>
                <button type="button" className="btn btn-download" onClick={() => handleDetailDownload('fiche')} disabled={detailDownloading}>
                  {detailDownloading === 'fiche' ? '…' : 'Télécharger fiche PDF'}
                </button>
              </div>
              <div className="application-detail-content">
                {detailTab === 'cv' && (
                  <div className="detail-pane detail-cv">
                    {applicationDetail.full_cv ? (
                      detailCvHtml ? <iframe title="Aperçu CV" srcDoc={detailCvHtml} className="detail-iframe" /> : <p>Chargement de l’aperçu CV…</p>
                    ) : (
                      <p>Aucun CV enregistré pour cette candidature.</p>
                    )}
                  </div>
                )}
                {detailTab === 'lettre' && (
                  <div className="detail-pane detail-lettre">
                    {detailLetterLoading && <p>Génération de la lettre…</p>}
                    {!detailLetterLoading && detailLetterHtml && <div className="letter-html" dangerouslySetInnerHTML={{ __html: detailLetterHtml }} />}
                    {!detailLetterLoading && !detailLetterHtml && <p>Clique sur l’onglet Lettre pour générer la lettre.</p>}
                  </div>
                )}
                {detailTab === 'fiche' && (
                  <div className="detail-pane detail-fiche">
                    <pre className="fiche-text">{(applicationDetail.description_full || '').trim() || 'Aucune fiche enregistrée.'}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
