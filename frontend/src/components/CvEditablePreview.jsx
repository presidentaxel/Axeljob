import { useCallback, useEffect, useRef, useState } from 'react';
import { HiPhone, HiEnvelope, HiLink } from 'react-icons/hi2';
import { apiUrl, apiGet } from '../api';
import './CvEditablePreview.css';

/** Met à jour une propriété dans un objet par chemin "a.b.0.c" */
function setByPath(obj, path, value) {
  const parts = path.split('.');
  const key = parts.pop();
  let target = obj;
  for (const p of parts) {
    const i = parseInt(p, 10);
    const k = !Number.isNaN(i) ? i : p;
    if (target[k] === undefined) target[k] = Number.isNaN(i) ? {} : [];
    target = target[k];
  }
  target[key] = value;
}

/** Clone profond simple */
function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

/** Valeur dans l'objet au chemin "a.b.0.c" */
function getByPath(obj, path) {
  if (!obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    const i = parseInt(p, 10);
    cur = !Number.isNaN(i) ? cur[i] : cur[p];
  }
  return cur;
}

function isSupabaseSignedPhotoUrl(url) {
  return typeof url === 'string' && url.includes('supabase.co/storage') && url.includes('/object/sign');
}

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const CSS_VAR_MAP = { header_color: '--cv-header-color', sidebar_color: '--cv-sidebar-color', accent_color: '--cv-accent-color' };
const TYPO_CSS_VAR_MAP = {
  font_size_name: '--cv-fs-name',
  font_size_title: '--cv-fs-title',
  font_size_section: '--cv-fs-section',
  font_size_body: '--cv-fs-body',
  font_size_bullet: '--cv-fs-bullet',
  font_size_sidebar_title: '--cv-fs-sidebar-title',
  font_size_sidebar_item: '--cv-fs-sidebar-item',
  color_body: '--cv-color-body',
  color_section_title: '--cv-color-section-title',
};
const FONT_SAFE = { 'Plus Jakarta Sans': "'Plus Jakarta Sans', Arial, sans-serif", 'Inter': "'Inter', Arial, sans-serif", 'Georgia': "Georgia, 'Times New Roman', serif" };

function optionsToCssVars(opts) {
  if (!opts) return {};
  const vars = {};
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const v = opts[key];
    if (v && typeof v === 'string' && COLOR_RE.test(v)) vars[cssVar] = v;
  }
  if (opts.font && FONT_SAFE[opts.font]) vars['--cv-font-heading'] = FONT_SAFE[opts.font];
  for (const [key, cssVar] of Object.entries(TYPO_CSS_VAR_MAP)) {
    const v = opts[key];
    if (key.startsWith('font_size_') && v != null) {
      const pt = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'), 10);
      if (!Number.isNaN(pt) && pt >= 6 && pt <= 24) vars[cssVar] = `${pt}pt`;
    } else if (key.startsWith('color_') && v && typeof v === 'string' && COLOR_RE.test(v)) {
      vars[cssVar] = v;
    }
  }
  const photoPx = opts.photo_size != null ? (typeof opts.photo_size === 'number' ? opts.photo_size : parseFloat(String(opts.photo_size).replace(',', '.'), 10)) : NaN;
  if (!Number.isNaN(photoPx) && photoPx >= 40 && photoPx <= 160) vars['--cv-photo-size'] = `${Math.round(photoPx)}px`;
  return vars;
}

/** Score de contenu pour adapter la typo aux CV courts (étudiants). Même logique que le backend. */
function getContentDensity(cv) {
  const expCount = (cv?.experiences || []).filter((e) => (e?.poste || '').trim() || (e?.entreprise || '').trim() || (e?.bullet_points || []).some((b) => (b || '').trim())).length;
  const bulletCount = (cv?.experiences || []).reduce((n, e) => n + (e?.bullet_points || []).filter((b) => (b || '').trim()).length, 0);
  const formCount = (cv?.formations || []).filter((f) => (f?.diplome || '').trim() || (f?.etablissement || '').trim()).length;
  const projCount = (cv?.projets || []).filter((p) => (p?.nom || '').trim() || (p?.description || '').trim()).length;
  const score = expCount * 3 + bulletCount + formCount + projCount;
  if (score <= 6) return 'sparse';
  if (score <= 10) return 'medium';
  if (score > 15) return 'dense';
  return 'full';
}

