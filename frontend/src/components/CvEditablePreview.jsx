import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HiPhone, HiEnvelope, HiLink } from 'react-icons/hi2';
import { apiUrl, apiGet } from '../api';
import { applyA4PageFramesInHost, teardownA4PageFramesInHost } from '../lib/cvPreviewA4Pages';
import { sanitizeCssForStyleTag } from '../lib/sanitizeCssForStyle';
import './CvEditablePreview.css';

/** Aligné sur le rendu serveur sans selection_a4 (main.py max_exp). */
const EDITABLE_PREVIEW_MAX_EXPERIENCES = 15;

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

/** Espaces unifiés + liaison des deux derniers « mots » (NBSP) pour limiter le dernier mot seul en sidebar (Modern/Créatif). Évite de lier un tiret seul. */
function normalizeTitleForCv(s) {
  if (s == null || typeof s !== 'string') return s;
  let t = s.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = t.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[parts.length - 2];
    const b = parts[parts.length - 1];
    if (a !== '-' && b !== '-' && a.length > 1 && b.length > 1) {
      return [...parts.slice(0, -2), `${a}\u00A0${b}`].join(' ');
    }
  }
  return t;
}

function isSupabaseSignedPhotoUrl(url) {
  return typeof url === 'string' && url.includes('supabase.co/storage') && url.includes('/object/sign');
}

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

/** Évite d’injecter du texte quasi blanc sur fond blanc (réglages typo). */
function isNearWhiteHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return false;
  return (r + g + b) / (3 * 255) > 0.92;
}
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
      if ((key === 'color_body' || key === 'color_section_title') && isNearWhiteHex(v)) continue;
      vars[cssVar] = v;
    }
  }
  const photoPx = opts.photo_size != null ? (typeof opts.photo_size === 'number' ? opts.photo_size : parseFloat(String(opts.photo_size).replace(',', '.'), 10)) : NaN;
  if (!Number.isNaN(photoPx) && photoPx >= 40 && photoPx <= 160) vars['--cv-photo-size'] = `${Math.round(photoPx)}px`;
  return vars;
}

/**
 * Barème typo « scale_css » : aligné sur backend/main.py _render_cv_html
 * (_ref = base_cv si fourni, sinon cv ; exp[:6], formations/projets[:5]).
 * L’iframe render-html applique ces tailles sur body ; l’aperçu éditable doit
 * utiliser le même ref et le même score pour que le nombre de pages A4 colle.
 */
