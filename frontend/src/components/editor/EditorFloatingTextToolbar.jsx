import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiBars3BottomLeft,
  HiBars3,
  HiBars3BottomRight,
  HiBars4,
  HiListBullet,
} from 'react-icons/hi2';
import {
  applyColorToSelection,
  applyFontFamilyToSelection,
  applyFontSizeToSelection,
  applyRichTextCommand,
  applyRichTextCommandWithFallback,
  applyStyleToEditableRoot,
  hasTextSelection,
  queryCommandState,
  toggleTextCase,
} from '../../lib/canvasRichTextFormat.js';
import { blockSupportsTextToolbar } from '../../lib/canvasBlockToolbar.js';
import '../../styles/EditorFloatingTextToolbar.css';

const FONT_FAMILIES = [
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: 'Georgia, serif', label: 'Georgia' },
];

const ALIGN_CYCLE = ['left', 'center', 'right', 'justify'];
const ALIGN_CMD = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
};

function AlignIcon({ align }) {
  if (align === 'center') return <HiBars3 size={18} aria-hidden />;
  if (align === 'right') return <HiBars3BottomRight size={18} aria-hidden />;
  if (align === 'justify') return <HiBars4 size={18} aria-hidden />;
  return <HiBars3BottomLeft size={18} aria-hidden />;
}

/** Empêche la perte de focus/selection sur contentEditable au clic toolbar. */
function formatAction(event, fn) {
  event.preventDefault();
  event.stopPropagation();
  fn();
}

