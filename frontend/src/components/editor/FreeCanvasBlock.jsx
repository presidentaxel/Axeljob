import { useCallback, useEffect, useRef } from 'react';
// useRef also used by EditableRichText
import { HiEnvelope, HiLink, HiPhone, HiLockClosed } from 'react-icons/hi2';
import { apiUrl } from '../../api';
import {
  findCvArrayIndex,
  getFieldDisplayValue,
  isCanvasInlineEditableType,
  normalizeRichTextHtml,
  handleRichTextPaste,
  sanitizeRichTextHtml,
  fieldValueLooksLikeHtml,
} from '../../lib/canvasInlineEdit.js';
import {
  attachEditableFieldBehavior,
  getEditableFieldConfig,
} from '../../lib/editableFieldBehavior.js';
import {
  bindIncludesPath,
  identityNameEmptyLabel,
  resolveCompetenceList,
  resolveBoundText,
  resolveCertifications,
  resolveExperiences,
  resolveFormations,
  resolveLangues,
  resolvePhotoUrl,
  resolveProjets,
} from '../../lib/freeCanvasContent.js';
import { blockHasTypographyOverride, blockStyleToCss } from '../../lib/canvasBlockToolbar.js';
import { MM_TO_PX } from '../../lib/freeCanvasScale.js';
import { isAutoHeightBlockType, isNonSemanticBlockType } from '../../lib/cvLayoutModelV3.js';
import { getBlockDisplayName } from '../../lib/blockInspectorSchema.js';
import { useCanvasBlockAutoHeight } from '../../lib/useCanvasBlockAutoHeight.js';
import { isFloatingToolbarTarget, placeCaretAtPoint } from '../../lib/canvasCaret.js';
import { RESIZE_HANDLES } from '../../lib/freeCanvasResize.js';
import CanvasEditableField from './CanvasEditableField.jsx';
import CanvasIconGlyph from './CanvasIconGlyph.jsx';
import { isVectorShapeType } from '../../lib/canvasShapePresets.js';
import { blockEffectToCss } from '../../lib/canvasBlockEffects.js';
import { getBlockPdfFidelity } from '../../lib/canvasPdfFidelity.js';
import CanvasImageFrame from './CanvasImageFrame.jsx';
import CanvasShapeSvg from './CanvasShapeSvg.jsx';

const SECTION_LABELS = {
  experiences: 'Expérience professionnelle',
  formations: 'Formation',
  certifications: 'Certifications',
  projets: 'Projets',
  skills: 'Compétences',
  languages: 'Langues',
};

function photoSrc(cv) {
  const raw = resolvePhotoUrl(cv);
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  return apiUrl(`/api/assets/${raw.replace(/^assets\//, '')}`);
}

function BlockText({ children, className = '' }) {
  const text = typeof children === 'string' ? children : '';
  const richText = normalizeRichTextHtml(text);
  if (!text) return <span className={`free-canvas-block__empty ${className}`}> </span>;
  if (fieldValueLooksLikeHtml(richText)) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(richText) }} />;
  }
  return <span className={className}>{text}</span>;
}

function SectionHeading({ label, titleStyle, zone }) {
  if (!label) return null;
  const cls = [
    'free-canvas-block__section-title',
    titleStyle ? `free-canvas-block__section-title--${titleStyle}` : '',
    zone === 'sidebar' ? 'free-canvas-block__section-title--sidebar' : '',
  ].filter(Boolean).join(' ');
  return <h3 className={cls}>{label}</h3>;
}

function SidebarCategoryHeading({ label, titleStyle }) {
  if (!label) return null;
  const cls = [
    'free-canvas-block__sidebar-category',
    titleStyle ? `free-canvas-block__sidebar-category--${titleStyle}` : '',
  ].filter(Boolean).join(' ');
  return <h4 className={cls}>{label}</h4>;
}

