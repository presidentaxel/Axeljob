import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRichTextCommand } from '../../lib/canvasRichTextFormat.js';
import '../../styles/EditorFloatingTextToolbar.css';

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Plus Jakarta Sans', label: 'Jakarta' },
  { value: 'Georgia', label: 'Georgia' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

/**
 * Toolbar formatage : déplaçable, thème clair, riche texte (sélection ou bloc).
 */
export default function EditorFloatingTextToolbar({
  block,
  anchorRect,
  isEditing = false,
  onBlockStylePatch,
  initialOffset = null,
}) {
  const dragRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!anchorRect) return;
    if (initialOffset) {
      setPos(initialOffset);
      return;
    }
    setPos({
      top: anchorRect.top + anchorRect.height + 8,
      left: anchorRect.left,
    });
  }, [anchorRect, initialOffset]);

  const onDragStart = useCallback((e) => {
    if (e.target.closest('button, select, input')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...pos };
    dragRef.current = { startX, startY, origin };
    setDragging(true);

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({
        top: d.origin.top + (ev.clientY - d.startY),
        left: d.origin.left + (ev.clientX - d.startX),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [pos]);

  if (!block || !anchorRect || !pos) return null;

  const style = block.style || {};
  const patchStyle = (key, value) => {
    if (typeof onBlockStylePatch === 'function') onBlockStylePatch({ [key]: value });
  };

  const run = (cmd, val) => {
    if (isEditing) {
      applyRichTextCommand(cmd, val);
    } else {
      if (cmd === 'bold') patchStyle('bold', !style.bold);
      if (cmd === 'italic') patchStyle('italic', !style.italic);
      if (cmd === 'underline') patchStyle('underline', !style.underline);
      if (cmd === 'strikeThrough') patchStyle('strikethrough', !style.strikethrough);
    }
  };

  const canRich = isEditing || block.type === 'text' || block.type === 'title';

  return (
    <div
      className={`editor-floating-toolbar${dragging ? ' editor-floating-toolbar--dragging' : ''}`}
      role="toolbar"
      aria-label="Formatage texte"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="editor-floating-toolbar__handle"
        title="Déplacer la barre"
        onPointerDown={onDragStart}
        aria-hidden
      >
        ⋮⋮
      </div>
      {canRich && (
        <>
          <div className="editor-floating-toolbar-group">
            <select
              className="editor-floating-toolbar__select"
              value={style.font_family || 'Inter'}
              title="Police"
              onChange={(e) => {
                if (isEditing) applyRichTextCommand('fontName', e.target.value);
                else patchStyle('font_family', e.target.value);
              }}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              className="editor-floating-toolbar__select editor-floating-toolbar__select--narrow"
              value={style.font_size || 9}
              title="Taille"
              onChange={(e) => {
                const pt = Number(e.target.value);
                if (isEditing) applyRichTextCommand('fontSize', `${pt}pt`);
                else patchStyle('font_size', pt);
              }}
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="editor-floating-toolbar-group">
            <button type="button" className={style.bold ? 'is-active' : ''} title="Gras" onClick={() => run('bold')}>B</button>
            <button type="button" className={style.italic ? 'is-active' : ''} title="Italique" onClick={() => run('italic')}>I</button>
            <button type="button" className={style.underline ? 'is-active' : ''} title="Souligné" onClick={() => run('underline')}>U</button>
            <button type="button" className={style.strikethrough ? 'is-active' : ''} title="Barré" onClick={() => run('strikeThrough')}>S</button>
          </div>
          <div className="editor-floating-toolbar-group">
            <input
              type="color"
              value={style.color || '#1e293b'}
              title="Couleur"
              onChange={(e) => {
                if (isEditing) applyRichTextCommand('foreColor', e.target.value);
                else patchStyle('color', e.target.value);
              }}
            />
            <label className="editor-floating-toolbar__opacity" title="Transparence">
              α
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={style.opacity ?? 1}
                onChange={(e) => patchStyle('opacity', parseFloat(e.target.value))}
              />
            </label>
          </div>
          <div className="editor-floating-toolbar-group">
            {['left', 'center', 'right'].map((align) => (
              <button
                key={align}
                type="button"
                className={(style.align || 'left') === align ? 'is-active' : ''}
                title={`Aligner ${align}`}
                onClick={() => {
                  if (isEditing) {
                    const cmd = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
                    applyRichTextCommand(cmd);
                  } else {
                    patchStyle('align', align);
                  }
                }}
              >
                {align === 'left' ? '⫷' : align === 'center' ? '≡' : '⫸'}
              </button>
            ))}
            <button
              type="button"
              title="Liste à puces"
              onClick={() => applyRichTextCommand('insertUnorderedList')}
            >
              •
            </button>
          </div>
        </>
      )}
    </div>
  );
}