export default function EditorFloatingTextToolbar({
  block,
  anchorRect,
  isEditing = false,
  onBlockStylePatch,
  onOpenPositionPanel,
}) {
  const dragRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
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
    const top = anchorRect.top + anchorRect.height + 10;
    const left = Math.max(8, anchorRect.left);
    setPos((prev) => {
      if (prev && prev.top === top && prev.left === left) return prev;
      return { top, left };
    });
  }, [anchorRect?.top, anchorRect?.left, anchorRect?.width, anchorRect?.height]);

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
  const isIcon = block.type === 'icon';
  const showText = blockSupportsTextToolbar(block.type);
  const fontSize = style.font_size || 12;
  const align = style.align || 'left';

  const patchStyle = (key, value) => {
    if (isEditing && showText && hasTextSelection()) {
      if (key === 'color') applyColorToSelection(value);
      else if (key === 'font_family') applyFontFamilyToSelection(value);
      else if (key === 'font_size') applyFontSizeToSelection(value);
      return;
    }
    if (typeof onBlockStylePatch === 'function') onBlockStylePatch({ [key]: value });
    if (isEditing && showText) {
      const map = {
        font_size: { fontSize: `${value}pt` },
        font_family: { fontFamily: value },
        color: { color: value },
        align: { textAlign: value },
        opacity: { opacity: value },
      };
      if (map[key]) applyStyleToEditableRoot(map[key]);
    }
  };

  const runCmd = (cmd) => {
    if (isEditing && showText) {
      applyRichTextCommandWithFallback(cmd);
      return;
    }
    if (!showText || typeof onBlockStylePatch !== 'function') return;
    const map = {
      bold: { bold: !style.bold },
      italic: { italic: !style.italic },
      underline: { underline: !style.underline },
      strikeThrough: { strikethrough: !style.strikethrough },
    };
    if (map[cmd]) onBlockStylePatch(map[cmd]);
  };

  const cycleAlign = () => {
    const idx = ALIGN_CYCLE.indexOf(align);
    const next = ALIGN_CYCLE[(idx + 1) % ALIGN_CYCLE.length];
    if (isEditing && showText) {
      applyRichTextCommandWithFallback(ALIGN_CMD[next]);
      if (!hasTextSelection() && typeof onBlockStylePatch === 'function') {
        onBlockStylePatch({ align: next });
      }
      return;
    }
    patchStyle('align', next);
  };

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
          <label className="editor-floating-toolbar__color-btn" title="Couleur">
            <span className="editor-floating-toolbar__color-a">A</span>
            <input type="color" value={style.color || '#1e293b'} onChange={(e) => patchStyle('color', e.target.value)} />
          </label>
          <div className="editor-floating-toolbar__size-stepper">
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.max(0.2, (style.stroke_width || 0.6) - 0.2)))}>−</button>
            <span>{(style.stroke_width || 0.6).toFixed(1)} mm</span>
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.min(8, (style.stroke_width || 0.6) + 0.2)))}>+</button>
          </div>
        </>
      )}

      {isIcon && (
        <label className="editor-floating-toolbar__color-btn" title="Couleur icône">
          <span className="editor-floating-toolbar__color-a">A</span>
          <input type="color" value={style.color || '#1e293b'} onChange={(e) => patchStyle('color', e.target.value)} />
        </label>
      )}

      {showText && (
        <>
          <select
            className="editor-floating-toolbar__font"
            value={style.font_family || FONT_FAMILIES[2].value}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => patchStyle('font_family', e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <div className="editor-floating-toolbar__size-stepper">
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('font_size', Math.max(6, fontSize - 1)))}>−</button>
            <span>{fontSize}</span>
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('font_size', Math.min(48, fontSize + 1)))}>+</button>
          </div>
          <label className="editor-floating-toolbar__color-btn" title="Couleur">
            <span className="editor-floating-toolbar__color-a editor-floating-toolbar__color-a--rainbow">A</span>
            <input type="color" value={style.color || '#1e293b'} onChange={(e) => patchStyle('color', e.target.value)} />
          </label>
          <button
            type="button"
            className={isEditing && hasTextSelection() ? (queryCommandState('bold') ? 'is-active' : '') : (style.bold ? 'is-active' : '')}
            onMouseDown={(e) => formatAction(e, () => runCmd('bold'))}
          ><strong>B</strong></button>
          <button
            type="button"
            className={isEditing && hasTextSelection() ? (queryCommandState('italic') ? 'is-active' : '') : (style.italic ? 'is-active' : '')}
            onMouseDown={(e) => formatAction(e, () => runCmd('italic'))}
          ><em>I</em></button>
          <button
            type="button"
            className={isEditing && hasTextSelection() ? (queryCommandState('underline') ? 'is-active' : '') : (style.underline ? 'is-active' : '')}
            onMouseDown={(e) => formatAction(e, () => runCmd('underline'))}
          ><span className="editor-floating-toolbar__u">U</span></button>
          <button
            type="button"
            className={isEditing && hasTextSelection() ? (queryCommandState('strikeThrough') ? 'is-active' : '') : (style.strikethrough ? 'is-active' : '')}
            onMouseDown={(e) => formatAction(e, () => runCmd('strikeThrough'))}
          ><span className="editor-floating-toolbar__s">S</span></button>
          <button
            type="button"
            className="editor-floating-toolbar__case-btn"
            title="Majuscules / minuscules"
            onMouseDown={(e) => formatAction(e, () => toggleTextCase())}
          >
            <span className="editor-floating-toolbar__case-big">A</span>
            <span className="editor-floating-toolbar__case-small">a</span>
          </button>
          <button
            type="button"
            className="is-active"
            title="Alignement (cliquer pour changer)"
            onMouseDown={(e) => formatAction(e, cycleAlign)}
          >
            <AlignIcon align={align} />
          </button>
          <button
            type="button"
            title="Liste"
            onMouseDown={(e) => formatAction(e, () => applyRichTextCommandWithFallback('insertUnorderedList'))}
          >
            <HiListBullet size={18} aria-hidden />
          </button>
          <button type="button" className={effectsOpen ? 'is-active' : ''} onClick={() => setEffectsOpen((v) => !v)}>Effets</button>
          {effectsOpen && (
            <div className="editor-floating-toolbar__popover">
              <label>
                Transparence
                <input type="range" min="0.2" max="1" step="0.05" value={style.opacity ?? 1} onChange={(e) => patchStyle('opacity', parseFloat(e.target.value))} />
              </label>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        className="editor-floating-toolbar__position-btn"
        onClick={() => {
          setEffectsOpen(false);
          onOpenPositionPanel?.();
        }}
      >
        Position
      </button>
    </div>
  );
}
