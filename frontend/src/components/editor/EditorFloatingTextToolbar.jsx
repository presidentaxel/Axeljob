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
  applyRichTextCommand,
  applyRichTextCommandWithFallback,
  getEditingBlockInnerRoot,
  hasTextSelection,
  queryCommandState,
  toggleTextCase,
} from '../../lib/canvasRichTextFormat.js';
import { CANVAS_FONT_FAMILIES } from '../../lib/canvasFontOptions.js';
import { blockSupportsTextToolbar } from '../../lib/canvasBlockToolbar.js';
import '../../styles/EditorFloatingTextToolbar.css';

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
  isEditing = false,
  onBlockStylePatch,
  onOpenPositionPanel,
}) {
  const colorInputRef = useRef(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!isEditing) return undefined;
    const onSel = () => tick((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [isEditing]);

  if (!block || !blockSupportsTextToolbar(block.type)) return null;

  const style = block.style || {};
  const isLine = block.type === 'shape:line';
  const isIcon = block.type === 'icon';
  const showText = blockSupportsTextToolbar(block.type);
  const fontSize = style.font_size || 12;
  const align = style.align || 'left';

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
      className="editor-floating-toolbar"
      role="toolbar"
      aria-label="Formatage du bloc"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isLine && (
        <>
          <button type="button" className="editor-floating-toolbar__color-btn" title="Couleur" onMouseDown={openColorPicker}>
            <span className="editor-floating-toolbar__color-a">A</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="editor-floating-toolbar__color-input-hidden"
            value={style.color || '#1e293b'}
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
            value={style.color || '#1e293b'}
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
            <button type="button" onMouseDown={(e) => stepFontSize(e, -1)}>−</button>
            <span>{fontSize}</span>
            <button type="button" onMouseDown={(e) => stepFontSize(e, 1)}>+</button>
          </div>
          <button type="button" className="editor-floating-toolbar__color-btn" title="Couleur" onMouseDown={openColorPicker}>
            <span className="editor-floating-toolbar__color-a editor-floating-toolbar__color-a--rainbow">A</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="editor-floating-toolbar__color-input-hidden"
            value={style.color || '#1e293b'}
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
    </div>
  );
}
