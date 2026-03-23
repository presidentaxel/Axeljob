import { useState, useEffect, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { apiGet, apiPut, apiPost, apiPostFile, apiPostBlob, apiUrl } from '../api';
import { supabase } from '../lib/supabase';
import { defaultCv, newExpId, newFormId, newCertId, newProjId } from '../data/cvDefault';
import TemplatePicker from './TemplatePicker';
import ReauthModal from './ReauthModal';
import { applyA4PageFramesToDocument, suppressCvPreviewIframeInnerScroll } from '../lib/cvPreviewA4Pages';
import '../styles/ProfileView.css';
import '../styles/TemplatePicker.css';

/** Retourne un Blob JPEG recadré à partir de l’image et de la zone en pixels (pour react-easy-crop). */
function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponible'));
          return;
        }
        ctx.drawImage(
          image,
          pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
          0, 0, pixelCrop.width, pixelCrop.height
        );
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Échec de l’export'));
        }, 'image/jpeg', 0.9);
      } catch (e) {
        reject(e);
      }
    });
    image.addEventListener('error', () => reject(new Error('Image non chargée')));
    if (imageSrc.startsWith('http')) image.setAttribute('crossOrigin', 'anonymous');
    image.src = imageSrc;
  });
}

const LINKEDIN_SYNC_KEY = 'linkedin_sync_pending';
const LINKEDIN_PHOTO_KEY = 'linkedin_photo_pending';

const AUTO_SAVE_DELAY_MS = 1500;
const LIVE_PREVIEW_DEBOUNCE_MS = 600;

/** Convertit une date stockée (MM/AAAA, AAAA-MM, etc.) en valeur pour input type="month" (AAAA-MM). Pour expériences on utilise du texte libre. */
function toMonthValue(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim();
  const match = s.match(/^(\d{4})-(\d{1,2})$/); // déjà AAAA-MM
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;
  const match2 = s.match(/^(\d{1,2})\/(\d{4})$/); // MM/AAAA
  if (match2) return `${match2[2]}-${match2[1].padStart(2, '0')}`;
  return s;
}