function SemanticBlockBody({ block, cv, editing = false }) {
  const { type, bind, limit, style = {} } = block;
  const format = style.format || style.list_format || 'default';

  switch (type) {
    case 'identity': {
      const showPrenom = bindIncludesPath(bind, 'prenom');
      const showNom = bindIncludesPath(bind, 'nom');
      const showTitle = bindIncludesPath(bind, 'titre_professionnel');
      const prenom = showPrenom ? getFieldDisplayValue(cv, 'prenom') : '';
      const nom = showNom ? getFieldDisplayValue(cv, 'nom') : '';
      const title = showTitle ? getFieldDisplayValue(cv, 'titre_professionnel') : '';
      const inlineTitle = style.header_layout === 'inline-title';
      const nameBind = ['prenom', 'nom'].filter((p) => bindIncludesPath(bind, p));
      const nameEl = (showPrenom || showNom) ? (
        editing ? (
          <>
            {showPrenom ? (
              <CanvasEditableField path="prenom" editing className="free-canvas-block__inline-name">
                {prenom || 'Prénom'}
              </CanvasEditableField>
            ) : null}
            {showPrenom && showNom ? ' ' : null}
            {showNom ? (
              <CanvasEditableField path="nom" editing className="free-canvas-block__inline-name">
                {nom || 'Nom'}
              </CanvasEditableField>
            ) : null}
          </>
        ) : (
          <BlockText>
            {resolveBoundText(cv, nameBind) || identityNameEmptyLabel(bind)}
          </BlockText>
        )
      ) : null;
      // Slot titre toujours visible si bindé (placeholder si vide) — pas besoin de double-clic.
      const titleEl = showTitle ? (
        editing ? (
          <CanvasEditableField path="titre_professionnel" editing>
            {title || 'Titre professionnel'}
          </CanvasEditableField>
        ) : title ? (
          <BlockText>{title}</BlockText>
        ) : (
          <span className="free-canvas-block__field-placeholder">Titre professionnel</span>
        )
      ) : null;
      if (inlineTitle) {
        return (
          <h1
            className={[
              'free-canvas-block__identity',
              'free-canvas-block__identity--inline-title',
              style.identity_divider ? 'free-canvas-block__identity--divider' : '',
            ].filter(Boolean).join(' ')}
          >
            {nameEl ? <span className="free-canvas-block__identity-name">{nameEl}</span> : null}
            {nameEl && titleEl ? (
              <span className="free-canvas-block__identity-sep"> - </span>
            ) : null}
            {titleEl ? (
              <span className="free-canvas-block__identity-title free-canvas-block__identity-title--accent">
                {titleEl}
              </span>
            ) : null}
          </h1>
        );
      }
      return (
        <div className={`free-canvas-block__identity${style.identity_divider ? ' free-canvas-block__identity--divider' : ''}`}>
          {nameEl ? (
            <div className="free-canvas-block__identity-name" style={{ textAlign: style.align || 'left' }}>
              {nameEl}
            </div>
          ) : null}
          {titleEl ? (
            <div
              className={
                style.title_accent
                  ? 'free-canvas-block__identity-title free-canvas-block__identity-title--accent'
                  : 'free-canvas-block__identity-title'
              }
            >
              {titleEl}
            </div>
          ) : null}
        </div>
      );
    }
    case 'photo': {
      const src = photoSrc(cv);
      if (!src) {
        return <div className="free-canvas-block__photo-placeholder" aria-hidden="true" />;
      }
      return (
        <CanvasImageFrame
          blockW={block.w}
          blockH={block.h}
          style={style}
          src={src}
          imgClassName="free-canvas-block__photo"
        />
      );
    }
    case 'contact': {
      const showTel = bindIncludesPath(bind, 'telephone');
      const showEmail = bindIncludesPath(bind, 'email');
      const showLinkedin = bindIncludesPath(bind, 'linkedin');
      const tel = showTel ? getFieldDisplayValue(cv, 'telephone') : '';
      const email = showEmail ? getFieldDisplayValue(cv, 'email') : '';
      const linkedin = showLinkedin ? getFieldDisplayValue(cv, 'linkedin') : '';
      const showIcons = Boolean(style.contact_icons);
      const contactCls = [
        'free-canvas-block__contact',
        style.contact_divider ? 'free-canvas-block__contact--divider' : '',
        style.contact_uppercase ? 'free-canvas-block__contact--uppercase' : '',
        showIcons ? 'free-canvas-block__contact--icons' : '',
        style.contact_layout === 'header-bar' ? 'free-canvas-block__contact--header-bar' : '',
      ].filter(Boolean).join(' ');

      const renderContactValue = (path, value, placeholder) => {
        if (editing) {
          return <CanvasEditableField path={path} editing>{value || placeholder}</CanvasEditableField>;
        }
        if (value) return <BlockText>{value}</BlockText>;
        return <span className="free-canvas-block__field-placeholder">{placeholder}</span>;
      };
      const maybeIcon = (Icon) => (
        showIcons ? <Icon size={12} className="free-canvas-block__contact-icon" aria-hidden /> : null
      );

      if (style.contact_layout === 'header-bar') {
        const segments = [];
        if (showTel) {
          segments.push(
            <span key="tel" className="free-canvas-block__contact-segment">
              {maybeIcon(HiPhone)}
              {showIcons ? ' ' : null}
              {renderContactValue('telephone', tel, 'Téléphone')}
            </span>,
          );
        }
        if (showEmail) {
          segments.push(
            <span key="email" className="free-canvas-block__contact-segment">
              {maybeIcon(HiEnvelope)}
              {showIcons ? ' ' : null}
              {renderContactValue('email', email, 'Email')}
            </span>,
          );
        }
        if (showLinkedin) {
          segments.push(
            <span key="linkedin" className="free-canvas-block__contact-segment">
              {maybeIcon(HiLink)}
              {showIcons ? ' ' : null}
              {renderContactValue('linkedin', linkedin, 'LinkedIn')}
            </span>,
          );
        }
        return (
          <p className={contactCls}>
            {segments.map((seg, i) => (
              <span key={seg.key}>
                {i > 0 ? <span className="free-canvas-block__contact-spacer"> </span> : null}
                {seg}
              </span>
            ))}
          </p>
        );
      }
      return (
        <div className={contactCls}>
          {style.section_label ? (
            <SectionHeading label={style.section_label} titleStyle={style.title_style} zone={style.zone} />
          ) : null}
          {showTel ? (
            <p>
              {maybeIcon(HiPhone)}
              {showIcons ? ' ' : null}
              {renderContactValue('telephone', tel, 'Téléphone')}
            </p>
          ) : null}
          {showEmail ? (
            <p>
              {maybeIcon(HiEnvelope)}
              {showIcons ? ' ' : null}
              {renderContactValue('email', email, 'Email')}
            </p>
          ) : null}
          {showLinkedin ? (
            <p>
              {maybeIcon(HiLink)}
              {showIcons ? ' ' : null}
              {renderContactValue('linkedin', linkedin, 'LinkedIn')}
            </p>
          ) : null}
        </div>
      );
    }
    case 'resume': {
      const resumeBind = bind?.length ? bind : 'resume';
      const resumePath = Array.isArray(resumeBind) ? (resumeBind[0] || 'resume') : resumeBind;
      const resumeText = resolveBoundText(cv, resumeBind);
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || 'PROFIL'}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          <p className="free-canvas-block__resume">
            {editing ? (
              <CanvasEditableField path={resumePath} editing tag="span">
                {resumeText || 'Résumé professionnel'}
              </CanvasEditableField>
            ) : resumeText ? (
              <BlockText>{resumeText}</BlockText>
            ) : (
              <span className="free-canvas-block__field-placeholder">Résumé professionnel</span>
            )}
          </p>
        </div>
      );
    }
    case 'experiences': {
      const items = resolveExperiences(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Expériences</p>;
      const boldExp = style.exp_style === 'bold';
      return (
        <div className={`free-canvas-block__section-list${boldExp ? ' free-canvas-block__section-list--bold-exp' : ''}`}>
          <SectionHeading
            label={style.section_label || SECTION_LABELS.experiences}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          {items.map((exp, i) => {
            const idx = findCvArrayIndex(cv, 'experiences', exp);
            if (idx < 0) return null;
            const dateParts = [exp.date_debut, exp.date_fin].filter(Boolean).join(' – ');
            const dateLine = [dateParts, exp.lieu].filter(Boolean).join(' · ');
            return (
              <div
                key={exp.id || i}
                className={`free-canvas-block__exp${format === 'compact' ? ' free-canvas-block__exp--compact' : ''}${boldExp ? ' free-canvas-block__exp--bold' : ''}`}
              >
                <div className="free-canvas-block__exp-header">
                  <span className="free-canvas-block__exp-entreprise">
                    {boldExp ? <span className="free-canvas-block__ats-label">Organisation : </span> : null}
                    {editing ? (
                      <CanvasEditableField path={`experiences.${idx}.entreprise`} editing tag="strong">
                        {exp.entreprise || exp.poste || 'Organisation'}
                      </CanvasEditableField>
                    ) : (
                      <strong>{exp.entreprise || exp.poste}</strong>
                    )}
                  </span>
                  {(editing || dateLine) && (
                    <span className="free-canvas-block__exp-dates">
                      {editing ? (
                        <>
                          <CanvasEditableField path={`experiences.${idx}.date_debut`} editing>
                            {exp.date_debut || 'Début'}
                          </CanvasEditableField>
                          {' – '}
                          <CanvasEditableField path={`experiences.${idx}.date_fin`} editing>
                            {exp.date_fin || 'Fin'}
                          </CanvasEditableField>
                          {' · '}
                          <CanvasEditableField path={`experiences.${idx}.lieu`} editing>
                            {exp.lieu || 'Lieu'}
                          </CanvasEditableField>
                        </>
                      ) : (
                        dateLine
                      )}
                    </span>
                  )}
                </div>
                {(editing || exp.poste) ? (
                  <p className="free-canvas-block__exp-role">
                    {boldExp ? <span className="free-canvas-block__ats-label">Fonction : </span> : null}
                    {editing ? (
                      <CanvasEditableField path={`experiences.${idx}.poste`} editing>
                        {exp.poste || 'Poste'}
                      </CanvasEditableField>
                    ) : (
                      exp.poste
                    )}
                  </p>
                ) : null}
                {(editing || (exp.clients || '').trim()) ? (
                  <p className="free-canvas-block__exp-clients">
                    Clients :{' '}
                    {editing ? (
                      <CanvasEditableField path={`experiences.${idx}.clients`} editing>
                        {exp.clients || 'Clients'}
                      </CanvasEditableField>
                    ) : (
                      exp.clients
                    )}
                  </p>
                ) : null}
                <ul className="free-canvas-block__bullets">
                  {(exp.bullet_points || []).filter((b) => editing || (b || '').trim()).map((b, j) => (
                    <li key={j}>
                      {editing ? (
                        <CanvasEditableField path={`experiences.${idx}.bullet_points.${j}`} editing tag="span">
                          {(b || '').trim() || 'Point clé'}
                        </CanvasEditableField>
                      ) : (
                        b
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      );
    }
    case 'formations': {
      const items = resolveFormations(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Formations</p>;
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || SECTION_LABELS.formations}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          {items.map((f, i) => {
            const idx = findCvArrayIndex(cv, 'formations', f);
            if (idx < 0) return null;
            return (
              <p key={f.id || i} className="free-canvas-block__formation-line">
                {editing ? (
                  <>
                    <CanvasEditableField path={`formations.${idx}.diplome`} editing tag="strong">
                      {f.diplome || 'Diplôme'}
                    </CanvasEditableField>
                    {' - '}
                    <CanvasEditableField path={`formations.${idx}.etablissement`} editing>
                      {f.etablissement || 'Établissement'}
                    </CanvasEditableField>
                    {' ('}
                    <CanvasEditableField path={`formations.${idx}.date`} editing>
                      {f.date || 'Année'}
                    </CanvasEditableField>
                    {')'}
                  </>
                ) : (
                  <>
                    <strong>{f.diplome || f.etablissement}</strong>
                    {f.etablissement && f.diplome ? ` - ${f.etablissement}` : ''}
                    {f.date ? <span className="free-canvas-block__formation-date"> ({f.date})</span> : null}
                  </>
                )}
              </p>
            );
          })}
        </div>
      );
    }
    case 'certifications': {
      const items = resolveCertifications(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Certifications</p>;
      const catOnly = style.sidebar_category && !style.section_label;
      return (
        <div className="free-canvas-block__section-list">
          {catOnly ? (
            <SidebarCategoryHeading label={style.sidebar_category} titleStyle={style.title_style} />
          ) : (
            <SectionHeading
              label={style.section_label || SECTION_LABELS.certifications}
              titleStyle={style.title_style}
              zone={style.zone}
            />
          )}
          {items.map((c, i) => {
            const idx = findCvArrayIndex(cv, 'certifications', c);
            if (idx < 0) return null;
            return editing ? (
              <p key={c.id || i}>
                <CanvasEditableField path={`certifications.${idx}.nom`} editing>{c.nom || 'Nom'}</CanvasEditableField>
                {' · '}
                <CanvasEditableField path={`certifications.${idx}.organisme`} editing>{c.organisme || 'Organisme'}</CanvasEditableField>
                {' · '}
                <CanvasEditableField path={`certifications.${idx}.date`} editing>{c.date || 'Date'}</CanvasEditableField>
              </p>
            ) : (
              <p key={c.id || i} className="free-canvas-block__sidebar-item">{[c.nom, c.organisme, c.date].filter(Boolean).join(' · ')}</p>
            );
          })}
        </div>
      );
    }
    case 'projets': {
      const items = resolveProjets(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Projets</p>;
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || SECTION_LABELS.projets}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          {items.map((p, i) => {
            const idx = findCvArrayIndex(cv, 'projets', p);
            if (idx < 0) return null;
            return editing ? (
              <p key={p.id || i}>
                <CanvasEditableField path={`projets.${idx}.nom`} editing tag="strong">{p.nom || 'Projet'}</CanvasEditableField>
                {' - '}
                <CanvasEditableField path={`projets.${idx}.description`} editing>{p.description || 'Description'}</CanvasEditableField>
              </p>
            ) : (
              <p key={p.id || i}><strong>{p.nom}</strong>{p.description ? ` - ${p.description}` : ''}</p>
            );
          })}
        </div>
      );
    }
    case 'skills': {
      const items = resolveCompetenceList(cv, bind);
      if (items.length === 0 && !style.section_label && !style.sidebar_category) {
        return <p className="free-canvas-block__placeholder">Compétences</p>;
      }
      const chips = format === 'chips';
      const asList = format === 'list' || style.list_format === 'list';
      return (
        <div className="free-canvas-block__section-list">
          {style.section_label ? (
            <SectionHeading label={style.section_label} titleStyle={style.title_style} zone={style.zone} />
          ) : null}
          {style.sidebar_category ? (
            <SidebarCategoryHeading label={style.sidebar_category} titleStyle={style.title_style} />
          ) : null}
          {chips ? (
            <div className="free-canvas-block__chips">
              {items.map((s, i) => <span key={i} className="free-canvas-block__chip">{s}</span>)}
            </div>
          ) : asList ? (
            items.map((s, i) => <p key={i} className="free-canvas-block__sidebar-item">{s}</p>)
          ) : (
            <p>{items.join(', ')}</p>
          )}
        </div>
      );
    }
    case 'languages': {
      const items = resolveLangues(cv);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Langues</p>;
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || SECTION_LABELS.languages}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          {items.map((l, i) => (
            <p key={i} className="free-canvas-block__sidebar-item">
              {`${l.langue}${l.niveau ? ` - ${l.niveau}` : ''}`}
            </p>
          ))}
        </div>
      );
    }
    default:
      return <p className="free-canvas-block__placeholder">{type}</p>;
  }
}

function EditableRichText({ tag, className, style, editing, html, onAutoHeight }) {
  const Tag = tag;
  const ref = useRef(null);
  const richHtml = sanitizeRichTextHtml(normalizeRichTextHtml(html || ''));
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.innerHTML = richHtml;
    }
  }, [editing, richHtml]);

  const reportHeight = () => {
    if (!editing || !ref.current || typeof onAutoHeight !== 'function') return;
    const padMm = 3;
    const hMm = ref.current.scrollHeight / MM_TO_PX + padMm;
    onAutoHeight(hMm);
  };

  useEffect(() => {
    if (editing) reportHeight();
  }, [editing]);

  if (editing) {
    return (
      <Tag
        ref={ref}
        className={className}
        style={style}
        contentEditable
        suppressContentEditableWarning
        data-canvas-block-content="1"
        onInput={reportHeight}
        onPaste={handleRichTextPaste}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <Tag
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: richHtml }}
    />
  );
}

function inlineTypographyStyle(style = {}) {
  const css = {};
  if (style.font_size != null) css.fontSize = `${style.font_size}pt`;
  if (style.font_family) css.fontFamily = style.font_family;
  if (style.color) css.color = style.color;
  if (style.color_body) css.color = style.color_body;
  if (style.bold) css.fontWeight = '700';
  if (style.italic || style.font_style === 'italic') css.fontStyle = 'italic';
  const deco = [];
  if (style.underline) deco.push('underline');
  if (style.strikethrough) deco.push('line-through');
  if (deco.length) css.textDecoration = deco.join(' ');
  // Import "copie fidèle" : une ligne PDF reste sur une ligne (pas de wrap qui
  // chevaucherait le bloc suivant, les positions étant figées).
  if (style.nowrap) css.whiteSpace = 'nowrap';
  return css;
}

function NonSemanticBlockBody({ block, editing = false, onAutoHeight }) {
  const { type, content = '', style = {} } = block;
  switch (type) {
    case 'text': {
      const textStyle = {
        ...inlineTypographyStyle(style),
        textAlign: style.align || 'left',
        opacity: style.opacity ?? 1,
        margin: 0,
        minHeight: '1em',
        height: 'auto',
        overflow: 'visible',
      };
      return (
        <EditableRichText
          tag="p"
          className={
            editing
              ? 'free-canvas-block__text free-canvas-block__text--editing'
              : 'free-canvas-block__text'
          }
          style={textStyle}
          editing={editing}
          html={content || 'Texte libre'}
          onAutoHeight={onAutoHeight}
        />
      );
    }
    case 'title': {
      const titleStyle = {
        ...inlineTypographyStyle(style),
        textAlign: style.align || 'left',
        opacity: style.opacity ?? 1,
        margin: 0,
        height: 'auto',
        overflow: 'visible',
      };
      return (
        <EditableRichText
          tag="h3"
          className={
            editing
              ? 'free-canvas-block__title free-canvas-block__title--editing'
              : 'free-canvas-block__title'
          }
          style={titleStyle}
          editing={editing}
          html={content || 'Titre'}
          onAutoHeight={onAutoHeight}
        />
      );
    }
    case 'image': {
      const src = block.image_src;
      if (!src) {
        return <div className="free-canvas-block__image-placeholder">Image</div>;
      }
      return (
        <CanvasImageFrame
          blockW={block.w}
          blockH={block.h}
          style={style}
          src={src}
          imgClassName="free-canvas-block__image"
        />
      );
    }
    case 'shape:line': {
      const stroke = style.stroke_width ?? block.h ?? 0.6;
      const vertical = style.orientation === 'vertical' || ((block.w ?? 0) < (block.h ?? 0) && (block.w ?? 0) <= 2.5);
      if (vertical) {
        return (
          <div
            className="free-canvas-block__shape-line free-canvas-block__shape-line--vertical"
            style={{
              backgroundColor: style.color || '#1e293b',
              width: `${stroke}mm`,
              minWidth: '1px',
              height: '100%',
              marginLeft: `${Math.max(0, ((block.w || stroke) - stroke) / 2)}mm`,
              opacity: style.opacity ?? 1,
            }}
            role="presentation"
          />
        );
      }
      return (
        <div
          className="free-canvas-block__shape-line"
          style={{
            backgroundColor: style.color || '#1e293b',
            height: `${stroke}mm`,
            minHeight: '1px',
            marginTop: `${Math.max(0, ((block.h || stroke) - stroke) / 2)}mm`,
            opacity: style.opacity ?? 1,
          }}
          role="presentation"
        />
      );
    }
    case 'shape:rect':
      return (
        <div
          className="free-canvas-block__shape-rect"
          style={{
            backgroundColor: style.color || style.bg || '#e2e8f0',
            opacity: style.opacity ?? 1,
          }}
          role="presentation"
        />
      );
    case 'icon':
      return (
        <div className="free-canvas-block__icon" aria-hidden="true">
          {block.icon_name ? (
            <CanvasIconGlyph name={block.icon_name} color={style.color || '#1e293b'} size="100%" />
          ) : (
            <span className="free-canvas-block__icon--empty">Icône</span>
          )}
        </div>
      );
    case 'qrcode':
      return (
        <div
          className={
            block.target_url
              ? 'free-canvas-block__qrcode'
              : 'free-canvas-block__qrcode free-canvas-block__qrcode--empty'
          }
          title={block.target_url || 'QR code'}
        >
          QR
        </div>
      );
    default:
      if (isVectorShapeType(type)) {
        return (
          <div
            className="free-canvas-block__shape-vector"
            role="presentation"
          >
            <CanvasShapeSvg type={type} style={style} />
          </div>
        );
      }
      return null;
  }
}

function blockClassName({ selected, dragging, resizing, interactable, editing, locked }) {
  const parts = ['free-canvas-block'];
  if (interactable) parts.push('free-canvas-block--interactive');
  if (selected) parts.push('free-canvas-block--selected');
  if (editing) parts.push('free-canvas-block--editing');
  if (locked) parts.push('free-canvas-block--locked');
  if (dragging) parts.push('free-canvas-block--dragging');
  if (resizing) parts.push('free-canvas-block--resizing');
  return parts.join(' ');
}

/**
 * Rendu d un bloc layout v3 (position absolue en mm sur la page).
 * P4.1 : double-clic pour edition inline (contentEditable).
 */
export default function FreeCanvasBlock({
  block,
  cv,
  selected = false,
  editing = false,
  dragging = false,
  resizing = false,
  interactable = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizePointerCancel,
  onDoubleClickEdit,
  onImageEdit,
  onInnerBlur,
  onBlockElementRef,
  onBlockAutoHeight,
  onSelect,
  locked = false,
}) {
  const innerRef = useRef(null);
  const validBlock = block && typeof block === 'object';
  const id = validBlock ? block.id : undefined;
  const type = validBlock ? block.type : undefined;
  const x = validBlock ? block.x : 0;
  const y = validBlock ? block.y : 0;
  const w = validBlock ? block.w : 0;
  const h = validBlock ? block.h : 0;
  const z = validBlock ? block.z : 0;
  const blockStyle = validBlock ? block.style : undefined;
  const autoHeight = validBlock && isAutoHeightBlockType(type);

  const reportHeight = useCallback((newHmm) => {
    if (!autoHeight || typeof onBlockAutoHeight !== 'function' || !id) return;
    if (Math.abs(newHmm - (h ?? 0)) < 0.4) return;
    onBlockAutoHeight(id, newHmm);
  }, [autoHeight, id, h, onBlockAutoHeight]);

  const contentKey = autoHeight ? cv : id;

  useCanvasBlockAutoHeight({
    innerRef,
    enabled: autoHeight,
    blockId: id,
    contentKey,
    onReportHeight: reportHeight,
  });

  useEffect(() => {
    if (!editing || !innerRef.current) return undefined;
    const cleanups = [];
    innerRef.current.querySelectorAll('[data-cv-field]').forEach((el) => {
      const path = el.getAttribute('data-cv-field');
      if (!path) return;
      cleanups.push(attachEditableFieldBehavior(el, getEditableFieldConfig(path)));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [editing, id]);

  if (!validBlock) return null;

  const innerTypography = blockStyleToCss(blockStyle);
  const typographyOverride = blockHasTypographyOverride(blockStyle);
  const zone = blockStyle?.zone;
  const isNonSemantic = isNonSemanticBlockType(type);
  const canEdit = isCanvasInlineEditableType(type);
  const supportsBlockEffects = isNonSemantic && (
    type === 'shape:rect'
    || type === 'shape:line'
    || type === 'icon'
    || isVectorShapeType(type)
  );
  const blockEffectStyle = supportsBlockEffects
    ? blockEffectToCss(blockStyle?.effect, blockStyle)
    : {};
  const pdfFidelity = interactable ? getBlockPdfFidelity(block, cv) : { level: 'ok', reason: '' };
  const showPdfFidelityBadge = pdfFidelity.level !== 'ok';

  const handlePointerDown = (e) => {
    if (editing) return;
    if (interactable && onPointerDown) onPointerDown(e, block);
  };

  const handleDoubleClick = (e) => {
    if (!interactable) return;
    e.stopPropagation();
    if ((type === 'image' || type === 'photo') && typeof onImageEdit === 'function') {
      onImageEdit(block.id);
      return;
    }
    if (!canEdit) return;
    if (typeof onDoubleClickEdit === 'function') onDoubleClickEdit(block.id);
  };

  const handleInnerPointerDown = (e) => {
    if (!editing) return;
    e.stopPropagation();
    requestAnimationFrame(() => {
      placeCaretAtPoint(innerRef.current, e.clientX, e.clientY);
    });
  };

  const handleInnerBlur = (e) => {
    if (!editing || typeof onInnerBlur !== 'function') return;
    const next = e.relatedTarget;
    if (next && innerRef.current?.contains(next)) return;
    if (isFloatingToolbarTarget(next)) return;
    const blockEl = innerRef.current?.closest?.('[data-block-id]');
    if (next && blockEl?.contains(next)) return;
    onInnerBlur(block.id, innerRef.current);
  };

  const handleFocus = () => {
    if (!interactable || editing) return;
    if (typeof onSelect === 'function') onSelect(block.id);
  };

  const handleKeyDown = (e) => {
    if (!interactable || editing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if ((type === 'image' || type === 'photo') && typeof onImageEdit === 'function') {
        onImageEdit(block.id);
        return;
      }
      if (canEdit && typeof onDoubleClickEdit === 'function') {
        onDoubleClickEdit(block.id);
      }
    }
  };

  const a11yName = getBlockDisplayName(block);
  const a11yLabel = [
    a11yName,
    selected ? 'sélectionné' : null,
    locked ? 'verrouillé' : null,
    'Flèches pour déplacer, Suppr pour supprimer, Entrée pour éditer.',
  ].filter(Boolean).join('. ');

  return (
    <div
      ref={(el) => {
        if (typeof onBlockElementRef === 'function') onBlockElementRef(block.id, el);
      }}
      className={blockClassName({ selected, dragging, resizing, interactable, editing, locked })}
      data-block-id={id}
      data-block-type={type}
      tabIndex={interactable && !editing ? 0 : undefined}
      aria-label={interactable ? a11yLabel : undefined}
      aria-disabled={interactable && locked ? true : undefined}
      style={{
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${w}mm`,
        height: `${h}mm`,
        zIndex: dragging || resizing || editing ? 9999 : z,
        ...blockEffectStyle,
      }}
      title={
        editing
          ? 'Mode texte - Échap pour quitter'
          : interactable
            ? `${a11yName} - double-clic ou Entrée pour éditer`
            : type
      }
      onFocus={interactable && !editing ? handleFocus : undefined}
      onKeyDown={interactable && !editing ? handleKeyDown : undefined}
      onPointerDown={interactable && !editing ? handlePointerDown : undefined}
      onPointerMove={interactable && !editing && onPointerMove ? onPointerMove : undefined}
      onPointerUp={interactable && !editing && onPointerUp ? onPointerUp : undefined}
      onPointerCancel={interactable && !editing && onPointerCancel ? onPointerCancel : undefined}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={innerRef}
        className={[
          'free-canvas-block__inner',
          zone ? `free-canvas-block__inner--zone-${zone}` : '',
          typographyOverride ? 'free-canvas-block__inner--typography' : '',
          editing ? 'free-canvas-block__inner--editing' : '',
          autoHeight ? 'free-canvas-block__inner--content-fit' : '',
          supportsBlockEffects ? 'free-canvas-block__inner--shape-effects' : '',
        ].filter(Boolean).join(' ')}
        style={innerTypography}
        onPointerDown={editing ? handleInnerPointerDown : undefined}
        onBlur={editing ? handleInnerBlur : undefined}
      >
        {isNonSemantic
          ? (
            <NonSemanticBlockBody
              block={block}
              editing={editing}
              onAutoHeight={autoHeight ? reportHeight : undefined}
            />
          )
          : <SemanticBlockBody block={block} cv={cv} editing={editing} />}
      </div>
      {locked && (
        <span className="free-canvas-block__lock-badge" title="Position verrouillée - utilisez la barre d’actions pour déverrouiller" aria-hidden>
          <HiLockClosed size={12} />
        </span>
      )}
      {showPdfFidelityBadge && (
        <span
          className={`free-canvas-block__pdf-fidelity-badge free-canvas-block__pdf-fidelity-badge--${pdfFidelity.level}`}
          title={pdfFidelity.reason || 'Export PDF partiel pour ce bloc'}
          aria-label={pdfFidelity.reason || 'Export PDF partiel pour ce bloc'}
          onPointerDown={(e) => e.stopPropagation()}
        >
          PDF
        </span>
      )}
      {selected && interactable && !editing && !locked && onResizePointerDown && (
        <div className="free-canvas-resize-handles" aria-hidden="true">
          {(autoHeight ? ['e', 'w'] : RESIZE_HANDLES).map((handle) => (
            <span
              key={handle}
              className={`free-canvas-resize-handle free-canvas-resize-handle--${handle}`}
              data-resize-handle={handle}
              title={autoHeight
                ? 'Hauteur automatique selon le contenu - redimensionnez en largeur uniquement'
                : undefined}
              onPointerDown={(e) => onResizePointerDown(e, block, handle)}
              onPointerMove={onResizePointerMove || undefined}
              onPointerUp={onResizePointerUp || undefined}
              onPointerCancel={onResizePointerCancel || onResizePointerUp || undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