function getTypographyScaleDensity(refCv) {
  const cv = refCv || {};
  const exps = (cv.experiences || []).slice(0, 6);
  const expRef = exps.filter(
    (e) =>
      (e?.poste || '').trim() ||
      (e?.entreprise || '').trim() ||
      (e?.bullet_points || []).some((b) => (b || '').trim()),
  );
  const bulletRef = expRef.reduce(
    (n, e) => n + (e?.bullet_points || []).filter((b) => (b || '').trim()).length,
    0,
  );
  const formRef = (cv.formations || [])
    .slice(0, 5)
    .filter(
      (f) =>
        (f?.diplome || '').trim() ||
        (f?.etablissement || '').trim() ||
        (f?.date || '').trim() ||
        (f?.mention || '').trim(),
    ).length;
  const projRef = (cv.projets || [])
    .slice(0, 5)
    .filter((p) => (p?.nom || '').trim() || (p?.description || '').trim()).length;
  const score = expRef.length * 3 + bulletRef + formRef + projRef;
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

export default function CvEditablePreview({
  cv,
  baseCv,
  onChange,
  templateId = 'minimal',
  templateOptions,
  showPhoto = true,
  showMotsClesAts = true,
  onPhotoSessionExpired,
  previewHtmlWithInlineCss,
  layoutRefreshKey = '',
}) {
  const containerRef = useRef(null);
  const [templateCss, setTemplateCss] = useState('');
  const cssVarOverrides = optionsToCssVars(templateOptions);
  const contentDensity = getTypographyScaleDensity(baseCv || cv);

  // Priorité 1 : CSS extrait du HTML de preview (render-html) pour éviter 404 en prod sur /api/templates/.../template.css
  const cssFromHtml = extractStylesFromHtml(previewHtmlWithInlineCss);
  const effectiveCss = sanitizeCssForStyleTag(
    (cssFromHtml && cssFromHtml.length > 0) ? cssFromHtml : templateCss,
  );

  // Fallback : charger le CSS par API (peut 404 en prod si la route n'est pas exposée)
  useEffect(() => {
    if (cssFromHtml && cssFromHtml.length > 0) return;
    let cancelled = false;
    setTemplateCss('');
    const tid = (templateId || 'minimal').trim();
    apiGet(`/api/templates/${tid}/template.css`)
      .then((css) => {
        if (!cancelled && typeof css === 'string') setTemplateCss(sanitizeCssForStyleTag(css));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [templateId, cssFromHtml]);

  useLayoutEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) return undefined;
    applyA4PageFramesInHost(wrap);
    return () => teardownA4PageFramesInHost(wrap);
  }, [templateId, effectiveCss, contentDensity, cv, previewHtmlWithInlineCss, layoutRefreshKey]);

  // Même rythme que l’iframe (App.jsx) : HTML / polices / layout peuvent se stabiliser après le premier paint.
  useEffect(() => {
    const wrap = containerRef.current;
    if (!wrap) return undefined;
    const run = () => applyA4PageFramesInHost(wrap);
    const t0 = window.setTimeout(run, 0);
    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 380);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [templateId, effectiveCss, contentDensity, cv, previewHtmlWithInlineCss, layoutRefreshKey]);

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
    if (typeof next.titre_professionnel === 'string') {
      next.titre_professionnel = normalizeTitleForCv(next.titre_professionnel);
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
            <span data-cv-field="telephone" className={isChanged('telephone') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span>
            {' · '}
            <span data-cv-field="email" className={isChanged('email') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span>
            {' · '}
            <span data-cv-field="linkedin" className={isChanged('linkedin') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span>
          </p>
        </div>
      </header>
      <div className="cv-body">
        <section className="section section-resume">
          <h2 className="section-title">Profil</h2>
          <p className="resume-text">
            <span data-cv-field="resume" className={isChanged('resume') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.resume || ''}</span>
          </p>
        </section>
        {experiences.length > 0 && (
          <section className="section">
            <h2 className="section-title">Expérience professionnelle</h2>
            {experiences.slice(0, EDITABLE_PREVIEW_MAX_EXPERIENCES).map((exp, i) => {
              const oi = experiencesAll.indexOf(exp);
              return (
                <div key={exp.id || i} className="experience-item">
                  <div className="exp-header">
                    <span className="exp-left">
                      <span className="exp-entreprise">
                        <span className="ats-label">Organisation : </span>
                        <span data-cv-field={`experiences.${oi}.entreprise`} className={isChanged(`experiences.${oi}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                      </span>
                      {exp.poste ? <> - <span className="exp-poste-inline"><span className="ats-label">Fonction : </span><span data-cv-field={`experiences.${oi}.poste`} className={isChanged(`experiences.${oi}.poste`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span></span></> : null}
                    </span>
                    <span className="exp-dates">
                      <span data-cv-field={`experiences.${oi}.date_debut`} className={isChanged(`experiences.${oi}.date_debut`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                      {' - '}
                      <span data-cv-field={`experiences.${oi}.date_fin`} className={isChanged(`experiences.${oi}.date_fin`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                    </span>
                  </div>
                  {(exp.bullet_points || ['', '']).map((b, j) => (
                    <p key={j} className="bullet">- <span data-cv-field={`experiences.${oi}.bullet_points.${j}`} className={isChanged(`experiences.${oi}.bullet_points.${j}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{b || ''}</span></p>
                  ))}
                  {(exp.clients || '').trim() ? <p className="exp-clients">Clients : <span data-cv-field={`experiences.${oi}.clients`} className={isChanged(`experiences.${oi}.clients`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span></p> : null}
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
                    <span className="formation-diplome"><span data-cv-field={`formations.${oi}.etablissement`} className={isChanged(`formations.${oi}.etablissement`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span> - <span data-cv-field={`formations.${oi}.diplome`} className={isChanged(`formations.${oi}.diplome`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span></span>
                    <span className="formation-date"><span data-cv-field={`formations.${oi}.date`} className={isChanged(`formations.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span></span>
                  </div>
                  {form.mention ? <p className="formation-mention"><span data-cv-field={`formations.${oi}.mention`} className={isChanged(`formations.${oi}.mention`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span></p> : null}
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
                <span key={i}><span data-cv-field={`competences.techniques.${i}`} className={isChanged(`competences.techniques.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{i < (competences.techniques || []).length - 1 ? ', ' : ''}</span>
              ))}
            </p>
            {logicielsWithContent.length > 0 && <p className="skills-line"><strong>Outils :</strong> {(competences.logiciels || []).map((item, i) => <span key={i}><span data-cv-field={`competences.logiciels.${i}`} className={isChanged(`competences.logiciels.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{i < (competences.logiciels || []).length - 1 ? ', ' : ''}</span>)}</p>}
          </section>
        )}
        {certifications.length > 0 && (
          <section className="section">
            <h2 className="section-title">Certifications</h2>
            {certifications.map((cert, i) => {
              const oi = certificationsAll.indexOf(cert);
              return (
                <p key={cert.id || i} className="cert-item">
                  <span data-cv-field={`certifications.${oi}.nom`} className={isChanged(`certifications.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                  {' - '}<span data-cv-field={`certifications.${oi}.organisme`} className={isChanged(`certifications.${oi}.organisme`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                  {' · '}<span data-cv-field={`certifications.${oi}.date`} className={isChanged(`certifications.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
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
                <span key={i}><span data-cv-field={`competences.langues.${i}.langue`} className={isChanged(`competences.langues.${i}.langue`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span> (<span data-cv-field={`competences.langues.${i}.niveau`} className={isChanged(`competences.langues.${i}.niveau`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span>){i < (competences.langues || []).length - 1 ? ', ' : ''}</span>
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
                  <span className="projet-nom"><span data-cv-field={`projets.${oi}.nom`} className={isChanged(`projets.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span></span>
                  {' - '}
                  <span className="projet-description"><span data-cv-field={`projets.${oi}.description`} className={isChanged(`projets.${oi}.description`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span></span>
                </div>
              );
            })}
          </section>
        )}
        {autresWithContent.length > 0 && (
          <section className="section">
            <h2 className="section-title">Autres</h2>
            <p className="skills-line">{(competences.autres || []).map((item, i) => <span key={i}><span data-cv-field={`competences.autres.${i}`} className={isChanged(`competences.autres.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>{(i < (competences.autres || []).length - 1) ? ', ' : ''}</span>)}</p>
          </section>
        )}
        {showMotsClesAts && (
          <div className="section-mots-cles-ats">
            <p className="mots-cles-ats-invisible" aria-hidden="true">
              <span data-cv-field="mots_cles_cache" className={isChanged('mots_cles_cache') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span>
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
          <p className="sidebar-titre"><span data-cv-field="titre_professionnel" className={isChanged('titre_professionnel') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.titre_professionnel || ''}</span></p>
        </div>
        <div className="sidebar-contact">
          <h2 className="sidebar-section-title">CONTACT</h2>
          <p className="sidebar-item"><span data-cv-field="telephone" className={isChanged('telephone') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span></p>
          <p className="sidebar-item"><span data-cv-field="email" className={isChanged('email') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span></p>
          <p className="sidebar-item"><span data-cv-field="linkedin" className={isChanged('linkedin') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span></p>
        </div>
        {techWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">COMPÉTENCES</h2>
            {(competences.techniques || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.techniques.${i}`} className={isChanged(`competences.techniques.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {logicielsWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">OUTILS</h2>
            {(competences.logiciels || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.logiciels.${i}`} className={isChanged(`competences.logiciels.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {certifications.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">CERTIFICATIONS</h2>
            {certifications.map((cert, i) => {
              const oi = certificationsAll.indexOf(cert);
              return (
                <p key={cert.id || i} className="sidebar-item">
                  <span data-cv-field={`certifications.${oi}.nom`} className={isChanged(`certifications.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                  {' - '}<span data-cv-field={`certifications.${oi}.organisme`} className={isChanged(`certifications.${oi}.organisme`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                  {' · '}<span data-cv-field={`certifications.${oi}.date`} className={isChanged(`certifications.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
                </p>
              );
            })}
          </div>
        )}
        {languesWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">LANGUES</h2>
            {(competences.langues || []).map((l, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.langues.${i}.langue`} className={isChanged(`competences.langues.${i}.langue`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span> - <span data-cv-field={`competences.langues.${i}.niveau`} className={isChanged(`competences.langues.${i}.niveau`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span></p>)}
          </div>
        )}
        {autresWithContent.length > 0 && (
          <div className="sidebar-section">
            <h2 className="sidebar-section-title">AUTRES</h2>
            {(competences.autres || []).map((item, i) => <p key={i} className="sidebar-item"><span data-cv-field={`competences.autres.${i}`} className={isChanged(`competences.autres.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span></p>)}
          </div>
        )}
        {showMotsClesAts && (
          <div className="sidebar-section section-mots-cles-ats">
            <p className="mots-cles-ats-invisible" aria-hidden="true"><span data-cv-field="mots_cles_cache" className={isChanged('mots_cles_cache') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span></p>
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
              {experiences.slice(0, EDITABLE_PREVIEW_MAX_EXPERIENCES).map((exp, i) => {
                const oi = experiencesAll.indexOf(exp);
                return (
                  <div key={exp.id || i} className="experience-item">
                    <div className="exp-header">
                      <span className="exp-entreprise">
                        <span className="ats-label">Organisation : </span>
                        <span data-cv-field={`experiences.${oi}.entreprise`} className={isChanged(`experiences.${oi}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                      </span>
                      <span className="exp-dates">
                        <span data-cv-field={`experiences.${oi}.date_debut`} className={isChanged(`experiences.${oi}.date_debut`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                        {' - '}
                        <span data-cv-field={`experiences.${oi}.date_fin`} className={isChanged(`experiences.${oi}.date_fin`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                        {exp.lieu ? <> · <span data-cv-field={`experiences.${oi}.lieu`} className={isChanged(`experiences.${oi}.lieu`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.lieu || ''}</span></> : null}
                      </span>
                    </div>
                    <p className="exp-poste">
                      <span className="ats-label">Fonction : </span>
                      <span data-cv-field={`experiences.${oi}.poste`} className={isChanged(`experiences.${oi}.poste`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span>
                      {exp.secteur ? <> - <span data-cv-field={`experiences.${oi}.secteur`} className={isChanged(`experiences.${oi}.secteur`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.secteur || ''}</span></> : null}
                    </p>
                    {(exp.bullet_points || ['', '']).map((b, j) => <p key={j} className="bullet">- <span data-cv-field={`experiences.${oi}.bullet_points.${j}`} className={isChanged(`experiences.${oi}.bullet_points.${j}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{b || ''}</span></p>)}
                    {(exp.clients || '').trim() ? <p className="exp-clients">Clients : <span data-cv-field={`experiences.${oi}.clients`} className={isChanged(`experiences.${oi}.clients`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span></p> : null}
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
                    <span className="formation-diplome"><span data-cv-field={`formations.${oi}.etablissement`} className={isChanged(`formations.${oi}.etablissement`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span>{form.etablissement && form.diplome ? ' - ' : ''}<span data-cv-field={`formations.${oi}.diplome`} className={isChanged(`formations.${oi}.diplome`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span></span>
                    <span className="formation-date"><span data-cv-field={`formations.${oi}.date`} className={isChanged(`formations.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span></span>
                  </p>
                  {form.mention ? <p className="formation-mention"><span data-cv-field={`formations.${oi}.mention`} className={isChanged(`formations.${oi}.mention`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span></p> : null}
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
                  <p className="projet-nom"><span data-cv-field={`projets.${oi}.nom`} className={isChanged(`projets.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span></p>
                  <p className="projet-description"><span data-cv-field={`projets.${oi}.description`} className={isChanged(`projets.${oi}.description`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span></p>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </article>
  );

  /* Même structure DOM que templates/elegant (une colonne, grilles de compétences). */
  const renderElegant = () => (
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
        <h1 className="header-nom">
          <span data-cv-field="prenom" className={isChanged('prenom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.prenom || ''}</span>
          {' '}
          <span data-cv-field="nom" className={isChanged('nom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.nom || ''}</span>
        </h1>
        <p className="header-titre">
          <span data-cv-field="titre_professionnel" className={isChanged('titre_professionnel') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.titre_professionnel || ''}</span>
        </p>
        <p className="header-contact">
          <span data-cv-field="telephone" className={isChanged('telephone') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.telephone || ''}</span>
          <span className="contact-sep">·</span>
          <span data-cv-field="email" className={isChanged('email') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.email || ''}</span>
          <span className="contact-sep">·</span>
          <span data-cv-field="linkedin" className={isChanged('linkedin') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.linkedin || ''}</span>
        </p>
      </header>
      <div className="cv-body">
        <section className="cv-section">
          <h2 className="section-title">Profil</h2>
          <p className="resume-text">
            <span data-cv-field="resume" className={isChanged('resume') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.resume || ''}</span>
          </p>
        </section>
        {experiences.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Expérience professionnelle</h2>
            {experiences.slice(0, EDITABLE_PREVIEW_MAX_EXPERIENCES).map((exp, i) => {
              const oi = experiencesAll.indexOf(exp);
              return (
                <div key={exp.id || i} className="experience-item">
                  <div className="exp-header">
                    <span className="exp-entreprise">
                      <span className="ats-label">Organisation : </span>
                      <span data-cv-field={`experiences.${oi}.entreprise`} className={isChanged(`experiences.${oi}.entreprise`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.entreprise || ''}</span>
                    </span>
                    <span className="exp-dates">
                      <span data-cv-field={`experiences.${oi}.date_debut`} className={isChanged(`experiences.${oi}.date_debut`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_debut || ''}</span>
                      {' - '}
                      <span data-cv-field={`experiences.${oi}.date_fin`} className={isChanged(`experiences.${oi}.date_fin`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.date_fin || ''}</span>
                      {exp.lieu ? <> · <span data-cv-field={`experiences.${oi}.lieu`} className={isChanged(`experiences.${oi}.lieu`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.lieu || ''}</span></> : null}
                    </span>
                  </div>
                  <p className="exp-poste">
                    <span className="ats-label">Fonction : </span>
                    <span data-cv-field={`experiences.${oi}.poste`} className={isChanged(`experiences.${oi}.poste`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.poste || ''}</span>
                    {exp.secteur ? <> - <span data-cv-field={`experiences.${oi}.secteur`} className={isChanged(`experiences.${oi}.secteur`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.secteur || ''}</span></> : null}
                  </p>
                  {(exp.bullet_points || ['', '']).map((b, j) => (
                    <p key={j} className="bullet">
                      <span data-cv-field={`experiences.${oi}.bullet_points.${j}`} className={isChanged(`experiences.${oi}.bullet_points.${j}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{b || ''}</span>
                    </p>
                  ))}
                  {(exp.clients || '').trim() ? (
                    <p className="exp-clients">
                      Clients : <span data-cv-field={`experiences.${oi}.clients`} className={isChanged(`experiences.${oi}.clients`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{exp.clients || ''}</span>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </section>
        )}
        {formations.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Formation</h2>
            {formations.map((form, i) => {
              const oi = formationsAll.indexOf(form);
              return (
                <div key={form.id || i} className="formation-item">
                  <div className="formation-header">
                    <span className="formation-diplome">
                      <span data-cv-field={`formations.${oi}.etablissement`} className={isChanged(`formations.${oi}.etablissement`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.etablissement || ''}</span>
                      {' - '}
                      <span data-cv-field={`formations.${oi}.diplome`} className={isChanged(`formations.${oi}.diplome`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.diplome || ''}</span>
                    </span>
                    <span className="formation-date"><span data-cv-field={`formations.${oi}.date`} className={isChanged(`formations.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.date || ''}</span></span>
                  </div>
                  {form.mention ? (
                    <p className="formation-mention"><span data-cv-field={`formations.${oi}.mention`} className={isChanged(`formations.${oi}.mention`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{form.mention || ''}</span></p>
                  ) : null}
                </div>
              );
            })}
          </section>
        )}
        {(techWithContent.length > 0 || logicielsWithContent.length > 0) && (
          <section className="cv-section">
            <h2 className="section-title">Compétences</h2>
            <div className="skills-grid">
              {(competences.techniques || []).map((item, i) => (
                <span key={`t-${i}`} className="skill-tag">
                  <span data-cv-field={`competences.techniques.${i}`} className={isChanged(`competences.techniques.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                </span>
              ))}
              {(competences.logiciels || []).map((item, i) => (
                <span key={`l-${i}`} className="skill-tag skill-tag--tool">
                  <span data-cv-field={`competences.logiciels.${i}`} className={isChanged(`competences.logiciels.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                </span>
              ))}
            </div>
          </section>
        )}
        {certifications.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Certifications</h2>
            {certifications.map((cert, i) => {
              const oi = certificationsAll.indexOf(cert);
              return (
                <p key={cert.id || i} className="cert-item">
                  <span data-cv-field={`certifications.${oi}.nom`} className={isChanged(`certifications.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.nom || ''}</span>
                  {' - '}
                  <span data-cv-field={`certifications.${oi}.organisme`} className={isChanged(`certifications.${oi}.organisme`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.organisme || ''}</span>
                  {' · '}
                  <span data-cv-field={`certifications.${oi}.date`} className={isChanged(`certifications.${oi}.date`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cert.date || ''}</span>
                </p>
              );
            })}
          </section>
        )}
        {languesWithContent.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Langues</h2>
            {(competences.langues || []).map((l, i) => (
              <p key={i} className="lang-item">
                <span data-cv-field={`competences.langues.${i}.langue`} className={isChanged(`competences.langues.${i}.langue`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.langue || ''}</span>
                {' - '}
                <span data-cv-field={`competences.langues.${i}.niveau`} className={isChanged(`competences.langues.${i}.niveau`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{l?.niveau || ''}</span>
              </p>
            ))}
          </section>
        )}
        {projets.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Projets</h2>
            {projets.map((proj, i) => {
              const oi = projetsAll.indexOf(proj);
              return (
                <div key={proj.id || i} className="projet-item">
                  <p className="projet-nom"><span data-cv-field={`projets.${oi}.nom`} className={isChanged(`projets.${oi}.nom`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.nom || ''}</span></p>
                  <p className="projet-description"><span data-cv-field={`projets.${oi}.description`} className={isChanged(`projets.${oi}.description`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{proj.description || ''}</span></p>
                </div>
              );
            })}
          </section>
        )}
        {autresWithContent.length > 0 && (
          <section className="cv-section">
            <h2 className="section-title">Autres</h2>
            <div className="skills-grid">
              {(competences.autres || []).map((item, i) => (
                <span key={i} className="skill-tag">
                  <span data-cv-field={`competences.autres.${i}`} className={isChanged(`competences.autres.${i}`) ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{typeof item === 'string' ? item : ''}</span>
                </span>
              ))}
            </div>
          </section>
        )}
        {showMotsClesAts && (
          <div className="section-mots-cles-ats">
            <p className="mots-cles-ats-invisible" aria-hidden="true">
              <span data-cv-field="mots_cles_cache" className={isChanged('mots_cles_cache') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.mots_cles_cache || ''}</span>
            </p>
          </div>
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
      className={`cv-editable-preview cv-preview cv-editable-preview--${contentDensity}`}
      style={cssVarOverrides}
      data-content-density={contentDensity}
      spellCheck={false}
      onBlur={handleBlur}
    >
      {rootVarsStyle ? <style dangerouslySetInnerHTML={{ __html: sanitizeCssForStyleTag(rootVarsStyle) }} /> : null}
      {effectiveCss ? <style dangerouslySetInnerHTML={{ __html: effectiveCss }} /> : null}
      {(templateId === 'minimal') && renderMinimal()}
      {(templateId === 'modern' || templateId === 'creative') && renderModern()}
      {(templateId === 'elegant') && renderElegant()}
      {(templateId !== 'minimal' && templateId !== 'modern' && templateId !== 'creative' && templateId !== 'elegant') && (
      <article className="cv cv-preview cv-editable cv-print-split">
      <header className="cv-header">
          <div className="header-top-row">
            {showPhoto && photoUrl && (
              <div className="header-photo">
                <img
                  src={photoUrl}
                  alt=""
                  onError={(e) => { if (isSupabaseSignedPhotoUrl(e.target?.src) && onPhotoSessionExpired) onPhotoSessionExpired(); }}
                />
              </div>
            )}
            <h1 className="header-nom">
              <span className="header-nom-part">
                <span data-cv-field="prenom" className={isChanged('prenom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.prenom || ''}</span>
                {' '}
                <span data-cv-field="nom" className={isChanged('nom') ? 'cv-changed' : ''} suppressContentEditableWarning contentEditable="true">{cv.nom || ''}</span>
              </span>
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
                {experiences.slice(0, EDITABLE_PREVIEW_MAX_EXPERIENCES).map((exp, i) => {
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