function ProfileCompletion({ cv }) {
  const checks = [
    { label: 'Prénom & nom', ok: !!(cv.prenom?.trim() && cv.nom?.trim()) },
    { label: 'Titre professionnel', ok: !!cv.titre_professionnel?.trim() },
    { label: 'Email', ok: !!cv.email?.trim() },
    { label: 'Au moins 1 expérience', ok: (cv.experiences || []).some(e => e.poste?.trim()) },
    { label: 'Au moins 1 formation', ok: (cv.formations || []).some(f => f.diplome?.trim()) },
    { label: 'Compétences', ok: (cv.competences?.techniques || []).some(c => typeof c === 'string' && c.trim()) },
  ];
  const done = checks.filter(c => c.ok).length;
  const pct = Math.round((done / checks.length) * 100);
  return (
    <div className="profile-completion">
      <div className="profile-completion-bar">
        <div className="profile-completion-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="profile-completion-text">Profil complet à {pct}%</span>
      <div className="profile-completion-checks">
        {checks.map(c => (
          <span key={c.label} className={`profile-check ${c.ok ? 'profile-check--done' : ''}`}>
            {c.ok ? (
              <svg className="profile-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg className="profile-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
            )} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, required, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`profile-section profile-section--collapsible ${open ? 'open' : 'closed'}`}>
      <button type="button" className="profile-section-toggle" onClick={() => setOpen(v => !v)}>
        <span className="profile-section-toggle-text">
          <h2>{title}</h2>
          {required && <span className="profile-required-badge">requis</span>}
        </span>
        <svg className={`profile-chevron ${open ? 'profile-chevron--open' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </section>
  );
}

function isSupabaseSignedPhotoUrl(url) {
  return typeof url === 'string' && url.includes('supabase.co/storage') && url.includes('/object/sign');
}

/** Aperçu texte (import / sync) : ne pas exposer l’URL de la photo. */
function formatScalarPreviewForPrivacy(fieldKey, value, maxLen) {
  if (fieldKey === 'photo_url') {
    const v = String(value ?? '').trim();
    return v ? '(photo)' : '-';
  }
  const s = (value ?? '').toString();
  return s.slice(0, maxLen) + (s.length > maxLen ? '…' : '');
}

export default function ProfileView({ onSaveSuccess, session, refreshKey, usage, onUpgradeClick, onUsageRefresh, onBillingPortalClick, templatesList, templateId: templateIdProp, templateOptions: templateOptionsProp, onTemplateIdChange, onTemplateOptionsChange, onPhotoSessionExpired }) {
  const [cv, setCv] = useState(defaultCv());
  const [localTemplateId, setLocalTemplateId] = useState(() => localStorage.getItem('cv_template_id') || 'classic');
  const [localTemplateOptions, setLocalTemplateOptions] = useState(() => {
    try {
      const stored = localStorage.getItem('cv_template_options');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const templateId = templateIdProp ?? localTemplateId;
  const setTemplateId = onTemplateIdChange ?? ((id) => { setLocalTemplateId(id); localStorage.setItem('cv_template_id', id); });
  const templateOptions = templateOptionsProp ?? localTemplateOptions;
  const setTemplateOptions = onTemplateOptionsChange ?? ((opts) => { setLocalTemplateOptions(opts); localStorage.setItem('cv_template_options', JSON.stringify(opts)); });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [linkedinModalOpen, setLinkedinModalOpen] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinApplyLoading, setLinkedinApplyLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState('');
  const [proposedChanges, setProposedChanges] = useState([]);
  const [selectedChangeIds, setSelectedChangeIds] = useState(new Set());
  const [importPhotoLoading, setImportPhotoLoading] = useState(false);
  const [uploadPhotoLoading, setUploadPhotoLoading] = useState(false);
  const [profilePreviewHtml, setProfilePreviewHtml] = useState('');
  const [profilePreviewLoading, setProfilePreviewLoading] = useState(false);
  const profilePreviewIframeRef = useRef(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMergeParsed, setImportMergeParsed] = useState(null);
  const [importMergeOpen, setImportMergeOpen] = useState(false);
  const [importMergeChoices, setImportMergeChoices] = useState({});
  const [importStepIndex, setImportStepIndex] = useState(0);
  const importStepTimerRef = useRef(null);
  const importFinalisationTimerRef = useRef(null);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [changeEmailNew, setChangeEmailNew] = useState('');
  const [changeEmailPassword, setChangeEmailPassword] = useState('');
  const [changeEmailLoading, setChangeEmailLoading] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [setPasswordNew, setSetPasswordNew] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');
  const [cancelSubModalOpen, setCancelSubModalOpen] = useState(false);
  const [cancelSubLoading, setCancelSubLoading] = useState(false);
  const [mfaFactors, setMfaFactors] = useState({ totp: [], phone: [] });
  const [mfaEnrollOpen, setMfaEnrollOpen] = useState(false);
  const [mfaEnrollQr, setMfaEnrollQr] = useState('');
  const [mfaEnrollFactorId, setMfaEnrollFactorId] = useState('');
  const [mfaEnrollCode, setMfaEnrollCode] = useState('');
  const [mfaEnrollLoading, setMfaEnrollLoading] = useState(false);
  const [mfaEnrollError, setMfaEnrollError] = useState('');
  const [mfaUnenrollLoading, setMfaUnenrollLoading] = useState(null);
  const fileInputRef = useRef(null);
  const importFileRef = useRef(null);
  const skipNextAutoSaveRef = useRef(true);
  const autoSaveTimeoutRef = useRef(null);

  // Données profil : exclusivement depuis Supabase (liées au compte connecté via JWT)
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    skipNextAutoSaveRef.current = true;
    apiGet('/api/cv?profile=1')
      .then((data) => {
        skipNextAutoSaveRef.current = true;
        const merged = { ...defaultCv(), ...data };
        setCv(merged);
        if (data?.template_id != null && onTemplateIdChange) onTemplateIdChange(data.template_id);
        if (data?.template_options != null && typeof data.template_options === 'object' && onTemplateOptionsChange) onTemplateOptionsChange(data.template_options);
      })
      .catch(() => setCv(defaultCv()))
      .finally(() => setLoading(false));
  }, [session?.user?.id, refreshKey]);

  // Charger les facteurs MFA (optionnel, pour la section Compte et sécurité)
  useEffect(() => {
    if (!session || !supabase?.auth?.mfa?.listFactors) return;
    supabase.auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (error) return;
        setMfaFactors({
          totp: (data?.totp || []).filter((f) => f.status === 'verified'),
          phone: (data?.phone || []).filter((f) => f.status === 'verified'),
        });
      })
      .catch(() => {});
  }, [session?.user?.id]);

  // Auto-trigger LinkedIn sync/photo after OAuth redirect
  const linkedinAutoTriggeredRef = useRef(false);

  // Hauteur = document complet : scroll sur .profile-preview-pane-scroll (pas de barre dans l’iframe)
  const resizeProfilePreviewIframe = useCallback((iframe) => {
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) return;
      applyA4PageFramesToDocument(doc);
      const height = Math.max(
        doc.documentElement.scrollHeight,
        doc.documentElement.offsetHeight,
        doc.body?.scrollHeight ?? 0,
        doc.body?.offsetHeight ?? 0
      );
      if (height > 0) {
        iframe.style.height = `${Math.ceil(height)}px`;
        suppressCvPreviewIframeInnerScroll(doc);
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!session?.provider_token || loading || linkedinAutoTriggeredRef.current) return;
    const syncPending = localStorage.getItem(LINKEDIN_SYNC_KEY);
    const photoPending = localStorage.getItem(LINKEDIN_PHOTO_KEY);
    if (syncPending || photoPending) {
      linkedinAutoTriggeredRef.current = true;
      if (syncPending) {
        localStorage.removeItem(LINKEDIN_SYNC_KEY);
        fetchLinkedInWithToken(session.provider_token);
      }
      if (photoPending) {
        localStorage.removeItem(LINKEDIN_PHOTO_KEY);
        handleImportLinkedInPhotoWithToken(session.provider_token);
      }
    }
  }, [session?.provider_token, loading]);

  // Auto-save : sauvegarde automatique après modification (debounce)
  const saveToApi = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      await apiPut('/api/cv', { ...cv, template_id: templateId, template_options: templateOptions });
      setMessage('Sauvegardé');
      setTimeout(() => setMessage(''), 2000);
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }, [cv, templateId, templateOptions]);

  useEffect(() => {
    if (loading) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => saveToApi(), AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [cv, loading]);

  useEffect(() => {
    if (onTemplateIdChange) return;
    localStorage.setItem('cv_template_id', templateId);
  }, [templateId, onTemplateIdChange]);
  useEffect(() => {
    if (onTemplateOptionsChange) return;
    localStorage.setItem('cv_template_options', JSON.stringify(templateOptions));
  }, [templateOptions, onTemplateOptionsChange]);

  // Aperçu = même HTML que le rendu navigateur (render-html), pas le PDF, pour éviter les soucis WeasyPrint sur le profil
  const templateKey = templateId + '|' + JSON.stringify(templateOptions);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setProfilePreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const html = await apiPost('/api/render-html', {
          cv,
          template_id: templateId,
          template_options: templateOptions,
        });
        if (cancelled) return;
        setProfilePreviewHtml(typeof html === 'string' ? html : '');
      } catch {
        if (!cancelled) setProfilePreviewHtml('');
      } finally {
        if (!cancelled) setProfilePreviewLoading(false);
      }
    }, LIVE_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cv, loading, templateKey]);

  // Template / HTML : réappliquer cadres A4 (onLoad parfois insuffisant après changement de srcDoc)
  useEffect(() => {
    if (!profilePreviewHtml) return;
    const iframe = profilePreviewIframeRef.current;
    if (!iframe) return;
    const run = () => {
      try {
        if (!iframe.contentDocument?.body) return;
        resizeProfilePreviewIframe(iframe);
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
  }, [profilePreviewHtml, templateKey, resizeProfilePreviewIframe]);

  const update = (path, value) => {
    if (path.includes('.')) {
      const [key, ...rest] = path.split('.');
      setCv((prev) => ({
        ...prev,
        [key]: rest.length === 1 ? value : { ...prev[key], [rest.join('.')]: value },
      }));
      return;
    }
    setCv((prev) => ({ ...prev, [path]: value }));
  };

  const updateExp = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, experiences: next };
    });
  };

  const addExp = () => {
    setCv((prev) => ({
      ...prev,
      experiences: [
        ...(prev.experiences || []),
        { id: newExpId(), poste: '', entreprise: '', secteur: '', date_debut: '', date_fin: '', lieu: '', contexte: '', bullet_points: ['', ''], mots_cles: [], clients: '' },
      ],
    }));
  };

  const removeExp = (index) => {
    setCv((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index),
    }));
  };

  const updateExpBullet = (expIndex, bulletIndex, value) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = [...(next[expIndex].bullet_points || ['', ''])];
      bullets[bulletIndex] = value;
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const addExpBullet = (expIndex) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = [...(next[expIndex].bullet_points || [''])];
      bullets.push('');
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const removeExpBullet = (expIndex, bulletIndex) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = (next[expIndex].bullet_points || ['']).filter((_, j) => j !== bulletIndex);
      if (bullets.length === 0) bullets.push('');
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const addFormation = () => {
    setCv((prev) => ({
      ...prev,
      formations: [...(prev.formations || []), { id: newFormId(), diplome: '', etablissement: '', date: '', mention: '' }],
    }));
  };

  const removeFormation = (index) => {
    setCv((prev) => ({ ...prev, formations: prev.formations.filter((_, i) => i !== index) }));
  };

  const updateFormation = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.formations || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, formations: next };
    });
  };

  const addCertification = () => {
    setCv((prev) => ({
      ...prev,
      certifications: [...(prev.certifications || []), { id: newCertId(), nom: '', organisme: '', date: '' }],
    }));
  };

  const removeCertification = (index) => {
    setCv((prev) => ({ ...prev, certifications: (prev.certifications || []).filter((_, i) => i !== index) }));
  };

  const updateCertification = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.certifications || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, certifications: next };
    });
  };

  const addProjet = () => {
    setCv((prev) => ({
      ...prev,
      projets: [...(prev.projets || []), { id: newProjId(), nom: '', description: '', mots_cles: [] }],
    }));
  };

  const removeProjet = (index) => {
    setCv((prev) => ({ ...prev, projets: prev.projets.filter((_, i) => i !== index) }));
  };

  const updateProjet = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.projets || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, projets: next };
    });
  };

  const comp = cv.competences || { techniques: [], logiciels: [], langues: [], autres: [] };
  const setComp = (key, arr) => setCv((prev) => ({
    ...prev,
    competences: { ...(prev.competences || {}), [key]: arr },
  }));
  const updateCompList = (key, index, value) => setCv((prev) => {
    const arr = [...(prev.competences?.[key] || [])];
    const current = arr[index];
    arr[index] = typeof current === 'object' && current !== null ? { ...current, ...value } : value;
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });
  const addCompList = (key, emptyItem) => setCv((prev) => {
    const arr = [...(prev.competences?.[key] || []), emptyItem];
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });
  const removeCompList = (key, index) => setCv((prev) => {
    const arr = (prev.competences?.[key] || []).filter((_, i) => i !== index);
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });

  const handleSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await apiPut('/api/cv', { ...cv, template_id: templateId, template_options: templateOptions });
      setMessage('CV enregistré.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const initiateLinkedInOAuth = async (pendingKey) => {
    if (!supabase) return;
    localStorage.setItem(pendingKey, '1');
    const redirectTo = window.location.origin + '/login?next=/app/profil';
    const { error: linkErr } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo },
    });
    if (linkErr) {
      localStorage.removeItem(pendingKey);
      setLinkedinError(linkErr.message || 'Erreur de connexion LinkedIn.');
      setLinkedinModalOpen(true);
    }
  };

  const fetchLinkedInWithToken = async (token) => {
    setLinkedinError('');
    setLinkedinLoading(true);
    setProposedChanges([]);
    setLinkedinModalOpen(true);
    try {
      const data = await apiPost('/api/cv/fetch-linkedin', { linkedin_access_token: token });
      setProposedChanges(data.proposed_changes || []);
      setSelectedChangeIds(new Set((data.proposed_changes || []).map((c) => c.id)));
      if (!(data.proposed_changes || []).length) {
        setLinkedinError('Aucune diff\u00e9rence entre ton CV et ton profil LinkedIn.');
      }
    } catch (e) {
      const msg = e.message || '';
      const isTokenError = msg.includes('invalide') || msg.includes('expir') || e.status === 400;
      if (isTokenError) {
        setLinkedinModalOpen(false);
        setLinkedinLoading(false);
        throw e;
      }
      setLinkedinError(msg || 'Impossible de r\u00e9cup\u00e9rer le profil LinkedIn.');
      setProposedChanges([]);
    } finally {
      setLinkedinLoading(false);
    }
  };

  const handleImportLinkedInPhotoWithToken = async (token) => {
    setError('');
    setMessage('');
    setImportPhotoLoading(true);
    try {
      await apiPost('/api/cv/import-linkedin-photo', { linkedin_access_token: token });
      const fresh = await apiGet('/api/cv');
      setCv({ ...defaultCv(), ...fresh });
      setMessage('Photo LinkedIn import\u00e9e et enregistr\u00e9e.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Impossible d\'importer la photo LinkedIn.');
    } finally {
      setImportPhotoLoading(false);
    }
  };

  const handleFetchLinkedIn = async () => {
    const token = session?.provider_token;
    if (!token) {
      await initiateLinkedInOAuth(LINKEDIN_SYNC_KEY);
      return;
    }
    try {
      await fetchLinkedInWithToken(token);
    } catch {
      await initiateLinkedInOAuth(LINKEDIN_SYNC_KEY);
    }
  };

  const toggleChangeSelection = (id) => {
    setSelectedChangeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const openCropModal = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisis un fichier image (JPEG, PNG, WebP ou GIF).');
      return;
    }
    setError('');
    setCropImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeCropModal = useCallback(() => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropModalOpen(false);
    setCropImageSrc(null);
    setCroppedAreaPixels(null);
  }, [cropImageSrc]);

  const handleConfirmCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    setUploadPhotoLoading(true);
    setError('');
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      const data = await apiPostFile('/api/cv/upload-photo', file);
      const photoUrl = (data.photo_url || '').trim();
      if (photoUrl) update('photo_url', photoUrl);
      setMessage('Photo importée (sauvegarde automatique).');
      onSaveSuccess?.();
      closeCropModal();
      setPhotoModalOpen(false);
    } catch (err) {
      setError(err.message || 'Impossible d\'importer la photo.');
    } finally {
      setUploadPhotoLoading(false);
    }
  };

  const handleImportLinkedInPhoto = async () => {
    const token = session?.provider_token;
    if (!token) {
      await initiateLinkedInOAuth(LINKEDIN_PHOTO_KEY);
      return;
    }
    try {
      await handleImportLinkedInPhotoWithToken(token);
    } catch {
      await initiateLinkedInOAuth(LINKEDIN_PHOTO_KEY);
    }
  };

  const handleApplyLinkedInChanges = async () => {
    const toApply = proposedChanges.filter((c) => selectedChangeIds.has(c.id));
    if (!toApply.length) return;
    setLinkedinApplyLoading(true);
    setLinkedinError('');
    try {
      await apiPost('/api/cv/apply-linkedin-updates', {
        changes: toApply.map((c) => ({ field: c.field, linkedin_value: c.linkedin_value })),
      });
      const data = await apiGet('/api/cv');
      setCv({ ...defaultCv(), ...data });
      setLinkedinModalOpen(false);
      setMessage('CV mis à jour depuis LinkedIn.');
      onSaveSuccess?.();
    } catch (e) {
      setLinkedinError(e.message || 'Erreur lors de l\'application des changements.');
    } finally {
      setLinkedinApplyLoading(false);
    }
  };

  const IMPORT_SCALAR_KEYS = [
    { key: 'prenom', label: 'Prénom' },
    { key: 'nom', label: 'Nom' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'ville', label: 'Ville' },
    { key: 'titre_professionnel', label: 'Titre professionnel' },
    { key: 'resume', label: 'Résumé / Accroche' },
    { key: 'photo_url', label: 'Photo' },
  ];
  const IMPORT_SECTION_KEYS = [
    { key: 'experiences', label: 'Expériences' },
    { key: 'formations', label: 'Formations' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'competences', label: 'Compétences' },
    { key: 'projets', label: 'Projets' },
  ];

  const IMPORT_STEPS = [
    'Lecture du document',
    'Extraction du texte',
    'Identification des sections',
    'Analyse des expériences et formations',
    'Structuration des données',
    'Finalisation',
  ];
  const IMPORT_STEP_DURATION_MS = 1400;
  const IMPORT_PHASE_DURATION_MS = 7000;

  const handleImportCv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportStepIndex(0);
    setError('');
    if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
    if (importFinalisationTimerRef.current) clearTimeout(importFinalisationTimerRef.current);
    importStepTimerRef.current = setInterval(() => {
      setImportStepIndex((i) => {
        if (i >= 4) {
          if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
          return 5;
        }
        return i + 1;
      });
    }, IMPORT_STEP_DURATION_MS);
    importFinalisationTimerRef.current = setTimeout(() => {
      setImportStepIndex(5);
      if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
    }, IMPORT_PHASE_DURATION_MS);
    try {
      const result = await apiPostFile('/api/cv/import', file);
      const parsed = result?.cv || result;
      if (parsed && typeof parsed === 'object') {
        const choices = {};
        IMPORT_SCALAR_KEYS.forEach(({ key }) => {
          const importedVal = parsed[key];
          if (importedVal === undefined || importedVal === null || String(importedVal).trim() === '') return;
          const currentVal = (cv[key] ?? '').toString().trim();
          const importedStr = String(importedVal).trim();
          if (currentVal === importedStr) return;
          choices[key] = currentVal === '' ? 'add' : 'keep';
        });
        IMPORT_SECTION_KEYS.forEach(({ key }) => {
          const imported = parsed[key];
          const hasImported = Array.isArray(imported) ? imported.length > 0 : (imported && typeof imported === 'object' && (Object.keys(imported).length > 0 || (imported.techniques || imported.logiciels || imported.langues || imported.autres)));
          if (!hasImported) return;
          const current = cv[key];
          try {
            if (JSON.stringify(imported) === JSON.stringify(current)) return;
          } catch (_) {}
          const hasCurrent = Array.isArray(current) ? current.some((e) => (e && (e.poste || e.entreprise || e.diplome || e.nom || (e.bullet_points && e.bullet_points.some(Boolean))))) : (current && typeof current === 'object' && ((current.techniques || []).some(Boolean) || (current.logiciels || []).some(Boolean)));
          choices[key] = hasCurrent ? 'keep' : 'replace';
        });
        if (Object.keys(choices).length === 0) {
          skipNextAutoSaveRef.current = true;
          setCv((prev) => ({ ...defaultCv(), ...prev, ...parsed }));
          setMessage('CV importé - vérifie et complète les champs ci-dessous.');
          setTimeout(() => setMessage(''), 5000);
        } else {
          setImportMergeParsed(parsed);
          setImportMergeChoices(choices);
          setImportMergeOpen(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'import.');
    } finally {
      setImportLoading(false);
      if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
      if (importFinalisationTimerRef.current) clearTimeout(importFinalisationTimerRef.current);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const applyImportMerge = async () => {
    if (!importMergeParsed) return;
    const next = { ...defaultCv(), ...cv };
    IMPORT_SCALAR_KEYS.forEach(({ key }) => {
      const choice = importMergeChoices[key];
      if (choice === 'add' || choice === 'replace') next[key] = importMergeParsed[key] ?? next[key];
    });
    IMPORT_SECTION_KEYS.forEach(({ key }) => {
      if (importMergeChoices[key] === 'replace' && importMergeParsed[key] !== undefined) {
        next[key] = Array.isArray(importMergeParsed[key]) ? [...importMergeParsed[key]] : (typeof importMergeParsed[key] === 'object' && importMergeParsed[key] !== null ? { ...importMergeParsed[key] } : importMergeParsed[key]);
      }
    });
    setCv(next);
    setImportMergeOpen(false);
    setImportMergeParsed(null);
    setImportMergeChoices({});
    setSaving(true);
    setError('');
    try {
      await apiPut('/api/cv', { ...next, template_id: templateId, template_options: templateOptions });
      setMessage('CV importé et enregistré.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l\'enregistrement.');
    } finally {
      setSaving(false);
    }
    setTimeout(() => setMessage(''), 5000);
  };

  if (loading) return <div className="profile-loading">Chargement du profil…</div>;

  return (
    <div className="profile-view profile-view-with-preview">
      <div className="profile-form-pane">
      <div className="profile-header">
        <h1>Mon profil CV</h1>
        <p className="profile-subtitle">Complète tes informations. Le CV est généré à partir de ces données.</p>
        <div className="profile-header-actions">
          <input ref={importFileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleImportCv} />
          <button type="button" className="btn btn-import-cv" onClick={() => importFileRef.current?.click()} disabled={importLoading}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {importLoading ? 'Import…' : 'Importer un CV'}
          </button>
          <button type="button" className="btn btn-primary profile-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer le CV'}
          </button>
        </div>
      </div>

      {importLoading && (
        <div className="import-cv-loading-overlay" role="status" aria-live="polite">
          <div className="import-cv-loading-card">
            <div className="import-cv-loading-spinner" aria-hidden="true" />
            <p className="import-cv-loading-title">Analyse de ton CV en cours</p>
            <ul className="import-cv-loading-steps" aria-live="polite">
              {IMPORT_STEPS.map((label, i) => (
                <li key={i} className={`import-cv-loading-step ${i < importStepIndex ? 'import-cv-loading-step--done' : i === importStepIndex ? 'import-cv-loading-step--current' : ''}`}>
                  <span className="import-cv-loading-step-icon">
                    {i < importStepIndex ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : i === importStepIndex ? (
                      <span className="import-cv-loading-step-spinner" aria-hidden="true" />
                    ) : (
                      <span className="import-cv-loading-step-dot" aria-hidden="true" />
                    )}
                  </span>
                  <span className="import-cv-loading-step-label">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {message && <div className="profile-toast profile-toast--success" role="status">{message}</div>}
      {error && <div className="profile-toast profile-toast--error" role="alert">{error}</div>}

      <ProfileCompletion cv={cv} />

      <CollapsibleSection title="Identité" defaultOpen={true}>
        <div className="profile-photo-row profile-photo-row-simple">
          <div className="profile-photo-preview">
            {(cv.photo_url || '').trim() ? (
              <img
                src={(cv.photo_url || '').startsWith('http') ? cv.photo_url : apiUrl('/api/assets/' + (cv.photo_url || '').replace(/^assets\//, ''))}
                alt="Photo CV"
                className="profile-photo-img"
                onError={(e) => {
                  const src = e.target?.src;
                  if (isSupabaseSignedPhotoUrl(src) && onPhotoSessionExpired) {
                    onPhotoSessionExpired();
                    return;
                  }
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <span className="profile-photo-placeholder">Aucune photo</span>
            )}
          </div>
          <button type="button" className="btn btn-secondary profile-photo-edit-btn" onClick={() => setPhotoModalOpen(true)}>
            Modifier la photo
          </button>
        </div>
        {photoModalOpen && (
          <div className="profile-photo-modal-overlay" onClick={() => setPhotoModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="photo-modal-title">
            <div className="profile-photo-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="photo-modal-title">Modifier la photo</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="profile-photo-file-input"
                onChange={(e) => { openCropModal(e); }}
                aria-label="Choisir une image"
              />
              <button type="button" className="btn btn-secondary profile-photo-modal-btn" onClick={() => { fileInputRef.current?.click(); }} disabled={uploadPhotoLoading}>
                {uploadPhotoLoading ? 'Import…' : 'Importer depuis mon PC'}
              </button>
              <button type="button" className="btn btn-linkedin-sync profile-photo-modal-btn" onClick={() => { handleImportLinkedInPhoto(); setPhotoModalOpen(false); }} disabled={importPhotoLoading}>
                {importPhotoLoading ? 'Import…' : 'Importer la photo LinkedIn'}
              </button>
              <button type="button" className="btn btn-tertiary profile-photo-modal-close" onClick={() => setPhotoModalOpen(false)}>Fermer</button>
            </div>
          </div>
        )}
        {cropModalOpen && cropImageSrc && (
          <div className="profile-crop-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
            <div className="profile-crop-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="crop-modal-title">Cadrer la photo pour le CV</h3>
              <p className="profile-crop-modal-hint">Déplace et zoome l’image pour choisir le cadrage (affichage en cercle sur le CV).</p>
              <div className="profile-crop-container">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="profile-crop-zoom-row">
                <span className="profile-crop-zoom-label">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="profile-crop-zoom-slider"
                  aria-label="Zoom"
                />
              </div>
              <div className="profile-crop-modal-actions">
                <button type="button" className="btn btn-tertiary" onClick={closeCropModal}>Annuler</button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmCrop} disabled={uploadPhotoLoading || !croppedAreaPixels}>
                  {uploadPhotoLoading ? 'Import…' : 'Valider le cadrage'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="profile-grid profile-grid-identity">
          <label>Prénom <input type="text" value={cv.prenom || ''} onChange={(e) => update('prenom', e.target.value)} /></label>
          <label>Nom <input type="text" value={cv.nom || ''} onChange={(e) => update('nom', e.target.value)} /></label>
          <label>Email <input type="email" value={cv.email || ''} onChange={(e) => update('email', e.target.value)} /></label>
          <label>Téléphone <input type="text" value={cv.telephone || ''} onChange={(e) => update('telephone', e.target.value)} /></label>
          <label>LinkedIn <input type="text" value={cv.linkedin || ''} onChange={(e) => update('linkedin', e.target.value)} placeholder="URL" /></label>
          <label>Ville <input type="text" value={cv.ville || ''} onChange={(e) => update('ville', e.target.value)} /></label>
        </div>
        <label className="profile-full">Titre professionnel <input type="text" value={cv.titre_professionnel || ''} onChange={(e) => update('titre_professionnel', e.target.value)} placeholder="ex. Étudiant ESSEC - Alternance" /></label>
        <label className="profile-full">Résumé / Accroche <textarea value={cv.resume || ''} onChange={(e) => update('resume', e.target.value)} rows={3} placeholder="Quelques lignes pour te présenter" /></label>
      </CollapsibleSection>

      <CollapsibleSection title="Expériences professionnelles" defaultOpen={true}>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addExp}>+ Ajouter une expérience</button>
        </div>
        {(cv.experiences || []).map((exp, i) => (
          <div key={exp.id} className="profile-card">
            <div className="profile-card-head">
              <span>Expérience {i + 1}</span>
              <button type="button" className="btn btn-remove" onClick={() => removeExp(i)} title="Supprimer">×</button>
            </div>
            <div className="profile-grid">
              <label>Poste <input type="text" value={exp.poste || ''} onChange={(e) => updateExp(i, 'poste', e.target.value)} /></label>
              <label>Organisation <input type="text" value={exp.entreprise || ''} onChange={(e) => updateExp(i, 'entreprise', e.target.value)} placeholder="Entreprise, association, administration…" /></label>
              <label>Secteur <input type="text" value={exp.secteur || ''} onChange={(e) => updateExp(i, 'secteur', e.target.value)} /></label>
              <label>Date début <input type="text" value={exp.date_debut || ''} onChange={(e) => updateExp(i, 'date_debut', e.target.value)} placeholder="ex. 2022, 01/2024" title="Année ou mois (vide = pas affiché sur le CV)" /></label>
              <label>Date fin <input type="text" value={exp.date_fin || ''} onChange={(e) => updateExp(i, 'date_fin', e.target.value)} placeholder="ex. Aujourd'hui, 08/2024" title="Année, mois ou Aujourd'hui (vide = pas affiché)" /></label>
              <label>Lieu <input type="text" value={exp.lieu || ''} onChange={(e) => updateExp(i, 'lieu', e.target.value)} /></label>
            </div>
            <label className="profile-full">Contexte <input type="text" value={exp.contexte || ''} onChange={(e) => updateExp(i, 'contexte', e.target.value)} /></label>
            <div className="profile-bullets">
              <div className="profile-bullets-head">
                <span>Bullet points</span>
                <button type="button" className="btn btn-add" onClick={() => addExpBullet(i)}>+ Ajouter un point</button>
              </div>
              {(exp.bullet_points || ['', '']).map((b, j) => (
                <div key={j} className="profile-bullet-row">
                  <textarea value={b} onChange={(e) => updateExpBullet(i, j, e.target.value)} rows={2} placeholder={`Point ${j + 1}`} />
                  <button type="button" className="btn btn-remove" onClick={() => removeExpBullet(i, j)} title="Supprimer ce point">×</button>
                </div>
              ))}
            </div>
            <label className="profile-full">Clients <input type="text" value={exp.clients || ''} onChange={(e) => updateExp(i, 'clients', e.target.value)} placeholder="ex. L'Oréal, Charal, Herta (vide = pas affiché sur le CV)" title="Liste de clients ou types de clients (vide = pas affiché)" /></label>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Formations" defaultOpen={true}>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addFormation}>+ Ajouter</button>
        </div>
        {(cv.formations || []).map((form, i) => (
          <div key={form.id} className="profile-card">
            <div className="profile-card-head">
              <span>Formation {i + 1}</span>
              <button type="button" className="btn btn-remove" onClick={() => removeFormation(i)}>×</button>
            </div>
            <div className="profile-grid">
              <label>Diplôme <input type="text" value={form.diplome || ''} onChange={(e) => updateFormation(i, 'diplome', e.target.value)} /></label>
              <label>Établissement <input type="text" value={form.etablissement || ''} onChange={(e) => updateFormation(i, 'etablissement', e.target.value)} /></label>
              <label>Date <input type="text" value={form.date || ''} onChange={(e) => updateFormation(i, 'date', e.target.value)} placeholder="ex. 2024, 06/2023" title="Année ou mois (vide = pas affiché sur le CV)" /></label>
              <label className="profile-full">Description <textarea className="profile-mention-field" value={form.mention || ''} onChange={(e) => updateFormation(i, 'mention', e.target.value)} rows={4} placeholder="ex. Mention Bien, Félicitations du jury" /></label>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Certifications" defaultOpen={false}>
        <p className="profile-subtitle" style={{ marginTop: 0, marginBottom: '0.75rem' }}>Tu pourras les ajouter au CV plus tard.</p>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addCertification}>+ Ajouter</button>
        </div>
        {(cv.certifications || []).map((cert, i) => (
          <div key={cert.id} className="profile-card">
            <div className="profile-card-head">
              <span>Certification {i + 1}</span>
              <button type="button" className="btn btn-remove" onClick={() => removeCertification(i)}>×</button>
            </div>
            <div className="profile-grid">
              <label>Intitulé <input type="text" value={cert.nom || ''} onChange={(e) => updateCertification(i, 'nom', e.target.value)} placeholder="ex. PMP, AWS Solutions Architect" /></label>
              <label>Organisme <input type="text" value={cert.organisme || ''} onChange={(e) => updateCertification(i, 'organisme', e.target.value)} placeholder="ex. PMI, Amazon" /></label>
              <label>Date <input type="text" value={cert.date || ''} onChange={(e) => updateCertification(i, 'date', e.target.value)} placeholder="ex. 2024, 06/2023" /></label>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Projets" defaultOpen={false}>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addProjet}>+ Ajouter</button>
        </div>
        {(cv.projets || []).map((proj, i) => (
          <div key={proj.id} className="profile-card">
            <div className="profile-card-head">
              <span>Projet {i + 1}</span>
              <button type="button" className="btn btn-remove" onClick={() => removeProjet(i)}>×</button>
            </div>
            <label>Nom <input type="text" value={proj.nom || ''} onChange={(e) => updateProjet(i, 'nom', e.target.value)} /></label>
            <label className="profile-full">Description <textarea value={proj.description || ''} onChange={(e) => updateProjet(i, 'description', e.target.value)} rows={2} /></label>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Compétences, langues & autres" defaultOpen={false}>
        <div className="profile-card">
          <h3 className="sidebar-category">Compétences techniques</h3>
          {(comp.techniques || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <input type="text" value={typeof item === 'string' ? item : ''} onChange={(e) => updateCompList('techniques', i, e.target.value)} placeholder="ex. Python, Gestion de projet" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('techniques', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('techniques', '')}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Logiciels & outils</h3>
          {(comp.logiciels || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <input type="text" value={typeof item === 'string' ? item : ''} onChange={(e) => updateCompList('logiciels', i, e.target.value)} placeholder="ex. Excel, React, Git" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('logiciels', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('logiciels', '')}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Langues</h3>
          {(comp.langues || []).map((l, i) => (
            <div key={i} className="profile-langue-row">
              <input type="text" value={l?.langue || ''} onChange={(e) => updateCompList('langues', i, { ...l, langue: e.target.value })} placeholder="Langue" />
              <input type="text" value={l?.niveau || ''} onChange={(e) => updateCompList('langues', i, { ...l, niveau: e.target.value })} placeholder="ex. Natif, Courant (C1)" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('langues', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('langues', { langue: '', niveau: '' })}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Autres</h3>
          {(comp.autres || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <input type="text" value={typeof item === 'string' ? item : ''} onChange={(e) => updateCompList('autres', i, e.target.value)} placeholder="ex. Permis B, Piano" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('autres', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('autres', '')}>+ Ajouter</button>
        </div>
      </CollapsibleSection>

      {usage?.plan === 'pro' && !usage?.paywall_disabled && (
        <CollapsibleSection title="Abonnement" defaultOpen={true}>
          <p className="profile-section-desc">Gère la résiliation depuis ici (exigence légale). La facturation détaillée reste disponible sur le portail sécurisé Stripe si besoin.</p>
          {usage.stripe_subscription ? (
            <>
              <p className="profile-subscription-period">
                <strong>Fin de la période en cours :</strong>{' '}
                {usage.stripe_subscription.current_period_end_label || '-'}
                {usage.stripe_subscription.cancel_at_period_end && (
                  <span className="profile-subscription-badge"> Résiliation déjà programmée</span>
                )}
              </p>
              {usage.stripe_subscription.cancel_at_period_end ? (
                <p className="profile-section-desc">
                  Ton abonnement ne sera pas renouvelé. Tu conserves l&apos;accès Pro jusqu&apos;au{' '}
                  <strong>{usage.stripe_subscription.current_period_end_label || 'fin de période indiquée par Stripe'}</strong>
                  , puis ton compte repassera en offre gratuite (sans suppression automatique de tes données).
                </p>
              ) : (
                <>
                  <p className="profile-subscription-legal" role="note">
                    Résilier mon abonnement - La résiliation prend effet à la fin de la période en cours. Vos données restent accessibles jusqu&apos;à cette date.
                  </p>
                  <div className="profile-subscription-actions">
                    <button
                      type="button"
                      className="btn btn-secondary profile-btn-cancel-sub"
                      onClick={() => setCancelSubModalOpen(true)}
                      disabled={cancelSubLoading}
                    >
                      Résilier mon abonnement
                    </button>
                    {typeof onBillingPortalClick === 'function' && (
                      <button type="button" className="btn btn-secondary" onClick={onBillingPortalClick}>
                        Facturation &amp; moyens de paiement (Stripe)
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="profile-subscription-fallback">
              <p className="profile-section-desc">
                Le détail Stripe n&apos;est pas disponible pour l&apos;instant (connexion ou synchronisation). Tu peux ouvrir le portail de facturation pour gérer ton abonnement.
              </p>
              {typeof onBillingPortalClick === 'function' && (
                <button type="button" className="btn btn-secondary" onClick={onBillingPortalClick}>
                  Ouvrir le portail de facturation
                </button>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {cancelSubModalOpen && (
        <div className="profile-change-email-overlay" onClick={() => !cancelSubLoading && setCancelSubModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="cancel-sub-title">
          <div className="profile-change-email-modal profile-cancel-sub-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="cancel-sub-title">Confirmer la résiliation</h3>
            <p className="profile-change-email-hint">
              Ta résiliation est effective à la <strong>fin de la période déjà payée</strong>
              {usage?.stripe_subscription?.current_period_end_label ? (
                <> (au plus tard le <strong>{usage.stripe_subscription.current_period_end_label}</strong>)</>
              ) : null}
              . Aucun remboursement automatique de la période en cours : tu conserves l&apos;accès Pro jusqu&apos;à cette date. Un email de confirmation te sera envoyé.
            </p>
            <div className="reauth-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={cancelSubLoading}
                onClick={async () => {
                  setCancelSubLoading(true);
                  setError('');
                  try {
                    const data = await apiPost('/api/cancel-subscription', {});
                    setCancelSubModalOpen(false);
                    const end = data.current_period_end_label || '';
                    if (data.already_scheduled) {
                      setMessage(`Ta résiliation était déjà programmée. Accès Pro jusqu'au ${end || 'fin de période'}.`);
                    } else {
                      setMessage(
                        `Résiliation enregistrée. Accès Pro jusqu'au ${end || 'fin de période'}. Un email de confirmation t'a été envoyé.`
                      );
                    }
                    onUsageRefresh?.();
                  } catch (err) {
                    setError(err?.message || 'Impossible de résilier pour le moment.');
                  } finally {
                    setCancelSubLoading(false);
                  }
                }}
              >
                {cancelSubLoading ? 'Traitement…' : 'Résilier mon abonnement'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={cancelSubLoading} onClick={() => setCancelSubModalOpen(false)}>
                Retour
              </button>
            </div>
          </div>
        </div>
      )}

      <CollapsibleSection title="Compte et sécurité" defaultOpen={false}>
        <p className="profile-section-desc">Gère l&apos;email de connexion et la sécurité de ton compte.</p>
        <button type="button" className="btn btn-secondary" onClick={() => { setChangeEmailOpen(true); setChangeEmailNew(''); setChangeEmailPassword(''); setChangeEmailError(''); }}>
          Changer l&apos;email du compte
        </button>
        <div className="profile-set-password-block">
          <p className="profile-section-desc">Tu peux définir un mot de passe pour te connecter aussi par email et mot de passe (utile si tu n&apos;utilises que le lien magique ou Google/LinkedIn).</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setSetPasswordOpen(true); setSetPasswordNew(''); setSetPasswordConfirm(''); setSetPasswordError(''); }}>
            Définir ou modifier mon mot de passe
          </button>
        </div>
        {setPasswordOpen && (
          <div className="profile-change-email-overlay" onClick={() => setSetPasswordOpen(false)} role="dialog" aria-modal="true">
            <div className="profile-change-email-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Définir un mot de passe</h3>
              <p className="profile-change-email-hint">Tu pourras ensuite te connecter avec ton email et ce mot de passe en plus du lien magique ou des réseaux sociaux.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSetPasswordError('');
                if (setPasswordNew.length < 6) { setSetPasswordError('Le mot de passe doit faire au moins 6 caractères.'); return; }
                if (setPasswordNew !== setPasswordConfirm) { setSetPasswordError('Les deux mots de passe ne correspondent pas.'); return; }
                setSetPasswordLoading(true);
                try {
                  const { error: updateErr } = await supabase.auth.updateUser({ password: setPasswordNew });
                  if (updateErr) throw updateErr;
                  setMessage('Mot de passe enregistré. Tu peux maintenant te connecter avec ton email et ce mot de passe.');
                  setSetPasswordOpen(false);
                } catch (err) {
                  setSetPasswordError(err?.message || 'Impossible de définir le mot de passe.');
                } finally {
                  setSetPasswordLoading(false);
                }
              }}>
                <label>Nouveau mot de passe <input type="password" value={setPasswordNew} onChange={(e) => setSetPasswordNew(e.target.value)} placeholder="••••••••" className="auth-input" autoComplete="new-password" minLength={6} /></label>
                <label>Confirmer le mot de passe <input type="password" value={setPasswordConfirm} onChange={(e) => setSetPasswordConfirm(e.target.value)} placeholder="••••••••" className="auth-input" autoComplete="new-password" minLength={6} /></label>
                {setPasswordError && <div className="auth-error">{setPasswordError}</div>}
                <div className="reauth-actions">
                  <button type="submit" className="btn btn-primary" disabled={setPasswordLoading || setPasswordNew.length < 6 || setPasswordNew !== setPasswordConfirm}>{setPasswordLoading ? '…' : 'Enregistrer le mot de passe'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSetPasswordOpen(false)}>Annuler</button>
                </div>
              </form>
            </div>
          </div>
        )}
        <div className="profile-invite-block">
          <p className="profile-section-desc">Invite une personne qui n&apos;a pas encore de compte : elle recevra un email avec un lien pour s&apos;inscrire.</p>
          <form className="profile-invite-form" onSubmit={async (e) => {
            e.preventDefault();
            setInviteError('');
            if (!inviteEmail.trim()) return;
            setInviteLoading(true);
            try {
              await apiPost('/api/invite', { email: inviteEmail.trim() });
              setMessage('Invitation envoyée par email à ' + inviteEmail.trim());
              setInviteEmail('');
            } catch (err) {
              setInviteError(err?.message || err?.detail || 'Impossible d\'envoyer l\'invitation.');
            } finally {
              setInviteLoading(false);
            }
          }}>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@exemple.fr" className="auth-input" />
            <button type="submit" className="btn btn-secondary" disabled={inviteLoading}>{inviteLoading ? 'Envoi…' : 'Inviter par email'}</button>
          </form>
          {inviteError && <div className="auth-error">{inviteError}</div>}
        </div>
        <div className="profile-mfa-block">
          <p className="profile-section-desc">Authentification à deux facteurs (optionnel) : ajoute une vérification via une app (Google Authenticator, Authy, etc.). Ce n&apos;est pas obligatoire.</p>
          {(mfaFactors.totp && mfaFactors.totp.length > 0) ? (
            <div className="profile-mfa-factors">
              <span className="profile-mfa-label">App authentificatrice activée</span>
              {mfaFactors.totp.map((f) => (
                <div key={f.id} className="profile-mfa-factor-row">
                  <span>{f.friendly_name || 'TOTP'}</span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={mfaUnenrollLoading === f.id} onClick={async () => {
                    setMfaUnenrollLoading(f.id);
                    try {
                      const { error: err } = await supabase.auth.mfa.unenroll({ factorId: f.id });
                      if (err) throw err;
                      setMfaFactors((prev) => ({ ...prev, totp: (prev.totp || []).filter((x) => x.id !== f.id) }));
                      setMessage('Authentification à deux facteurs désactivée.');
                    } catch (e) {
                      setError(e?.message || 'Impossible de retirer le facteur.');
                    } finally {
                      setMfaUnenrollLoading(null);
                    }
                  }}>{mfaUnenrollLoading === f.id ? '…' : 'Retirer'}</button>
                </div>
              ))}
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => {
              setMfaEnrollOpen(true);
              setMfaEnrollError('');
              setMfaEnrollCode('');
              setMfaEnrollQr('');
              setMfaEnrollFactorId('');
              if (!supabase?.auth?.mfa?.enroll) return;
              supabase.auth.mfa.enroll({ factorType: 'totp' })
                .then(({ data, error }) => {
                  if (error) throw error;
                  setMfaEnrollFactorId(data?.id ?? '');
                  const qr = data?.totp?.qr_code;
                  if (qr) setMfaEnrollQr(qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`);
                })
                .catch((e) => setMfaEnrollError(e?.message || 'Impossible de démarrer l\'activation MFA.'));
            }}>
              Activer l&apos;authentification à deux facteurs (app authentificatrice)
            </button>
          )}
        </div>
        {mfaEnrollOpen && (
          <div className="profile-change-email-overlay" onClick={() => setMfaEnrollOpen(false)} role="dialog" aria-modal="true">
            <div className="profile-change-email-modal profile-mfa-enroll-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Activer l&apos;authentification à deux facteurs</h3>
              <p className="profile-change-email-hint">Scanne le QR code avec ton app (Google Authenticator, Authy, etc.) puis entre le code à 6 chiffres.</p>
              {mfaEnrollQr && <div className="profile-mfa-qr-wrap"><img src={mfaEnrollQr} alt="QR code TOTP" className="profile-mfa-qr" /></div>}
              <input type="text" inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" value={mfaEnrollCode} onChange={(e) => setMfaEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="auth-input profile-mfa-code-input" />
              {mfaEnrollError && <div className="auth-error">{mfaEnrollError}</div>}
              <div className="reauth-actions">
                <button type="button" className="btn btn-primary" disabled={mfaEnrollLoading || !mfaEnrollFactorId || mfaEnrollCode.length !== 6} onClick={async () => {
                  setMfaEnrollError('');
                  setMfaEnrollLoading(true);
                  try {
                    const { data: challengeData, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaEnrollFactorId });
                    if (chErr) throw chErr;
                    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: mfaEnrollFactorId, challengeId: challengeData.id, code: mfaEnrollCode });
                    if (verifyErr) throw verifyErr;
                    setMfaFactors((prev) => ({ ...prev, totp: [...(prev.totp || []), { id: mfaEnrollFactorId, friendly_name: 'TOTP', status: 'verified' }] }));
                    setMessage('Authentification à deux facteurs activée.');
                    setMfaEnrollOpen(false);
                  } catch (e) {
                    setMfaEnrollError(e?.message || 'Code invalide. Réessaie.');
                  } finally {
                    setMfaEnrollLoading(false);
                  }
                }}>{mfaEnrollLoading ? '…' : 'Activer'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setMfaEnrollOpen(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}
        {changeEmailOpen && (
          <div className="profile-change-email-overlay" onClick={() => setChangeEmailOpen(false)} role="dialog" aria-modal="true">
            <div className="profile-change-email-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Changer l&apos;email</h3>
              <p className="profile-change-email-hint">Un lien de confirmation sera envoyé à ta nouvelle adresse. Tu devras le valider pour que le changement soit pris en compte.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setChangeEmailError('');
                if (!changeEmailNew.trim()) { setChangeEmailError('Saisis ta nouvelle adresse email.'); return; }
                setChangeEmailLoading(true);
                try {
                  const currentEmail = session?.user?.email;
                  if (currentEmail && changeEmailPassword) {
                    const { error: signErr } = await supabase.auth.signInWithPassword({ email: currentEmail, password: changeEmailPassword });
                    if (signErr) throw signErr;
                  }
                  const { error: updateErr } = await supabase.auth.updateUser({ email: changeEmailNew.trim() });
                  if (updateErr) throw updateErr;
                  setMessage('Un lien de confirmation a été envoyé à ta nouvelle adresse. Clique dessus pour valider le changement.');
                  setChangeEmailOpen(false);
                } catch (err) {
                  setChangeEmailError(err.message || 'Impossible de changer l\'email.');
                } finally {
                  setChangeEmailLoading(false);
                }
              }}>
                <label>Nouvel email <input type="email" value={changeEmailNew} onChange={(e) => setChangeEmailNew(e.target.value)} placeholder="nouvelle@email.fr" className="auth-input" /></label>
                <label>Mot de passe actuel (pour confirmer) <input type="password" value={changeEmailPassword} onChange={(e) => setChangeEmailPassword(e.target.value)} placeholder="••••••••" className="auth-input" autoComplete="current-password" /></label>
                {changeEmailError && <div className="auth-error">{changeEmailError}</div>}
                <div className="reauth-actions">
                  <button type="submit" className="btn btn-primary" disabled={changeEmailLoading}>{changeEmailLoading ? '…' : 'Envoyer le lien de confirmation'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setChangeEmailOpen(false)}>Annuler</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <div className="profile-footer">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le CV'}
        </button>
      </div>
      </div>

      <div className="profile-preview-pane">
        <div className="profile-preview-pane-top">
          <h2 className="profile-preview-title">Aperçu du CV</h2>
          <TemplatePicker
            templates={templatesList}
            templateId={templateId}
            templateOptions={templateOptions}
            onChangeTemplate={(id) => { setTemplateId(id); setTemplateOptions({}); }}
            onChangeOptions={setTemplateOptions}
            userPlan={usage?.plan}
            onUpgradeClick={onUpgradeClick}
            optionsPreviewHtml={profilePreviewHtml}
            optionsPreviewLoading={profilePreviewLoading}
          />
        </div>
        <div className="profile-preview-pane-scroll">
          <div className="profile-preview-wrap profile-preview-a4">
            {profilePreviewLoading && (
              <p className="profile-preview-empty">Génération de l&apos;aperçu…</p>
            )}
            {!profilePreviewLoading && !profilePreviewHtml && (
              <p className="profile-preview-empty">Modifiez le formulaire pour voir l&apos;aperçu.</p>
            )}
            {!profilePreviewLoading && profilePreviewHtml && (
              <iframe
                key={templateKey}
                ref={(el) => { profilePreviewIframeRef.current = el; }}
                title="Aperçu du CV"
                srcDoc={profilePreviewHtml}
                className="profile-preview-iframe"
                scrolling="no"
                onLoad={(e) => resizeProfilePreviewIframe(e.target)}
              />
            )}
          </div>
        </div>
      </div>

      {linkedinModalOpen && (
        <div className="linkedin-sync-overlay" onClick={() => setLinkedinModalOpen(false)} role="dialog" aria-modal="true">
          <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Mise à jour depuis LinkedIn</h3>
            {linkedinError && <div className="linkedin-sync-error">{linkedinError}</div>}
            {linkedinLoading && <p className="linkedin-sync-loading">Récupération du profil…</p>}
            {!linkedinLoading && proposedChanges.length > 0 && (
              <>
                <p className="linkedin-sync-intro">Choisis les changements à appliquer. Les textes seront adaptés au style CV par l’IA.</p>
                <ul className="linkedin-sync-changes">
                  {proposedChanges.map((c) => (
                    <li key={c.id} className="linkedin-sync-change">
                      <label>
                        <input type="checkbox" checked={selectedChangeIds.has(c.id)} onChange={() => toggleChangeSelection(c.id)} />
                        <span className="change-label">{c.label}</span>
                      </label>
                      <div className="change-values">
                        <div className="change-current"><strong>Actuel :</strong> {c.field === 'photo_url' ? formatScalarPreviewForPrivacy('photo_url', c.current_value, 0) : (c.current_value || '-')}</div>
                        <div className="change-new"><strong>LinkedIn :</strong> {c.field === 'photo_url' ? formatScalarPreviewForPrivacy('photo_url', c.linkedin_value, 0) : (c.linkedin_value || '-')}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="linkedin-sync-actions">
                  <button type="button" className="btn btn-primary" onClick={handleApplyLinkedInChanges} disabled={linkedinApplyLoading || selectedChangeIds.size === 0}>
                    {linkedinApplyLoading ? 'Application…' : `Appliquer ${selectedChangeIds.size} changement(s)`}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setLinkedinModalOpen(false)}>Fermer</button>
                </div>
              </>
            )}
            {!linkedinLoading && proposedChanges.length === 0 && (
              <>
                {!linkedinError && <p>Aucune mise à jour proposée.</p>}
                <button type="button" className="btn btn-secondary linkedin-sync-close" onClick={() => setLinkedinModalOpen(false)}>Fermer</button>
              </>
            )}
          </div>
        </div>
      )}

      {importMergeOpen && importMergeParsed && (
        <div className="linkedin-sync-overlay import-merge-overlay" onClick={() => { setImportMergeOpen(false); setImportMergeParsed(null); }} role="dialog" aria-modal="true" aria-labelledby="import-merge-title">
          <div className="linkedin-sync-modal import-merge-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="import-merge-title" className="import-merge-modal-title">Importer le CV - choisir les champs</h3>
            <p className="linkedin-sync-intro import-merge-intro">Champ vide : ajouter le texte importé ou l’ignorer. Champ déjà rempli : remplacer ou conserver ta version actuelle.</p>
            <ul className="linkedin-sync-changes import-merge-list">
              {IMPORT_SCALAR_KEYS.filter(({ key }) => importMergeParsed[key] !== undefined && String(importMergeParsed[key] ?? '').trim() !== '').map(({ key, label }) => {
                const currentVal = (cv[key] ?? '').toString().trim();
                const isEmpty = currentVal === '';
                const choice = importMergeChoices[key];
                return (
                  <li key={key} className="linkedin-sync-change import-merge-row">
                    <span className="change-label import-merge-field-label">{label}</span>
                    <div className="change-values import-merge-field-body">
                      {isEmpty ? (
                        <>
                          <div className="import-merge-previews">
                            <div className="change-new import-merge-preview import-merge-preview--import"><span className="import-merge-preview-tag">Import</span><span className="import-merge-preview-text">{formatScalarPreviewForPrivacy(key, importMergeParsed[key], 80)}</span></div>
                          </div>
                          <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                            <label className="import-merge-choice">
                              <input type="radio" name={`import-merge-${key}`} checked={choice === 'add'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'add' }))} />
                              Ajouter
                            </label>
                            <label className="import-merge-choice">
                              <input type="radio" name={`import-merge-${key}`} checked={choice === 'skip'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'skip' }))} />
                              Ne pas ajouter
                            </label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="import-merge-previews import-merge-previews--compare">
                            <div className="change-current import-merge-preview import-merge-preview--current"><span className="import-merge-preview-tag">Actuel</span><span className="import-merge-preview-text">{formatScalarPreviewForPrivacy(key, currentVal, 60)}</span></div>
                            <div className="change-new import-merge-preview import-merge-preview--import"><span className="import-merge-preview-tag">Import</span><span className="import-merge-preview-text">{formatScalarPreviewForPrivacy(key, importMergeParsed[key], 60)}</span></div>
                          </div>
                          <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                            <label className="import-merge-choice">
                              <input type="radio" name={`import-merge-${key}`} checked={choice === 'replace'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'replace' }))} />
                              Remplacer
                            </label>
                            <label className="import-merge-choice">
                              <input type="radio" name={`import-merge-${key}`} checked={choice === 'keep'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'keep' }))} />
                              Garder l’actuel
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {IMPORT_SECTION_KEYS.filter(({ key }) => {
                const v = importMergeParsed[key];
                return Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' && (Object.keys(v).length > 0 || (v.techniques || v.logiciels || v.langues || v.autres)));
              }).map(({ key, label }) => {
                const choice = importMergeChoices[key];
                return (
                  <li key={key} className="linkedin-sync-change import-merge-row import-merge-row--section">
                    <span className="change-label import-merge-field-label">{label}</span>
                    <div className="change-values import-merge-field-body">
                      <p className="import-merge-section-note">Section complète (plusieurs entrées). Tu choisis si tout le bloc importé remplace le tien.</p>
                      <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                        <label className="import-merge-choice">
                          <input type="radio" name={`import-merge-${key}`} checked={choice === 'replace'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'replace' }))} />
                          Remplacer par l’import
                        </label>
                        <label className="import-merge-choice">
                          <input type="radio" name={`import-merge-${key}`} checked={choice === 'keep'} onChange={() => setImportMergeChoices((p) => ({ ...p, [key]: 'keep' }))} />
                          Garder l’actuel
                        </label>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="linkedin-sync-actions import-merge-actions">
              <button type="button" className="btn btn-primary" onClick={applyImportMerge}>
                Appliquer les choix
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setImportMergeOpen(false); setImportMergeParsed(null); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
