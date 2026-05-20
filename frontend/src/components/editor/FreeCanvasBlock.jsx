import { useEffect, useRef } from 'react';
// useRef also used by EditableRichText
import { HiEnvelope, HiLink, HiPhone } from 'react-icons/hi2';
import { apiUrl } from '../../api';
import {
  findCvArrayIndex,
  getFieldDisplayValue,
  isCanvasInlineEditableType,
} from '../../lib/canvasInlineEdit.js';
import {
  attachEditableFieldBehavior,
  getEditableFieldConfig,
} from '../../lib/editableFieldBehavior.js';
import {
  resolveBoundStringList,
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
import { isNonSemanticBlockType } from '../../lib/cvLayoutModelV3.js';
import { RESIZE_HANDLES } from '../../lib/freeCanvasResize.js';
import CanvasEditableField from './CanvasEditableField.jsx';
import CanvasIconGlyph from './CanvasIconGlyph.jsx';

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
  if (!children) return <span className={`free-canvas-block__empty ${className}`}> </span>;
  return <span className={className}>{children}</span>;
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

function SemanticBlockBody({ block, cv, editing = false }) {
  const { type, bind, limit, style = {} } = block;
  const format = style.format || style.list_format || 'default';

  switch (type) {
    case 'identity': {
      const prenom = getFieldDisplayValue(cv, 'prenom');
      const nom = getFieldDisplayValue(cv, 'nom');
      const title = getFieldDisplayValue(cv, 'titre_professionnel');
      return (
        <div className={`free-canvas-block__identity${style.identity_divider ? ' free-canvas-block__identity--divider' : ''}`}>
          <div className="free-canvas-block__identity-name" style={{ textAlign: style.align || 'left' }}>
            {editing ? (
              <>
                <CanvasEditableField path="prenom" editing className="free-canvas-block__inline-name">
                  {prenom || 'Prénom'}
                </CanvasEditableField>
                {' '}
                <CanvasEditableField path="nom" editing className="free-canvas-block__inline-name">
                  {nom || 'Nom'}
                </CanvasEditableField>
              </>
            ) : (
              <BlockText>{resolveBoundText(cv, ['prenom', 'nom']) || 'Prénom Nom'}</BlockText>
            )}
          </div>
          {(editing || title) ? (
            <div
              className={
                style.title_accent
                  ? 'free-canvas-block__identity-title free-canvas-block__identity-title--accent'
                  : 'free-canvas-block__identity-title'
              }
            >
              {editing ? (
                <CanvasEditableField path="titre_professionnel" editing>
                  {title || 'Titre professionnel'}
                </CanvasEditableField>
              ) : (
                <BlockText>{title}</BlockText>
              )}
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
      const round = style.shape === 'circle';
      const borderCls = style.photo_border === 'light'
        ? 'free-canvas-block__photo--border-light'
        : style.photo_border === 'accent'
          ? 'free-canvas-block__photo--border-accent'
          : style.photo_border === 'accent-thick'
            ? 'free-canvas-block__photo--border-accent'
            : style.photo_border === 'accent-thin'
              ? 'free-canvas-block__photo--border-accent'
              : '';
      return (
        <img
          className={[
            'free-canvas-block__photo',
            round ? 'free-canvas-block__photo--round' : '',
            borderCls,
          ].filter(Boolean).join(' ')}
          src={src}
          alt=""
        />
      );
    }
    case 'contact': {
      const tel = getFieldDisplayValue(cv, 'telephone');
      const email = getFieldDisplayValue(cv, 'email');
      const linkedin = getFieldDisplayValue(cv, 'linkedin');
      return (
        <div
          className={[
            'free-canvas-block__contact',
            style.contact_divider ? 'free-canvas-block__contact--divider' : '',
            style.contact_uppercase ? 'free-canvas-block__contact--uppercase' : '',
            style.contact_icons ? 'free-canvas-block__contact--icons' : '',
          ].filter(Boolean).join(' ')}
        >
          {style.section_label ? (
            <SectionHeading label={style.section_label} titleStyle={style.title_style} zone={style.zone} />
          ) : null}
          {(editing || tel) ? (
            <p>
              <HiPhone size={12} className="free-canvas-block__contact-icon" aria-hidden />
              {' '}
              {editing ? (
                <CanvasEditableField path="telephone" editing>{tel || 'Téléphone'}</CanvasEditableField>
              ) : (
                <BlockText>{tel}</BlockText>
              )}
            </p>
          ) : null}
          {(editing || email) ? (
            <p>
              <HiEnvelope size={12} className="free-canvas-block__contact-icon" aria-hidden />
              {' '}
              {editing ? (
                <CanvasEditableField path="email" editing>{email || 'Email'}</CanvasEditableField>
              ) : (
                <BlockText>{email}</BlockText>
              )}
            </p>
          ) : null}
          {(editing || linkedin) ? (
            <p>
              <HiLink size={12} className="free-canvas-block__contact-icon" aria-hidden />
              {' '}
              {editing ? (
                <CanvasEditableField path="linkedin" editing>{linkedin || 'LinkedIn'}</CanvasEditableField>
              ) : (
                <BlockText>{linkedin}</BlockText>
              )}
            </p>
          ) : null}
        </div>
      );
    }
    case 'resume':
      return (
        <div className="free-canvas-block__section-list">
          {style.section_label ? (
            <SectionHeading label={style.section_label} titleStyle={style.title_style} zone={style.zone} />
          ) : null}
          <p className="free-canvas-block__resume">
          {editing ? (
            <CanvasEditableField path={bind?.length ? bind[0] : 'resume'} editing tag="span">
              {resolveBoundText(cv, bind.length ? bind : 'resume') || 'Résumé professionnel'}
            </CanvasEditableField>
          ) : (
            <BlockText>{resolveBoundText(cv, bind.length ? bind : 'resume')}</BlockText>
          )}
          </p>
        </div>
      );
    case 'experiences': {
      const items = resolveExperiences(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Expériences</p>;
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || SECTION_LABELS.experiences}
            titleStyle={style.title_style}
            zone={style.zone}
          />
          {items.map((exp, i) => {
            const idx = findCvArrayIndex(cv, 'experiences', exp);
            if (idx < 0) return null;
            return (
              <div
                key={exp.id || i}
                className={`free-canvas-block__exp${format === 'compact' ? ' free-canvas-block__exp--compact' : ''}`}
              >
                <div className="free-canvas-block__exp-header">
                  {editing ? (
                    <CanvasEditableField path={`experiences.${idx}.entreprise`} editing tag="strong">
                      {exp.entreprise || exp.poste || 'Organisation'}
                    </CanvasEditableField>
                  ) : (
                    <strong>{exp.entreprise || exp.poste}</strong>
                  )}
                  {(editing || exp.date_debut || exp.date_fin) && (
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
                        </>
                      ) : (
                        [exp.date_debut, exp.date_fin].filter(Boolean).join(' – ')
                      )}
                    </span>
                  )}
                </div>
                {(editing || (exp.poste && exp.entreprise)) ? (
                  <div className="free-canvas-block__exp-role">
                    {editing ? (
                      <CanvasEditableField path={`experiences.${idx}.poste`} editing>
                        {exp.poste || 'Poste'}
                      </CanvasEditableField>
                    ) : (
                      exp.poste
                    )}
                  </div>
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
                    {' — '}
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
                    {f.etablissement && f.diplome ? ` — ${f.etablissement}` : ''}
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
      return (
        <div className="free-canvas-block__section-list">
          <SectionHeading
            label={style.section_label || SECTION_LABELS.certifications}
            titleStyle={style.title_style}
            zone={style.zone}
          />
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
              <p key={c.id || i}>{[c.nom, c.organisme, c.date].filter(Boolean).join(' · ')}</p>
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
                {' — '}
                <CanvasEditableField path={`projets.${idx}.description`} editing>{p.description || 'Description'}</CanvasEditableField>
              </p>
            ) : (
              <p key={p.id || i}><strong>{p.nom}</strong>{p.description ? ` — ${p.description}` : ''}</p>
            );
          })}
        </div>
      );
    }
    case 'skills': {
      const items = resolveBoundStringList(cv, bind.length ? bind : 'competences.techniques');
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Compétences</p>;
      const chips = format === 'chips';
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.skills}</h3>
          {chips ? (
            <div className="free-canvas-block__chips">
              {items.map((s, i) => <span key={i} className="free-canvas-block__chip">{s}</span>)}
            </div>
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
          <ul className="free-canvas-block__skill-list">
            {items.map((l, i) => (
              <li key={i}>{`${l.langue}${l.niveau ? ` - ${l.niveau}` : ''}`}</li>
            ))}
          </ul>
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
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.innerHTML = html || '';
    }
  }, [editing, html]);

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
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <Tag
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}

function NonSemanticBlockBody({ block, editing = false, onAutoHeight }) {
  const { type, content = '', style = {} } = block;
  switch (type) {
    case 'text': {
      const textStyle = {
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
      const shape = style.shape || 'rect';
      const radiusMm = style.border_radius_mm;
      const radius = radiusMm > 0
        ? `${radiusMm}mm`
        : shape === 'circle'
          ? '50%'
          : shape === 'rounded'
            ? '12px'
            : '0';
      const focalX = style.focal_x ?? 50;
      const focalY = style.focal_y ?? 50;
      const zoom = style.image_zoom ?? 1;
      return (
        <div className="free-canvas-block__image-frame" style={{ borderRadius: radius, opacity: style.opacity ?? 1 }}>
          <img
            className="free-canvas-block__image"
            src={src}
            alt=""
            style={{
              objectFit: 'cover',
              objectPosition: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
        </div>
      );
    }
    case 'shape:line': {
      const stroke = style.stroke_width ?? block.h ?? 0.6;
      return (
        <div
          className="free-canvas-block__shape-line"
          style={{
            backgroundColor: style.color || '#1e293b',
            height: `${stroke}mm`,
            marginTop: `${Math.max(0, ((block.h || stroke) - stroke) / 2)}mm`,
          }}
          role="presentation"
        />
      );
    }
    case 'shape:rect':
      return (
        <div
          className="free-canvas-block__shape-rect"
          style={{ backgroundColor: style.color || style.bg || '#e2e8f0' }}
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
  locked = false,
}) {
  const innerRef = useRef(null);

  useEffect(() => {
    if (!editing || !innerRef.current) return undefined;
    const cleanups = [];
    innerRef.current.querySelectorAll('[data-cv-field]').forEach((el) => {
      const path = el.getAttribute('data-cv-field');
      if (!path) return;
      cleanups.push(attachEditableFieldBehavior(el, getEditableFieldConfig(path)));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [editing, block?.id]);

  if (!block || typeof block !== 'object') return null;
  const { id, type, x, y, w, h, z, style: blockStyle } = block;
  const innerTypography = blockStyleToCss(blockStyle);
  const typographyOverride = blockHasTypographyOverride(blockStyle);
  const zone = blockStyle?.zone;
  const handleAutoHeight = (newHmm) => {
    if (typeof onBlockAutoHeight !== 'function' || !id) return;
    if (newHmm > h + 0.5) onBlockAutoHeight(id, newHmm);
  };
  const isNonSemantic = isNonSemanticBlockType(type);
  const canEdit = isCanvasInlineEditableType(type);

  const handlePointerDown = (e) => {
    if (editing || locked) return;
    if (interactable && onPointerDown) onPointerDown(e, block);
  };

  const handleDoubleClick = (e) => {
    if (!interactable) return;
    e.stopPropagation();
    if (type === 'image' && typeof onImageEdit === 'function') {
      onImageEdit(block.id);
      return;
    }
    if (!canEdit) return;
    if (typeof onDoubleClickEdit === 'function') onDoubleClickEdit(block.id);
  };

  const handleInnerBlur = (e) => {
    if (!editing || typeof onInnerBlur !== 'function') return;
    const next = e.relatedTarget;
    if (next && innerRef.current?.contains(next)) return;
    onInnerBlur(block.id, innerRef.current);
  };

  return (
    <div
      ref={(el) => {
        if (typeof onBlockElementRef === 'function') onBlockElementRef(block.id, el);
      }}
      className={blockClassName({ selected, dragging, resizing, interactable, editing, locked })}
      data-block-id={id}
      data-block-type={type}
      style={{
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${w}mm`,
        height: `${h}mm`,
        zIndex: dragging || resizing || editing ? 9999 : z,
      }}
      title={
        editing
          ? 'Mode texte — Échap pour quitter'
          : interactable
            ? `${type} — double-clic pour éditer`
            : type
      }
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
        ].filter(Boolean).join(' ')}
        style={innerTypography}
        onBlur={editing ? handleInnerBlur : undefined}
      >
        {isNonSemantic
          ? (
            <NonSemanticBlockBody
              block={block}
              editing={editing}
              onAutoHeight={(type === 'text' || type === 'title') ? handleAutoHeight : undefined}
            />
          )
          : <SemanticBlockBody block={block} cv={cv} editing={editing} />}
      </div>
      {locked && (
        <span className="free-canvas-block__lock-badge" title="Position verrouillée" aria-hidden>
          🔒
        </span>
      )}
      {selected && interactable && !editing && !locked && onResizePointerDown && (
        <div className="free-canvas-resize-handles" aria-hidden="true">
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              className={`free-canvas-resize-handle free-canvas-resize-handle--${handle}`}
              data-resize-handle={handle}
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