/** Extrait le contenu de toutes les balises <style> d'un HTML (celui renvoyé par render-html, avec CSS inliné). */
function extractStylesFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const parts = [];
  let m;
  while ((m = re.exec(html)) !== null) parts.push(m[1].trim());
  return parts.filter(Boolean).join('\n');
}

export default function CvEditablePreview({ cv, baseCv, onChange, templateId = 'classic', templateOptions, showPhoto = true, showMotsClesAts = true, onPhotoSessionExpired, previewHtmlWithInlineCss }) {
  const containerRef = useRef(null);
  const [templateCss, setTemplateCss] = useState('');
  const cssVarOverrides = optionsToCssVars(templateOptions);
  const contentDensity = getContentDensity(cv);

  // Priorité 1 : CSS extrait du HTML de preview (render-html) pour éviter 404 en prod sur /api/templates/.../template.css
  const cssFromHtml = extractStylesFromHtml(previewHtmlWithInlineCss);
  const effectiveCss = (cssFromHtml && cssFromHtml.length > 0) ? cssFromHtml : templateCss;

  // Fallback : charger le CSS par API (peut 404 en prod si la route n'est pas exposée)
  useEffect(() => {
    if (cssFromHtml && cssFromHtml.length > 0) return;
    let cancelled = false;
    setTemplateCss('');
    const tid = (templateId || 'classic').trim();
    apiGet(`/api/templates/${tid}/template.css`)
      .then((css) => { if (!cancelled && typeof css === 'string') setTemplateCss(css); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [templateId, cssFromHtml]);

  const handleBlur = useCallback(() => {
    if (!containerRef.current || !onChange) return;
    const el = containerRef.current;
    const fields = el.querySelectorAll('[data-cv-field]');
    const next = deepClone(cv);
    for (const f of fields) {
      const path = f.getAttribute('data-cv-field');
      if (!path || path === '_noop') continue;
      const value = (f.textContent || '').trim();
      setByPath(next, path, value);
    }
    onChange(next);
  }, [cv, onChange]);

  if (!cv) return null;

  const experiencesAll = cv.experiences || [];
  const experiences = experiencesAll.filter(
    (exp) =>
      (exp.poste || '').trim() ||
      (exp.entreprise || '').trim() ||
      (exp.bullet_points || []).some((b) => (b || '').trim())
  );
  const formationsAll = cv.formations || [];
  const formations = formationsAll.filter(
    (f) => (f.diplome || '').trim() || (f.etablissement || '').trim() || (f.date || '').trim() || (f.mention || '').trim()
  );
  const competences = cv.competences || { techniques: [], logiciels: [], langues: [], autres: [] };
  const projetsAll = cv.projets || [];
  const projets = projetsAll.filter((p) => (p.nom || '').trim() || (p.description || '').trim());
  const certificationsAll = cv.certifications || [];
  const certifications = certificationsAll.filter(
    (c) => (c.nom || '').trim() || (c.organisme || '').trim() || (c.date || '').trim()
  );
  const techWithContent = (competences.techniques || []).filter((x) => (typeof x === 'string' ? x : '').trim());
  const logicielsWithContent = (competences.logiciels || []).filter((x) => (typeof x === 'string' ? x : '').trim());
  const languesWithContent = (competences.langues || []).filter((l) => (l?.langue || '').trim() || (l?.niveau || '').trim());
  const autresWithContent = (competences.autres || []).filter((x) => (typeof x === 'string' ? x : '').trim());

  const isChanged = (path) => {
    if (!baseCv) return false;
    const v = getByPath(cv, path);
    const b = getByPath(baseCv, path);
    const vStr = typeof v === 'string' ? v : (Array.isArray(v) ? (v || []).join('\n') : '');
    const bStr = typeof b === 'string' ? b : (Array.isArray(b) ? (b || []).join('\n') : '');
    return (vStr || '').trim() !== (bStr || '').trim();
  };

  const photoUrl = (cv.photo_url || '').trim()
    ? ((cv.photo_url || '').startsWith('http') ? cv.photo_url : apiUrl('/api/assets/' + (cv.photo_url || '').replace(/^assets\//, '')))
    : null;

  // Layout Minimal : une colonne, header puis sections
  const renderMinimal = () => (
    <article className="cv cv-preview cv-editable">
      <header className="cv-header">
        {showPhoto && photoUrl && (
          <div className="header-photo">
            <img
              src={photoUrl}
              alt=""
              onError={(e) => { if (isSupabaseSignedPhotoUrl(e.target?.src) && onPhotoSessionExpired) onPhotoSessionExpired(); }}
            />
          </div>
        )}
        <div className="header-text">
          <h1 className="header-nom">
            <span data-cv-field="prenom" className={isChanged('prenom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.prenom || ''}</span>
            {' '}
            <span data-cv-field="nom" className={isChanged('nom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.nom || ''}</span>
          </h1>
          <p className="header-titre">
            <span data-cv-field="titre_professionnel" className={isChanged('titre_professionnel') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.titre_professionnel || ''}</span>
          </p>
          <p className="header-contact">
            <span data-cv-field="telephone" suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span>
            {' · '}
            <span data-cv-field="email" suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span>
            {' · '}
            <span data-cv-field="linkedin" suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span>
          </p>
        </div>
      </header>
      <div className="cv-body">
        <section className="section">
          <p className="resume-text">
            <span data-cv-field="resume" className={isChanged('resume') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.resume || ''}</span>
          </p>
        </section>
        {experiences.length > 0 && (
          <section className="section">
            <h2 className="section-title">Expérience professionnelle</h2>
            {experiences.slice(0, 6).map((exp, i) => {
              const oi = experiencesAll.indexOf(exp);
              return (
                <div key={exp.id || i} className="experience-item">
                  <div className="exp-header">
                    <span className="exp-left">
                      <span className="exp-entreprise">
                        <span className="ats-label">Organisation : </span>
                        <span data-cv-field={`experiences.${oi}.entreprise`} className={isChanged(`experiences.${oi}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                      </span>
                      {exp.poste ? <> - <span className="exp-poste-inline"><span className="ats-label">Fonction : </span><span data-cv-field={`experiences.${oi}.poste`} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span></span></> : null}
                    </span>
                    <span className="exp-dates">
                      <span data-cv-field={`experiences.${oi}.date_debut`} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                      {' - '}
                      <span data-cv-field={`experiences.${oi}.date_fin`} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                    </span>
                  </div>
                  {(exp.bullet_points || ['', '']).map((b, j) => (
                    <p key={j} className="bullet">- <span data-cv-field={`experiences.${oi}.bullet_points.${j}`} suppressContentEditableWarning contentEditable="true">{b || ''}</span></p>
                  ))}
                  {(exp.clients || '').trim() ? <p className="exp-clients">Clients : <span data-cv-field={`experiences.${oi}.clients`} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span></p> : null}
                </div>
              );
            })}
          </section>
        )}
        {formations.length > 0 && (
          <section className="section">
            <h2 className="section-title">Formation</h2>
            {formations.map((form, i) => {
              const oi = formationsAll.indexOf(form);
              return (
                <div key={form.id || i} className="formation-item">
                  <div className="formation-header">
                    <span className="formation-diplome"><span data-cv-field={`formations.${oi}.etablissement`} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span> - <span data-cv-field={`formations.${oi}.diplome`} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span></span>
                    <span className="formation-date"><span data-cv-field={`formations.${oi}.date`} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span></span>
                  </div>
                  {form.mention ? <p className="formation-mention"><span data-cv-field={`formations.${oi}.mention`} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span></p> : null}
                </div>
              );
            })}
          </section>
        )}
        {(techWithContent.length > 0 || logicielsWithContent.length > 0) && (
          <section className="section">
            <h2 className="section-title">Compétences</h2>
            <p className="skills-line">
              {(competences.techniques || []).map((item, i) => (
                <span key={i}><span data-cv-field={`competences.techniques.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{i < (competences.techniques || []).length - 1 ? ', ' : ''}</span>
              ))}
            </p>
            {logicielsWithContent.length > 0 && <p className="skills-line"><strong>Outils :</strong> {(competences.logiciels || []).map((item, i) => <span key={i}><span data-cv-field={`competences.logiciels.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{i < (competences.logiciels || []).length - 1 ? ', ' : ''}</span>)}</p>}
          </section>
        )}
        {certifications.length > 0 && (
          <section className="section">
            <h2 className="section-title">Certifications</h2>
            {certifications.map((cert, i) => {
              const oi = certificationsAll.indexOf(cert);
              return (
                <p key={cert.id || i} className="cert-item">
                  <span data-cv-field={`certifications.${oi}.nom`} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                  {' - '}<span data-cv-field={`certifications.${oi}.organisme`} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                  {' · '}<span data-cv-field={`certifications.${oi}.date`} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
                </p>
              );
            })}
          </section>
        )}
        {languesWithContent.length > 0 && (
          <section className="section">
            <h2 className="section-title">Langues</h2>
            <p className="skills-line">
              {(competences.langues || []).map((l, i) => (
                <span key={i}><span data-cv-field={`competences.langues.${i}.langue`} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span> (<span data-cv-field={`competences.langues.${i}.niveau`} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span>){i < (competences.langues || []).length - 1 ? ', ' : ''}</span>
              ))}
            </p>
          </section>
        )}
        {projets.length > 0 && (
          <section className="section">
            <h2 className="section-title">Projets</h2>
            {projets.map((proj, i) => {
              const oi = projetsAll.indexOf(proj);
              return (
                <div key={proj.id || i} className="projet-item">
                  <span className="projet-nom"><span data-cv-field={`projets.${oi}.nom`} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span></span>
                  {' - '}
                  <span className="projet-description"><span data-cv-field={`projets.${oi}.description`} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span></span>
                </div>
              );
            })}
          </section>
        )}
        {autresWithContent.length > 0 && (
          <section className="section">
            <h2 className="section-title">Autres</h2>
            <p className="skills-line">{(competences.autres || []).map((item, i) => <span key={i}><span data-cv-field={`competences.autres.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{(i < (competences.autres || []).length - 1) ? ', ' : ''}</span>)}</p>
          </section>
        )}
        {showMotsClesAts && (
          <div className="section-mots-cles-ats">
            <p className="mots-cles-ats-invisible" aria-hidden="true">
              <span data-cv-field="mots_cles_cache" suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span>
            </p>
          </div>
        )}
      </div>
    </article>
  );

  // Layout Modern : sidebar gauche + main
  const renderModern = () => (
    <article className="cv cv-preview cv-editable">
      <div className="cv-sidebar">
        {showPhoto && photoUrl && (
          <div className="sidebar-photo">
            <img
              src={photoUrl}
              alt=""
              onError={(e) => { if (isSupabaseSignedPhotoUrl(e.target?.src) && onPhotoSessionExpired) onPhotoSessionExpired(); }}
            />
          </div>
        )}
        <div className="sidebar-identity">
          <h1 className="sidebar-nom">
            <span data-cv-field="prenom" className={isChanged('prenom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.prenom || ''}</span>
            {' '}
            <span data-cv-field="nom" className={isChanged('nom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.nom || ''}</span>
          </h1>
          <p className="sidebar-titre"><span data-cv-field="titre_professionnel" suppressContentEditableWarning contentEditable="true">{cv.titre_professionnel || ''}</span></p>
        </div>
        <div className="sidebar-contact">
          <h2 className="sidebar-section-title">CONTACT</h2>
          <p className="sidebar-item"><span data-cv-field="telephone" suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span></p>
          <p className="sidebar-item"><span data-cv-field="email" suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span></p>
          <p className="sidebar-item"><span data-cv-field="linkedin" suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span></p>
        </div>
        {techWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">COMPÉTENCES</h2>
            {(competences.techniques || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.techniques.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {logicielsWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">OUTILS</h2>
            {(competences.logiciels || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.logiciels.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {certifications.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">CERTIFICATIONS</h2>
            {certifications.map((cert, i) => {
              const oi = certificationsAll.indexOf(cert);
              return (
                <p key={cert.id || i} className="sidebar-item">
                  <span data-cv-field={`certifications.${oi}.nom`} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                  {' - '}<span data-cv-field={`certifications.${oi}.organisme`} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                  {' · '}<span data-cv-field={`certifications.${oi}.date`} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
                </p>
              );
            })}
          </div>
        )}
        {languesWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">LANGUES</h2>
            {(competences.langues || []).map((l, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.langues.${i}.langue`} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span> - <span data-cv-field={`competences.langues.${i}.niveau`} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span></p>)}
          </div>
        )}
        {autresWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">AUTRES</h2>
            {(competences.autres || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.autres.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {showMotsClesAts && (
          <div className="sidebar-section section-mots-cles-ats">
            <p className="mots-cles-ats-invisible" aria-hidden="true"><span data-cv-field="mots_cles_cache" suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span></p>
          </div>
        )}
      </div>
      <div className="cv-main">
        <section className="main-section section-resume">
          <h2 className="main-section-title">PROFIL</h2>
          <p className="resume-text"><span data-cv-field="resume" className={isChanged('resume') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.resume || ''}</span></p>
        </section>
        {experiences.length > 0 && (
          <section className="main-section section-experiences">
            <h2 className="main-section-title">EXPÉRIENCE PROFESSIONNELLE</h2>
            <div className="experiences-list">
              {experiences.slice(0, 6).map((exp, i) => {
                const oi = experiencesAll.indexOf(exp);
                return (
                  <div key={exp.id || i} className="experience-item">
                    <div className="exp-header">
                      <span className="exp-entreprise">
                        <span className="ats-label">Organisation : </span>
                        <span data-cv-field={`experiences.${oi}.entreprise`} className={isChanged(`experiences.${oi}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                      </span>
                      <span className="exp-dates">
                        <span data-cv-field={`experiences.${oi}.date_debut`} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                        {' - '}
                        <span data-cv-field={`experiences.${oi}.date_fin`} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                        {exp.lieu ? <> · <span data-cv-field={`experiences.${oi}.lieu`} suppressContentEditableWarning contentEditable="true">{exp.lieu || ''}</span></> : null}
                      </span>
                    </div>
                    <p className="exp-poste">
                      <span className="ats-label">Fonction : </span>
                      <span data-cv-field={`experiences.${oi}.poste`} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span>
                      {exp.secteur ? <> - <span data-cv-field={`experiences.${oi}.secteur`} suppressContentEditableWarning contentEditable="true">{exp.secteur || ''}</span></> : null}
                    </p>
                    {(exp.bullet_points || ['', '']).map((b, j) => <p key={j} className="bullet">- <span data-cv-field={`experiences.${oi}.bullet_points.${j}`} suppressContentEditableWarning contentEditable="true">{b || ''}</span></p>)}
                    {(exp.clients || '').trim() ? <p className="exp-clients">Clients : <span data-cv-field={`experiences.${oi}.clients`} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span></p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {formations.length > 0 && (
          <section className="main-section section-formation">
            <h2 className="main-section-title">FORMATION</h2>
            {formations.map((form, i) => {
              const oi = formationsAll.indexOf(form);
              return (
                <div key={form.id || i} className="formation-item">
                  <p className="formation-header">
                    <span className="formation-diplome"><span data-cv-field={`formations.${oi}.etablissement`} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span>{form.etablissement && form.diplome ? ' - ' : ''}<span data-cv-field={`formations.${oi}.diplome`} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span></span>
                    <span className="formation-date"><span data-cv-field={`formations.${oi}.date`} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span></span>
                  </p>
                  {form.mention ? <p className="formation-mention"><span data-cv-field={`formations.${oi}.mention`} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span></p> : null}
                </div>
              );
            })}
          </section>
        )}
        {projets.length > 0 && (
          <section className="main-section section-projets">
            <h2 className="main-section-title">PROJETS</h2>
            {projets.map((proj, i) => {
              const oi = projetsAll.indexOf(proj);
              return (
                <div key={proj.id || i} className="projet-item">
                  <p className="projet-nom"><span data-cv-field={`projets.${oi}.nom`} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span></p>
                  <p className="projet-description"><span data-cv-field={`projets.${oi}.description`} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span></p>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </article>
  );

  const rootVarsStyle = Object.keys(cssVarOverrides).length
    ? `:root { ${Object.entries(cssVarOverrides).map(([k, v]) => `${k}: ${v}`).join('; ')} }`
    : '';
  return (
    <div
      ref={containerRef}
      className={`cv-editable-preview cv-editable-preview--${contentDensity}`}
      style={cssVarOverrides}
      data-content-density={contentDensity}
      onBlur={handleBlur}
    >
      {rootVarsStyle ? <style dangerouslySetInnerHTML={{ __html: rootVarsStyle }} /> : null}
      {effectiveCss ? <style dangerouslySetInnerHTML={{ __html: effectiveCss }} /> : null}
      {(templateId === 'minimal') && renderMinimal()}
      {(templateId === 'modern') && renderModern()}
      {(templateId !== 'minimal' && templateId !== 'modern') && (
      <article className="cv cv-preview cv-editable">
        <header className="cv-header">
          <div className="header-top-row">
            {showPhoto && (
              <div className="header-photo">
                {(cv.photo_url || '').trim() ? (
                  <img
                    src={(cv.photo_url || '').startsWith('http') ? cv.photo_url : apiUrl('/api/assets/' + (cv.photo_url || '').replace(/^assets\//, ''))}
                    alt=""
                    onError={(e) => { if (isSupabaseSignedPhotoUrl(e.target?.src) && onPhotoSessionExpired) onPhotoSessionExpired(); }}
                  />
                ) : null}
              </div>
            )}
            <h1 className="header-nom">
              <span data-cv-field="prenom" className={isChanged('prenom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.prenom || ''}</span>
              {' '}
              <span data-cv-field="nom" className={isChanged('nom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.nom || ''}</span>
              {(cv.titre_professionnel || '').trim() ? (
                <>
                  <span className="header-titre-sep"> - </span>
                  <span className={`header-titre-inline ${isChanged('titre_professionnel') ? 'cv-changed' : ''}`} data-cv-field="titre_professionnel" suppressContentEditableWarning contentEditable="true">{cv.titre_professionnel || ''}</span>
                </>
              ) : (
                <span data-cv-field="titre_professionnel" className={`header-titre-inline cv-editable-empty ${isChanged('titre_professionnel') ? 'cv-changed' : ''}`} suppressContentEditableWarning contentEditable="true" title="Titre"> </span>
              )}
            </h1>
          </div>
          {(cv.resume || '').trim() ? (
            <p className="resume-text">
              <span data-cv-field="resume" className={isChanged('resume') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.resume || ''}</span>
            </p>
          ) : (
            <p className="resume-text" style={{ minHeight: '1.5em' }}>
              <span data-cv-field="resume" className={`cv-editable-empty ${isChanged('resume') ? 'cv-changed' : ''}`} suppressContentEditableWarning contentEditable="true" title="Résumé"> </span>
            </p>
          )}
          {((cv.telephone || '').trim() || (cv.email || '').trim() || (cv.linkedin || '').trim()) ? (
            <p className="header-contact">
              <span className="contact-icon"><HiPhone size={14} aria-hidden /></span>{' '}
              <span data-cv-field="telephone" className={isChanged('telephone') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span>
              <span className="contact-spacer"> </span>
              <span className="contact-icon"><HiEnvelope size={14} aria-hidden /></span>{' '}
              <span data-cv-field="email" className={isChanged('email') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span>
              {(cv.linkedin || '').trim() ? (
                <>
                  <span className="contact-spacer"> </span>
                  <span className="contact-icon"><HiLink size={14} aria-hidden /></span>{' '}
                  <span data-cv-field="linkedin" className={isChanged('linkedin') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span>
                </>
              ) : (
                <span data-cv-field="linkedin" className={`cv-editable-empty ${isChanged('linkedin') ? 'cv-changed' : ''}`} suppressContentEditableWarning contentEditable="true" title="Ajouter LinkedIn"> </span>
              )}
            </p>
          ) : (
            <p className="header-contact">
              <span data-cv-field="telephone" className="cv-editable-empty" suppressContentEditableWarning contentEditable="true" title="Téléphone"> </span>
              <span className="contact-spacer"> </span>
              <span data-cv-field="email" className="cv-editable-empty" suppressContentEditableWarning contentEditable="true" title="Email"> </span>
              <span className="contact-spacer"> </span>
              <span data-cv-field="linkedin" className="cv-editable-empty" suppressContentEditableWarning contentEditable="true" title="LinkedIn"> </span>
            </p>
          )}
        </header>

        <div className="cv-body">
          <div className="cv-main">
            {experiences.length > 0 && (
            <section className="section-experiences">
              <h2 className="section-title">EXPÉRIENCE PROFESSIONNELLE</h2>
              <div className="experiences-list">
                {(experiences.slice(0, 6)).map((exp, i) => {
                  const origIndex = experiencesAll.indexOf(exp);
                  return (
                  <div key={exp.id || i} className="experience-item">
                    <div className="exp-header">
                      <span className="exp-entreprise">
                        <span className="ats-label">Organisation : </span>
                        <span data-cv-field={`experiences.${origIndex}.entreprise`} className={isChanged(`experiences.${origIndex}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                      </span>
                      <span className="exp-dates">
                        <span data-cv-field={`experiences.${origIndex}.date_debut`} className={isChanged(`experiences.${origIndex}.date_debut`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                        {' - '}
                        <span data-cv-field={`experiences.${origIndex}.date_fin`} className={isChanged(`experiences.${origIndex}.date_fin`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                        {exp.lieu ? (
                          <> · <span data-cv-field={`experiences.${origIndex}.lieu`} className={isChanged(`experiences.${origIndex}.lieu`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.lieu || ''}</span></>
                        ) : (
                          <span data-cv-field={`experiences.${origIndex}.lieu`} className={`cv-editable-empty ${isChanged(`experiences.${origIndex}.lieu`) ? 'cv-changed' : ''}`} suppressContentEditableWarning contentEditable="true"> </span>
                        )}
                      </span>
                    </div>
                    <p className="exp-poste">
                      <span className="ats-label">Fonction : </span>
                      <span data-cv-field={`experiences.${origIndex}.poste`} className={isChanged(`experiences.${origIndex}.poste`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span>
                      {' - '}
                      <span data-cv-field={`experiences.${origIndex}.secteur`} className={isChanged(`experiences.${origIndex}.secteur`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.secteur || ''}</span>
                    </p>
                    {(exp.bullet_points || ['', '']).map((b, j) => (
                      <p key={j} className="bullet">
                        - <span data-cv-field={`experiences.${origIndex}.bullet_points.${j}`} className={isChanged(`experiences.${origIndex}.bullet_points.${j}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{b || ''}</span>
                      </p>
                    ))}
                    {(exp.clients || '').trim() ? (
                      <p className="exp-clients">Clients : <span data-cv-field={`experiences.${origIndex}.clients`} className={isChanged(`experiences.${origIndex}.clients`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span></p>
                    ) : null}
                  </div>
                );
                })}
              </div>
            </section>
            )}

            {formations.length > 0 && (
            <section className="section-formation">
              <h2 className="section-title">FORMATION</h2>
              {formations.map((form, i) => {
                const origIndex = formationsAll.indexOf(form);
                return (
                <div key={form.id || i} className="formation-item">
                  <p className="formation-header">
                    <span className="formation-diplome">
                      <span data-cv-field={`formations.${origIndex}.etablissement`} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span>
                      {' - '}
                      <span data-cv-field={`formations.${origIndex}.diplome`} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span>
                    </span>
                    <span className="formation-date">
                      <span data-cv-field={`formations.${origIndex}.date`} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span>
                    </span>
                  </p>
                  {form.mention ? (
                    <p className="formation-mention">
                      <span data-cv-field={`formations.${origIndex}.mention`} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span>
                    </p>
                  ) : null}
                </div>
              );
              })}
            </section>
            )}

            {projets.length > 0 && (
              <section className="section-projets">
                <h2 className="section-title">PROJETS</h2>
                {projets.map((proj, i) => {
                  const origIndex = projetsAll.indexOf(proj);
                  return (
                    <div key={proj.id || i} className="projet-item">
                      <p className="projet-nom">
                        <span data-cv-field={`projets.${origIndex}.nom`} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span>
                      </p>
                      <p className="projet-description">
                        <span data-cv-field={`projets.${origIndex}.description`} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span>
                      </p>
                    </div>
                  );
                })}
              </section>
            )}
          </div>

          <div className="cv-sidebar">
            {techWithContent.length > 0 && (
              <section className="section-sidebar">
                <h2 className="section-title">COMPÉTENCES</h2>
                <h3 className="sidebar-category">Compétences techniques</h3>
                {(competences.techniques || []).map((item, i) => (
                  <p key={i} className="sidebar-item">
                    <span data-cv-field={`competences.techniques.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                  </p>
                ))}
              </section>
            )}
            {logicielsWithContent.length > 0 && (
              <section className="section-sidebar">
                <h3 className="sidebar-category">Logiciels & outils</h3>
                {(competences.logiciels || []).map((item, i) => (
                  <p key={i} className="sidebar-item">
                    <span data-cv-field={`competences.logiciels.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                  </p>
                ))}
              </section>
            )}
            {certifications.length > 0 && (
              <section className="section-sidebar" id="certifications">
                <h3 className="sidebar-category">Certifications</h3>
                {certifications.map((cert, i) => {
                  const origIndex = certificationsAll.indexOf(cert);
                  return (
                    <p key={cert.id || i} className="sidebar-item">
                      <span data-cv-field={`certifications.${origIndex}.nom`} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                      {' - '}
                      <span data-cv-field={`certifications.${origIndex}.organisme`} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                      {' · '}
                      <span data-cv-field={`certifications.${origIndex}.date`} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
                    </p>
                  );
                })}
              </section>
            )}
            {languesWithContent.length > 0 && (
              <section className="section-sidebar">
                <h2 className="section-title">LANGUES</h2>
                {(competences.langues || []).map((l, i) => (
                  <p key={i} className="sidebar-item">
                    <span data-cv-field={`competences.langues.${i}.langue`} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span>
                    {' - '}
                    <span data-cv-field={`competences.langues.${i}.niveau`} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span>
                  </p>
                ))}
              </section>
            )}
            {autresWithContent.length > 0 && (
              <section className="section-sidebar">
                <h2 className="section-title">AUTRES</h2>
                {(competences.autres || []).map((item, i) => (
                  <p key={i} className="sidebar-item">
                    <span data-cv-field={`competences.autres.${i}`} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                  </p>
                ))}
              </section>
            )}
            {showMotsClesAts && ((cv.mots_cles_cache || '').trim() ? (
              <section className="section-sidebar section-mots-cles-ats" id="mots-cles-ats">
                <h3 className="sidebar-category mots-cles-ats-titre">Mots-clés ATS</h3>
                <p className="mots-cles-ats-invisible" aria-hidden="true">
                  <span data-cv-field="mots_cles_cache" className={isChanged('mots_cles_cache') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span>
                </p>
              </section>
            ) : (
              <section className="section-sidebar section-mots-cles-ats" id="mots-cles-ats">
                <h3 className="sidebar-category mots-cles-ats-titre">Mots-clés ATS</h3>
                <p className="mots-cles-ats-invisible" aria-hidden="true">
                  <span data-cv-field="mots_cles_cache" className={`cv-editable-empty ${isChanged('mots_cles_cache') ? 'cv-changed' : ''}`} suppressContentEditableWarning contentEditable="true" title="Sera rempli par l’IA à l’adaptation"> </span>
                </p>
              </section>
            ))}
          </div>
        </div>
      </article>
      )}
    </div>
  );
}
