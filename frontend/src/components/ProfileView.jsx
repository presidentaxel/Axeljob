import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPut, apiPost, apiPostFile, apiUrl } from '../api';
import { defaultCv, newExpId, newFormId, newProjId } from '../data/cvDefault';
import '../styles/ProfileView.css';

const AUTO_SAVE_DELAY_MS = 1500;

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

export default function ProfileView({ onSaveSuccess, session }) {
  const [cv, setCv] = useState(defaultCv());
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
  const fileInputRef = useRef(null);
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
        setCv({ ...defaultCv(), ...data });
      })
      .catch(() => setCv(defaultCv()))
      .finally(() => setLoading(false));
  }, [session?.user?.id]);

  // Auto-save : sauvegarde automatique après modification (debounce)
  const saveToApi = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      await apiPut('/api/cv', cv);
      setMessage('Sauvegardé');
      setTimeout(() => setMessage(''), 2000);
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  }, [cv]);

  useEffect(() => {
    if (loading) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => saveToApi(), AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [cv, loading]);

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
      await apiPut('/api/cv', cv);
      setMessage('CV enregistré.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const handleFetchLinkedIn = async () => {
    const token = session?.provider_token;
    if (!token) {
      setLinkedinError('Connecte-toi avec LinkedIn : va dans l’onglet « Connexion LinkedIn » (menu) pour te connecter.');
      setLinkedinModalOpen(true);
      setProposedChanges([]);
      return;
    }
    setLinkedinError('');
    setLinkedinLoading(true);
    setProposedChanges([]);
    setLinkedinModalOpen(true);
    try {
      const data = await apiPost('/api/cv/fetch-linkedin', { linkedin_access_token: token });
      setProposedChanges(data.proposed_changes || []);
      setSelectedChangeIds(new Set((data.proposed_changes || []).map((c) => c.id)));
      if (!(data.proposed_changes || []).length) {
        setLinkedinError('Aucune différence entre ton CV et ton profil LinkedIn.');
      }
    } catch (e) {
      setLinkedinError(e.message || 'Impossible de récupérer le profil LinkedIn.');
      setProposedChanges([]);
    } finally {
      setLinkedinLoading(false);
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

  const handleUploadPhoto = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisis un fichier image (JPEG, PNG, WebP ou GIF).');
      return;
    }
    setError('');
    setMessage('');
    setUploadPhotoLoading(true);
    try {
      const data = await apiPostFile('/api/cv/upload-photo', file);
      const photoUrl = (data.photo_url || '').trim();
      if (photoUrl) update('photo_url', photoUrl);
      setMessage('Photo importée (sauvegarde automatique).');
      onSaveSuccess?.();
    } catch (err) {
      setError(err.message || 'Impossible d\'importer la photo.');
    } finally {
      setUploadPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportLinkedInPhoto = async () => {
    const token = session?.provider_token;
    if (!token) {
      setError('Va dans l’onglet « Connexion LinkedIn » pour te connecter avec LinkedIn et importer ta photo.');
      return;
    }
    setError('');
    setMessage('');
    setImportPhotoLoading(true);
    try {
      const data = await apiPost('/api/cv/import-linkedin-photo', { linkedin_access_token: token });
      const fresh = await apiGet('/api/cv');
      setCv({ ...defaultCv(), ...fresh });
      setMessage('Photo LinkedIn importée et enregistrée.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Impossible d\'importer la photo LinkedIn.');
    } finally {
      setImportPhotoLoading(false);
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

  if (loading) return <div className="profile-loading">Chargement du profil…</div>;

  return (
    <div className="profile-view">
      <div className="profile-header">
        <h1>Mon profil CV</h1>
        <p className="profile-subtitle">Complète tes informations. Le CV est généré à partir de ces données.</p>
        <div className="profile-header-actions">
          <button type="button" className="btn btn-linkedin-sync" onClick={handleFetchLinkedIn} disabled={linkedinLoading}>
            {linkedinLoading ? 'Récupération…' : 'Mettre à jour depuis LinkedIn'}
          </button>
          <button type="button" className="btn btn-primary profile-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer le CV'}
          </button>
        </div>
      </div>

      {message && <div className="profile-message">{message}</div>}
      {error && <div className="profile-error">{error}</div>}

      <section className="profile-section">
        <h2>Identité</h2>
        <div className="profile-photo-row">
          <div className="profile-photo-preview">
            {(cv.photo_url || '').trim() ? (
              <img
                src={(cv.photo_url || '').startsWith('http') ? cv.photo_url : apiUrl('/api/assets/' + (cv.photo_url || '').replace(/^assets\//, ''))}
                alt="Photo CV"
                className="profile-photo-img"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <span className="profile-photo-placeholder">Aucune photo</span>
            )}
          </div>
          <div className="profile-photo-actions">
            <label className="profile-full">URL photo <input type="text" value={cv.photo_url || ''} onChange={(e) => update('photo_url', e.target.value)} placeholder="https://… ou importer depuis ton PC / LinkedIn" /></label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="profile-photo-file-input"
              onChange={handleUploadPhoto}
              aria-label="Choisir une image"
            />
            <button type="button" className="btn btn-upload-pc" onClick={() => fileInputRef.current?.click()} disabled={uploadPhotoLoading}>
              {uploadPhotoLoading ? 'Import…' : 'Importer depuis mon PC'}
            </button>
            <button type="button" className="btn btn-linkedin-sync" onClick={handleImportLinkedInPhoto} disabled={importPhotoLoading}>
              {importPhotoLoading ? 'Import…' : 'Importer la photo LinkedIn'}
            </button>
          </div>
        </div>
        <div className="profile-grid">
          <label>Prénom <input type="text" value={cv.prenom || ''} onChange={(e) => update('prenom', e.target.value)} /></label>
          <label>Nom <input type="text" value={cv.nom || ''} onChange={(e) => update('nom', e.target.value)} /></label>
          <label>Email <input type="email" value={cv.email || ''} onChange={(e) => update('email', e.target.value)} /></label>
          <label>Téléphone <input type="text" value={cv.telephone || ''} onChange={(e) => update('telephone', e.target.value)} /></label>
          <label>LinkedIn <input type="text" value={cv.linkedin || ''} onChange={(e) => update('linkedin', e.target.value)} placeholder="URL" /></label>
          <label>Ville <input type="text" value={cv.ville || ''} onChange={(e) => update('ville', e.target.value)} /></label>
        </div>
        <label className="profile-full">Titre professionnel <input type="text" value={cv.titre_professionnel || ''} onChange={(e) => update('titre_professionnel', e.target.value)} placeholder="ex. Étudiant ESSEC - Alternance" /></label>
        <label className="profile-full">Résumé / Accroche <textarea value={cv.resume || ''} onChange={(e) => update('resume', e.target.value)} rows={3} placeholder="Quelques lignes pour te présenter" /></label>
      </section>

      <section className="profile-section">
        <div className="profile-section-head">
          <h2>Expériences professionnelles</h2>
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
              <span>Bullet points</span>
              {(exp.bullet_points || ['', '']).map((b, j) => (
                <textarea key={j} value={b} onChange={(e) => updateExpBullet(i, j, e.target.value)} rows={2} placeholder={`Point ${j + 1}`} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="profile-section">
        <div className="profile-section-head">
          <h2>Formations</h2>
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
              <label className="profile-full">Mention <textarea className="profile-mention-field" value={form.mention || ''} onChange={(e) => updateFormation(i, 'mention', e.target.value)} rows={4} placeholder="ex. Mention Bien, Félicitations du jury" /></label>
            </div>
          </div>
        ))}
      </section>

      <section className="profile-section">
        <div className="profile-section-head">
          <h2>Projets</h2>
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
      </section>

      <section className="profile-section">
        <h2>Compétences, langues & autres</h2>
        <p className="profile-subtitle" style={{ marginTop: 0 }}>Ces blocs apparaissent dans la colonne de droite du CV. Données exclusivement depuis Supabase.</p>
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
      </section>

      <div className="profile-footer">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le CV'}
        </button>
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
                        <div className="change-current"><strong>Actuel :</strong> {c.field === 'photo_url' ? c.current_value : (c.current_value || '—')}</div>
                        <div className="change-new"><strong>LinkedIn :</strong> {c.field === 'photo_url' ? '(photo)' : (c.linkedin_value || '—')}</div>
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
    </div>
  );
}
