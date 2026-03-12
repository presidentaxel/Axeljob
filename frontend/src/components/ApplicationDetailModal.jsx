import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { apiGet, apiPost, apiGetBlob, apiPostFormData } from '../api';
import CompanyLogo from './CompanyLogo';

const DOC_LABELS = { lettre: 'Lettre de motivation', cv: 'CV', fiche: 'Fiche de poste' };

export default function ApplicationDetailModal({ applicationDetailId, applications, onClose }) {
  const [applicationDetail, setApplicationDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('cv');
  const [detailCvHtml, setDetailCvHtml] = useState('');
  const [detailLetterHtml, setDetailLetterHtml] = useState('');
  const [detailLetterLoading, setDetailLetterLoading] = useState(false);
  const [detailDownloading, setDetailDownloading] = useState(null);
  const [docUploading, setDocUploading] = useState(null);
  const [error, setError] = useState('');
  const docInputRefs = useRef({ lettre: null, cv: null, fiche: null });

  useEffect(() => {
    if (!applicationDetailId) return;
    setDetailTab('cv');
    setDetailCvHtml('');
    setDetailLetterHtml('');
    apiGet(`/api/applications/${encodeURIComponent(applicationDetailId)}`)
      .then((payload) => {
        setApplicationDetail(payload);
        if (payload.lettre_html) setDetailLetterHtml(payload.lettre_html);
      })
      .catch((e) => setError(e.message || 'Impossible de charger la candidature.'));
  }, [applicationDetailId]);

  useEffect(() => {
    if (!applicationDetail || detailTab !== 'cv') return;
    const fullCv = applicationDetail.full_cv;
    if (!fullCv) return;
    apiPost('/api/render-html', { cv: fullCv })
      .then((html) => setDetailCvHtml(html))
      .catch(() => setDetailCvHtml('<p>Erreur chargement aperçu CV.</p>'));
  }, [applicationDetail, detailTab]);

  const handleGenerateLetter = async () => {
    if (!applicationDetailId) return;
    setDetailLetterLoading(true);
    try {
      const data = await apiPost(`/api/applications/${encodeURIComponent(applicationDetailId)}/generate-letter`);
      if (data?.lettre_html) {
        setDetailLetterHtml(data.lettre_html);
        setApplicationDetail((prev) => (prev ? { ...prev, lettre_html: data.lettre_html } : null));
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

  const handleUploadDoc = async (docType, file) => {
    if (!applicationDetailId || !file) return;
    if (file.type !== 'application/pdf' && !(file.name || '').toLowerCase().endsWith('.pdf')) return;
    setDocUploading(docType);
    setError('');
    try {
      const form = new FormData();
      form.append('type', docType);
      form.append('file', file);
      await apiPostFormData(`/api/applications/${encodeURIComponent(applicationDetailId)}/upload-doc`, form);
      const payload = await apiGet(`/api/applications/${encodeURIComponent(applicationDetailId)}`);
      setApplicationDetail(payload);
      if (docInputRefs.current[docType]) docInputRefs.current[docType].value = '';
    } catch (e) {
      setError(e.message || 'Erreur lors de l\'upload.');
    } finally {
      setDocUploading(null);
    }
  };

  if (!applicationDetail) return null;

  const app = applications.find((a) => a.id === applicationDetailId);

  return (
    <div className="application-detail-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="application-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="application-detail-header">
          <CompanyLogo companyName={applicationDetail.entreprise} className="detail-company-logo" size={44} />
          <div className="detail-header-text">
            <span className="detail-entreprise">{applicationDetail.entreprise || ''}</span>
            <h3>{applicationDetail.poste || applicationDetail.poste_offre || 'Sans intitulé'}</h3>
            {app?.date && <span className="detail-date">{app.date}</span>}
          </div>
          <button type="button" className="btn-close-detail" onClick={onClose} aria-label="Fermer">×</button>
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
        <div className="application-detail-docs">
          <h4 className="application-detail-docs-title">Documents joints</h4>
          <p className="application-detail-docs-hint">Accès aux PDF que tu as joints (lettre, CV, fiche de poste).</p>
          <div className="application-detail-docs-list">
            {(['lettre', 'cv', 'fiche']).map((docType) => {
              const url = applicationDetail[`pdf_${docType}_url`];
              const uploading = docUploading === docType;
              return (
                <div key={docType} className="application-detail-doc-row">
                  <span className="application-detail-doc-label">{DOC_LABELS[docType]}</span>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-doc-link">Ouvrir le PDF</a>
                  ) : null}
                  <label className="btn btn-doc-upload">
                    <input
                      ref={(el) => { docInputRefs.current[docType] = el; }}
                      type="file"
                      accept=".pdf,application/pdf"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target?.files?.[0];
                        if (f) handleUploadDoc(docType, f);
                      }}
                    />
                    {uploading ? 'Envoi…' : url ? 'Remplacer' : 'Joindre un PDF'}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
        <div className="application-detail-content">
          {detailTab === 'cv' && (
            <div className="detail-pane detail-cv">
              {applicationDetail.full_cv ? (
                detailCvHtml ? <iframe title="Aperçu CV" srcDoc={detailCvHtml} className="detail-iframe" /> : <p>Chargement de l&apos;aperçu CV…</p>
              ) : (
                <p>Aucun CV enregistré pour cette candidature.</p>
              )}
            </div>
          )}
          {detailTab === 'lettre' && (
            <div className="detail-pane detail-lettre">
              {detailLetterLoading && <p>Génération de la lettre…</p>}
              {!detailLetterLoading && detailLetterHtml && <div className="letter-html" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailLetterHtml) }} />}
              {!detailLetterLoading && !detailLetterHtml && (
                <div className="detail-lettre-empty">
                  <p>Aucune lettre pour cette candidature.</p>
                  <button type="button" className="btn btn-primary" onClick={handleGenerateLetter}>Générer la lettre</button>
                </div>
              )}
            </div>
          )}
          {detailTab === 'fiche' && (
            <div className="detail-pane detail-fiche">
              <pre className="fiche-text">{(applicationDetail.description_full || '').trim() || 'Aucune fiche enregistrée.'}</pre>
            </div>
          )}
        </div>
        {error && <div className="error" style={{ margin: '0.75rem 1.25rem' }}>{error}</div>}
      </div>
    </div>
  );
}
