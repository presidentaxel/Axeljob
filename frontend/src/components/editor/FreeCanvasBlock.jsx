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
import { isNonSemanticBlockType } from '../../lib/cvLayoutModelV3.js';
import { RESIZE_HANDLES } from '../../lib/freeCanvasResize.js';
import CanvasEditableField from './CanvasEditableField.jsx';

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

function SemanticBlockBody({ block, cv, editing = false }) {
  const { type, bind, limit, style = {} } = block;
  const format = style.format || 'default';

  switch (type) {
    case 'identity': {
      const prenom = getFieldDisplayValue(cv, 'prenom');
      const nom = getFieldDisplayValue(cv, 'nom');
      const title = getFieldDisplayValue(cv, 'titre_professionnel');
      return (
        <div className="free-canvas-block__identity">
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
            <div className="free-canvas-block__identity-title">
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
      return (
        <img
          className={round ? 'free-canvas-block__photo free-canvas-block__photo--round' : 'free-canvas-block__photo'}
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
        <div className="free-canvas-block__contact">
          {(editing || tel) ? (
            <p>
              <HiPhone size={12} aria-hidden />
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
              <HiEnvelope size={12} aria-hidden />
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
              <HiLink size={12} aria-hidden />
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
        <p className="free-canvas-block__resume">
          {editing ? (
            <CanvasEditableField path={bind?.length ? bind[0] : 'resume'} editing tag="span">
              {resolveBoundText(cv, bind.length ? bind : 'resume') || 'Résumé professionnel'}
            </CanvasEditableField>
          ) : (
            <BlockText>{resolveBoundText(cv, bind.length ? bind : 'resume')}</BlockText>
          )}
        </p>
      );
    case 'experiences': {
      const items = resolveExperiences(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Expériences</p>;
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.experiences}</h3>
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
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.formations}</h3>
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
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.certifications}</h3>
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
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.projets}</h3>
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
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.languages}</h3>
          <p>{items.map((l) => `${l.langue}${l.niveau ? ` (${l.niveau})` : ''}`).join(', ')}</p>
        </div>
      );
    }
    default:
      return <p className="free-canvas-block__placeholder">{type}</p>;
  }
}

function EditableRichText({ tag, className, style, editing, html }) {
  const Tag = tag;
  const ref = useRef(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.innerHTML = html || '';
    }
  }, [editing, html]);
  if (editing) {
    return (
      <Tag
        ref={ref}
        className={className}
        style={style}
        contentEditable
        suppressContentEditableWarning
        data-canvas-block-content="1"
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

function NonSemanticBlockBody({ block, editing = false }) {
  const { type, content = '', style = {} } = block;
  switch (type) {
    case 'text': {
      const textStyle = {
        fontStyle: style.italic ? 'italic' : undefined,
        fontSize: style.font_size ? `${style.font_size}pt` : undefined,
        fontFamily: style.font_family || undefined,
        textAlign: style.align,
        color: style.color,
        opacity: style.opacity ?? 1,
        fontWeight: style.bold ? 700 : undefined,
        textDecoration: [
          style.underline ? 'underline' : '',
          style.strikethrough ? 'line-through' : '',
        ].filter(Boolean).join(' ') || undefined,
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
        />
      );
    }
    case 'title': {
      const titleStyle = {
        textAlign: style.align,
        color: style.color,
        fontSize: style.font_size ? `${style.font_size}pt` : undefined,
        fontFamily: style.font_family || undefined,
        opacity: style.opacity ?? 1,
        fontWeight: style.bold ? 700 : undefined,
        fontStyle: style.italic ? 'italic' : undefined,
        textDecoration: [
          style.underline ? 'underline' : '',
          style.strikethrough ? 'line-through' : '',
        ].filter(Boolean).join(' ') || undefined,
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
        />
      );
    }
    case 'image': {
      const src = block.image_src;
      if (!src) {
        return <div className="free-canvas-block__image-placeholder">Image</div>;
      }
      const shape = style.shape || 'rect';
      const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '12px' : '0';
      return (
        <img
          className="free-canvas-block__image"
          src={src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: style.object_fit || 'cover',
            objectPosition: style.object_position || 'center',
            borderRadius: radius,
            opacity: style.opacity ?? 1,
          }}
        />
      );
    }
    case 'shape:line':
      return (
        <div
          className="free-canvas-block__shape-line"
          style={{ backgroundColor: style.color || '#1e293b' }}
          role="presentation"
        />
      );
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
        <div
          className={
            block.icon_name
              ? 'free-canvas-block__icon'
              : 'free-canvas-block__icon free-canvas-block__icon--empty'
          }
          aria-hidden="true"
        >
          {block.icon_name || 'Icône'}
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
  onInnerBlur,
  onBlockElementRef,
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
  const { id, type, x, y, w, h, z } = block;
  const isNonSemantic = isNonSemanticBlockType(type);
  const canEdit = isCanvasInlineEditableType(type);

  const handlePointerDown = (e) => {
    if (editing || locked) return;
    if (interactable && onPointerDown) onPointerDown(e, block);
  };

  const handleDoubleClick = (e) => {
    if (!canEdit || !interactable) return;
    e.stopPropagation();
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
        className="free-canvas-block__inner"
        onBlur={editing ? handleInnerBlur : undefined}
      >
        {isNonSemantic
          ? <NonSemanticBlockBody block={block} editing={editing} />
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
