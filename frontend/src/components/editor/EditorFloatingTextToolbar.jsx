import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiBars3BottomLeft,
  HiBars3,
  HiBars3BottomRight,
  HiListBullet,
} from 'react-icons/hi2';
import {
  applyColorToSelection,
  applyFontFamilyToSelection,
  applyFontSizeToSelection,
  applyRichTextCommand,
  applyStyleToSelection,
  getActiveEditableRoot,
  hasTextSelection,
  queryCommandState,
} from '../../lib/canvasRichTextFormat.js';
import '../../styles/EditorFloatingTextToolbar.css';

const FONT_FAMILIES = [
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: 'Georgia, serif', label: 'Georgia' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 34];

function AlignIcon({ align }) {
  if (align === 'center') return <HiBars3 size={18} aria-hidden />;
  if (align === 'right') return <HiBars3BottomRight size={18} aria-hidden />;
  return <HiBars3BottomLeft size={18} aria-hidden />;
}

/**
 * Toolbar Canva-like : formatage sur sélection en édition, sinon bloc entier.
 */
export default function EditorFloatingTextToolbar({
  block,
  anchorRect,
  isEditing = false,
  onBlockStylePatch,
  onBlockPatch,
}) {
  const dragRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!isEditing) return undefined;
    const onSel = () => tick((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [isEditing]);

  useEffect(() => {
    if (!anchorRect) return;
    setPos({
      top: anchorRect.top + anchorRect.height + 10,
      left: Math.max(8, anchorRect.left),
    });
  }, [anchorRect]);

  const onDragStart = useCallback((e) => {
    if (!e.target.closest('.editor-floating-toolbar__handle')) return;
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
  const isLine = block.type === 'shape:line';
  const isText = block.type === 'text' || block.type === 'title';
  const selectionMode = isEditing && (hasTextSelection() || getActiveEditableRoot());

  const patchStyle = (key, value) => {
    if (selectionMode && isText) {
      if (key === 'color') applyColorToSelection(value);
      else if (key === 'font_family') applyFontFamilyToSelection(value);
      else if (key === 'font_size') applyFontSizeToSelection(value);
      else if (key === 'opacity') applyStyleToSelection({ opacity: value });
      return;
    }
    if (typeof onBlockStylePatch === 'function') onBlockStylePatch({ [key]: value });
  };

  const runCmd = (cmd, val) => {
    if (selectionMode) {
      applyRichTextCommand(cmd, val);
      return;
    }
    if (!isText && typeof onBlockStylePatch === 'function') {
      const map = {
        bold: { bold: !style.bold },
        italic: { italic: !style.italic },
        underline: { underline: !style.underline },
        strikeThrough: { strikethrough: !style.strikethrough },
      };
      if (map[cmd]) onBlockStylePatch(map[cmd]);
    }
  };

  const fontSize = style.font_size || 12;
  const align = style.align || 'left';

  return (
    <div
      className={`editor-floating-toolbar${dragging ? ' editor-floating-toolbar--dragging' : ''}`}
      role="toolbar"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="editor-floating-toolbar__handle" onPointerDown={onDragStart} title="Déplacer" aria-hidden>
        ⋮⋮
      </div>

      {isLine && (
        <>
          <label className="editor-floating-toolbar__color-btn" title="Couleur du trait">
            <span className="editor-floating-toolbar__color-a">A</span>
            <input
              type="color"
              value={style.color || '#1e293b'}
              onChange={(e) => patchStyle('color', e.target.value)}
            />
          </label>
          <div className="editor-floating-toolbar__size-stepper">
            <button type="button" onClick={() => patchStyle('stroke_width', Math.max(0.2, (style.stroke_width || 0.6) - 0.2))}>−</button>
            <span>{(style.stroke_width || 0.6).toFixed(1)} mm</span>
            <button type="button" onClick={() => patchStyle('stroke_width', Math.min(8, (style.stroke_width || 0.6) + 0.2))}>+</button>
          </div>
        </>
      )}

      {isText && (
        <>
          <select
            className="editor-floating-toolbar__font"
            value={style.font_family || FONT_FAMILIES[2].value}
            onChange={(e) => patchStyle('font_family', e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <div className="editor-floating-toolbar__size-stepper">
            <button
              type="button"
              onClick={() => patchStyle('font_size', Math.max(6, fontSize - 1))}
            >
              −
            </button>
            <span>{fontSize}</span>
            <button
              type="button"
              onClick={() => patchStyle('font_size', Math.min(48, fontSize + 1))}
            >
              +
            </button>
          </div>
          <label className="editor-floating-toolbar__color-btn" title="Couleur du texte">
            <span className="editor-floating-toolbar__color-a editor-floating-toolbar__color-a--rainbow">A</span>
            <input
              type="color"
              value={style.color || '#1e293b'}
              onChange={(e) => patchStyle('color', e.target.value)}
            />
          </label>
          <button
            type="button"
            className={selectionMode ? (queryCommandState('bold') ? 'is-active' : '') : (style.bold ? 'is-active' : '')}
            onClick={() => runCmd('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={selectionMode ? (queryCommandState('italic') ? 'is-active' : '') : (style.italic ? 'is-active' : '')}
            onClick={() => runCmd('italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={selectionMode ? (queryCommandState('underline') ? 'is-active' : '') : (style.underline ? 'is-active' : '')}
            onClick={() => runCmd('underline')}
          >
            <span className="editor-floating-toolbar__u">U</span>
          </button>
          <button
            type="button"
            className={selectionMode ? (queryCommandState('strikeThrough') ? 'is-active' : '') : (style.strikethrough ? 'is-active' : '')}
            onClick={() => runCmd('strikeThrough')}
          >
            <span className="editor-floating-toolbar__s">S</span>
          </button>
          <button type="button" title="Casse" onClick={() => applyRichTextCommand('formatBlock', 'p')}>
            aA
          </button>
          <div className="editor-floating-toolbar__align-group">
            {['left', 'center', 'right'].map((a) => (
              <button
                key={a}
                type="button"
                className={align === a ? 'is-active' : ''}
                title={`Aligner ${a}`}
                onClick={() => {
                  if (selectionMode) {
                    const cmd = a === 'center' ? 'justifyCenter' : a === 'right' ? 'justifyRight' : 'justifyLeft';
                    applyRichTextCommand(cmd);
                  } else {
                    patchStyle('align', a);
                  }
                }}
              >
                <AlignIcon align={a} />
              </button>
            ))}
          </div>
          <button type="button" title="Liste à puces" onClick={() => applyRichTextCommand('insertUnorderedList')}>
            <HiListBullet size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={effectsOpen ? 'is-active' : ''}
            onClick={() => setEffectsOpen((v) => !v)}
          >
            Effets
          </button>
          {effectsOpen && (
            <div className="editor-floating-toolbar__popover">
              <label>
                Transparence
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
          )}
        </>
      )}

      <button
        type="button"
        className={`editor-floating-toolbar__position-btn${positionOpen ? ' is-active' : ''}`}
        onClick={() => setPositionOpen((v) => !v)}
      >
        Position
      </button>
      {positionOpen && (
        <div className="editor-floating-toolbar__popover editor-floating-toolbar__popover--position">
          {['x', 'y', 'w', 'h', 'z'].map((key) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                step={key === 'z' ? 1 : 0.5}
                value={block[key] ?? 0}
                onChange={(e) => onBlockPatch?.({ [key]: parseFloat(e.target.value) || 0 })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
