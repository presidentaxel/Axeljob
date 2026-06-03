import { useEffect, useRef, useState } from 'react';
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
  applyStyleToBlockEditables,
  applyStyleToEditableRoot,
  bumpFontSizesBy,
  applyRichTextCommandWithFallback,
  getEditingBlockInnerRoot,
  hasTextSelection,
  queryCommandState,
  toggleTextCase,
} from '../../lib/canvasRichTextFormat.js';
import { CANVAS_FONT_FAMILIES } from '../../lib/canvasFontOptions.js';
import { blockSupportsStyleToolbar, blockSupportsTextToolbar } from '../../lib/canvasBlockToolbar.js';
import '../../styles/EditorFloatingTextToolbar.css';

const ALIGN_CYCLE = ['left', 'center', 'right', 'justify'];
const ALIGN_CMD = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
};

const DEFAULT_COLOR = '#1e293b';

function cssColorToHex(value, fallback = DEFAULT_COLOR) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  const short = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
    if (parts.every((n) => Number.isFinite(n))) {
      return `#${parts
        .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
        .join('')}`;
    }
  }
  return fallback;
}

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
  isEditing = false,
  onBlockStylePatch,
  onOpenPositionPanel,
  onDuplicateBlock,
  onToggleLockBlock,
  onDeleteBlock,
}) {
  const toolbarRef = useRef(null);
  const dragSessionRef = useRef(null);
  const colorInputRef = useRef(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [toolbarPos, setToolbarPos] = useState(null);
  const [draggingToolbar, setDraggingToolbar] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!isEditing) return undefined;
    const onSel = () => tick((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [isEditing]);

  if (!block || !blockSupportsStyleToolbar(block.type)) return null;

  const style = block.style || {};
  const isLine = block.type === 'shape:line';
  const isIcon = block.type === 'icon';
  const showText = blockSupportsTextToolbar(block.type);
  const fontSize = style.font_size || 12;
  const align = style.align || 'left';
  const colorPickerValue = cssColorToHex(style.color || DEFAULT_COLOR);
  const toolbarStyle = toolbarPos
    ? { top: `${toolbarPos.top}px`, left: `${toolbarPos.left}px`, transform: 'none' }
    : undefined;

  const startToolbarDrag = (event) => {
    const el = toolbarRef.current;
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent;
    const parentRect = parent?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const startLeft = rect.left - parentRect.left + (parent?.scrollLeft || 0);
    const startTop = rect.top - parentRect.top + (parent?.scrollTop || 0);
    dragSessionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft,
      startTop,
      width: rect.width,
      height: rect.height,
      maxLeft: Math.max(8, (parent?.clientWidth || window.innerWidth) - rect.width - 8),
      maxTop: Math.max(8, (parent?.clientHeight || window.innerHeight) - rect.height - 8),
    };
    setToolbarPos({ left: startLeft, top: startTop });
    setDraggingToolbar(true);
    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const moveToolbarDrag = (event) => {
    const session = dragSessionRef.current;
    if (!session) return;
    event.preventDefault();
    const margin = 8;
    const nextLeft = session.startLeft + event.clientX - session.startClientX;
    const nextTop = session.startTop + event.clientY - session.startClientY;
    setToolbarPos({
      left: Math.min(session.maxLeft, Math.max(margin, nextLeft)),
      top: Math.min(session.maxTop, Math.max(margin, nextTop)),
    });
  };

  const endToolbarDrag = (event) => {
    if (!dragSessionRef.current) return;
    dragSessionRef.current = null;
    setDraggingToolbar(false);
    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    }
  };

  const openColorPicker = (e) => {
    formatAction(e, () => colorInputRef.current?.click());
  };

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
      if (map[key]) {
        applyStyleToEditableRoot(map[key]);
        applyStyleToBlockEditables(getEditingBlockInnerRoot(), map[key]);
      }
    }
  };

  const stepFontSize = (e, delta) => {
    formatAction(e, () => {
      if (isEditing && showText) {
        if (bumpFontSizesBy(delta)) return;
        if (hasTextSelection()) {
          applyFontSizeToSelection(Math.min(48, Math.max(6, fontSize + delta)));
          return;
        }
        const next = Math.min(48, Math.max(6, fontSize + delta));
        const map = { fontSize: `${next}pt` };
        applyStyleToEditableRoot(map);
        applyStyleToBlockEditables(getEditingBlockInnerRoot(), map);
        if (typeof onBlockStylePatch === 'function') onBlockStylePatch({ font_size: next });
        return;
      }
      patchStyle('font_size', Math.min(48, Math.max(6, fontSize + delta)));
    });
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
      ref={toolbarRef}
      className={`editor-floating-toolbar${draggingToolbar ? ' editor-floating-toolbar--dragging' : ''}`}
      style={toolbarStyle}
      role="toolbar"
      aria-label="Formatage du bloc"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="editor-floating-toolbar__handle"
        title="Deplacer la barre d'outils"
        aria-label="Deplacer la barre d'outils"
        onPointerDown={startToolbarDrag}
        onPointerMove={moveToolbarDrag}
        onPointerUp={endToolbarDrag}
        onPointerCancel={endToolbarDrag}
      >
        <span aria-hidden="true" />
      </button>
      {isLine && (
        <>
          <button type="button" className="editor-floating-toolbar__color-btn" title="Couleur" onMouseDown={openColorPicker}>
            <span className="editor-floating-toolbar__color-a">A</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="editor-floating-toolbar__color-input-hidden"
            value={colorPickerValue}
            onChange={(e) => patchStyle('color', e.target.value)}
            tabIndex={-1}
            aria-hidden
          />
          <div className="editor-floating-toolbar__size-stepper">
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.max(0.2, (style.stroke_width || 0.6) - 0.2)))}>−</button>
            <span>{(style.stroke_width || 0.6).toFixed(1)} mm</span>
            <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.min(8, (style.stroke_width || 0.6) + 0.2)))}>+</button>
          </div>
        </>
      )}

      {isIcon && (
        <>
          <button type="button" className="editor-floating-toolbar__color-btn" title="Couleur icône" onMouseDown={openColorPicker}>
            <span className="editor-floating-toolbar__color-a">A</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="editor-floating-toolbar__color-input-hidden"
            value={colorPickerValue}
            onChange={(e) => patchStyle('color', e.target.value)}
            tabIndex={-1}
            aria-hidden
          />
        </>
      )}

      {showText && (
        <>
          <select
            className="editor-floating-toolbar__font"
            value={style.font_family || CANVAS_FONT_FAMILIES[0].value}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => patchStyle('font_family', e.target.value)}
          >
            {CANVAS_FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <div className="editor-floating-toolbar__size-stepper">
            <button type="button" onPointerDown={(e) => stepFontSize(e, -1)}>−</button>
            <span>{fontSize}</span>
            <button type="button" onPointerDown={(e) => stepFontSize(e, 1)}>+</button>
          </div>
          <button type="button" className="editor-floating-toolbar__color-btn" title="Couleur" onMouseDown={openColorPicker}>
            <span className="editor-floating-toolbar__color-a editor-floating-toolbar__color-a--rainbow">A</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="editor-floating-toolbar__color-input-hidden"
            value={colorPickerValue}
            onChange={(e) => patchStyle('color', e.target.value)}
            tabIndex={-1}
            aria-hidden
          />
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
      <span className="editor-floating-toolbar__divider" aria-hidden="true" />
      <button
        type="button"
        title="Dupliquer le bloc"
        aria-label="Dupliquer le bloc selectionne"
        onMouseDown={(e) => formatAction(e, () => onDuplicateBlock?.())}
      >
        Dupliquer
      </button>
      <button
        type="button"
        title={block.locked ? 'Deverrouiller le bloc' : 'Verrouiller le bloc'}
        aria-label={block.locked ? 'Deverrouiller le bloc selectionne' : 'Verrouiller le bloc selectionne'}
        className={block.locked ? 'is-active' : ''}
        onMouseDown={(e) => formatAction(e, () => onToggleLockBlock?.())}
      >
        {block.locked ? 'Deverr.' : 'Verrou'}
      </button>
      <button
        type="button"
        className="editor-floating-toolbar__danger-btn"
        title="Supprimer le bloc"
        aria-label="Supprimer le bloc selectionne"
        onMouseDown={(e) => formatAction(e, () => onDeleteBlock?.())}
      >
        Suppr.
      </button>
    </div>
  );
}
