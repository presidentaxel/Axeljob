import { HiEnvelope, HiLink, HiPhone } from 'react-icons/hi2';
import { apiUrl } from '../../api';
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

function SemanticBlockBody({ block, cv }) {
  const { type, bind, limit, style = {} } = block;
  const format = style.format || 'default';

  switch (type) {
    case 'identity': {
      const name = resolveBoundText(cv, ['prenom', 'nom']);
      const title = resolveBoundText(cv, 'titre_professionnel');
      return (
        <div className="free-canvas-block__identity">
          <div className="free-canvas-block__identity-name" style={{ textAlign: style.align || 'left' }}>
            <BlockText>{name || 'Prénom Nom'}</BlockText>
          </div>
          {title ? (
            <div className="free-canvas-block__identity-title">
              <BlockText>{title}</BlockText>
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
      const tel = resolveBoundText(cv, 'telephone');
      const email = resolveBoundText(cv, 'email');
      const linkedin = resolveBoundText(cv, 'linkedin');
      return (
        <div className="free-canvas-block__contact">
          {tel ? <p><HiPhone size={12} aria-hidden /> <BlockText>{tel}</BlockText></p> : null}
          {email ? <p><HiEnvelope size={12} aria-hidden /> <BlockText>{email}</BlockText></p> : null}
          {linkedin ? <p><HiLink size={12} aria-hidden /> <BlockText>{linkedin}</BlockText></p> : null}
        </div>
      );
    }
    case 'resume':
      return (
        <p className="free-canvas-block__resume">
          <BlockText>{resolveBoundText(cv, bind.length ? bind : 'resume')}</BlockText>
        </p>
      );
    case 'experiences': {
      const items = resolveExperiences(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Expériences</p>;
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.experiences}</h3>
          {items.map((exp, i) => (
            <div key={exp.id || i} className={`free-canvas-block__exp${format === 'compact' ? ' free-canvas-block__exp--compact' : ''}`}>
              <div className="free-canvas-block__exp-header">
                <strong>{exp.entreprise || exp.poste}</strong>
                {(exp.date_debut || exp.date_fin) && (
                  <span className="free-canvas-block__exp-dates">
                    {[exp.date_debut, exp.date_fin].filter(Boolean).join(' – ')}
                  </span>
                )}
              </div>
              {exp.poste && exp.entreprise ? <div className="free-canvas-block__exp-role">{exp.poste}</div> : null}
              <ul className="free-canvas-block__bullets">
                {(exp.bullet_points || []).filter((b) => (b || '').trim()).map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    case 'formations': {
      const items = resolveFormations(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Formations</p>;
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.formations}</h3>
          {items.map((f, i) => (
            <p key={f.id || i} className="free-canvas-block__formation-line">
              <strong>{f.diplome || f.etablissement}</strong>
              {f.etablissement && f.diplome ? ` — ${f.etablissement}` : ''}
              {f.date ? <span className="free-canvas-block__formation-date"> ({f.date})</span> : null}
            </p>
          ))}
        </div>
      );
    }
    case 'certifications': {
      const items = resolveCertifications(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Certifications</p>;
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.certifications}</h3>
          {items.map((c, i) => (
            <p key={c.id || i}>{[c.nom, c.organisme, c.date].filter(Boolean).join(' · ')}</p>
          ))}
        </div>
      );
    }
    case 'projets': {
      const items = resolveProjets(cv, limit);
      if (items.length === 0) return <p className="free-canvas-block__placeholder">Projets</p>;
      return (
        <div className="free-canvas-block__section-list">
          <h3 className="free-canvas-block__section-title">{SECTION_LABELS.projets}</h3>
          {items.map((p, i) => (
            <p key={p.id || i}><strong>{p.nom}</strong>{p.description ? ` — ${p.description}` : ''}</p>
          ))}
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

function NonSemanticBlockBody({ block }) {
  const { type, content = '', style = {} } = block;
  switch (type) {
    case 'text':
      return (
        <p
          className="free-canvas-block__text"
          style={{
            fontStyle: style.italic ? 'italic' : undefined,
            fontSize: style.font_size ? `${style.font_size}pt` : undefined,
            textAlign: style.align,
          }}
        >
          {content || 'Texte libre'}
        </p>
      );
    case 'title':
      return (
        <h3
          className="free-canvas-block__title"
          style={{ textAlign: style.align, color: style.color }}
        >
          {content || 'Titre'}
        </h3>
      );
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

function blockClassName({ selected, dragging, resizing, interactable }) {
  const parts = ['free-canvas-block'];
  if (interactable) parts.push('free-canvas-block--interactive');
  if (selected) parts.push('free-canvas-block--selected');
  if (dragging) parts.push('free-canvas-block--dragging');
  if (resizing) parts.push('free-canvas-block--resizing');
  return parts.join(' ');
}

/**
 * Rendu d un bloc layout v3 (position absolue en mm sur la page).
 * P3.3 : pointer handlers pour selection + drag (via FreeCanvas parent).
 */
export default function FreeCanvasBlock({
  block,
  cv,
  selected = false,
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
}) {
  if (!block || typeof block !== 'object') return null;
  const { id, type, x, y, w, h, z } = block;
  const isNonSemantic = isNonSemanticBlockType(type);

  return (
    <div
      className={blockClassName({ selected, dragging, resizing, interactable })}
      data-block-id={id}
      data-block-type={type}
      style={{
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${w}mm`,
        height: `${h}mm`,
        zIndex: dragging || resizing ? 9999 : z,
      }}
      title={interactable ? `${type} — glisser pour déplacer` : type}
      onPointerDown={interactable && onPointerDown ? (e) => onPointerDown(e, block) : undefined}
      onPointerMove={interactable && onPointerMove ? onPointerMove : undefined}
      onPointerUp={interactable && onPointerUp ? onPointerUp : undefined}
      onPointerCancel={interactable && onPointerCancel ? onPointerCancel : undefined}
    >
      <div className="free-canvas-block__inner">
        {isNonSemantic
          ? <NonSemanticBlockBody block={block} />
          : <SemanticBlockBody block={block} cv={cv} />}
      </div>
      {selected && interactable && onResizePointerDown && (
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
