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
  cycleListMode,
  getEditingBlockInnerRoot,
  hasTextSelection,
  queryCommandState,
  toggleTextCase,
} from '../../lib/canvasRichTextFormat.js';
import { CANVAS_FONT_FAMILIES } from '../../lib/canvasFontOptions.js';
import {
  blockSupportsStyleToolbar,
  blockSupportsTextToolbar,
  blockSupportsShapeToolbar,
} from '../../lib/canvasBlockToolbar.js';
import { DEFAULT_TEXT_COLOR } from '../../lib/canvasColorPalette.js';
import '../../styles/EditorFloatingTextToolbar.css';

const ALIGN_OPTIONS = [
  { value: 'left', cmd: 'justifyLeft', Icon: HiBars3BottomLeft },
  { value: 'center', cmd: 'justifyCenter', Icon: HiBars3 },
  { value: 'right', cmd: 'justifyRight', Icon: HiBars3BottomRight },
  { value: 'justify', cmd: 'justifyFull', Icon: HiBars4 },
];

function cssColorToHex(value, fallback = DEFAULT_TEXT_COLOR) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  return fallback;
}

function formatAction(event, fn) {
  event.preventDefault();
  event.stopPropagation();
  fn();
}

function fontLabel(value) {
  return CANVAS_FONT_FAMILIES.find((f) => f.value === value)?.label || 'Police';
}

export default function EditorFloatingTextToolbar({
  block,
  isEditing = false,
  onBlockStylePatch,
  onOpenFontPanel,
  onOpenColorPanel,
  onOpenEffectsPanel,
  onOpenShapePanel,
  onOpenPositionPanel,
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!isEditing) return undefined;
    const onSel = () => tick((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [isEditing]);

  if (!block || !blockSupportsStyleToolbar(block.type)) return null;

  const style = block.style || {};
  const showText = blockSupportsTextToolbar(block.type);
  const showShape = blockSupportsShapeToolbar(block.type);
  const isLine = block.type === 'shape:line';
  const isIcon = block.type === 'icon';
  const isImage = block.type === 'image' || block.type === 'photo';
  const fontSize = style.font_size || 12;
  const align = style.align || 'left';
  const colorPickerValue = cssColorToHex(style.color || DEFAULT_TEXT_COLOR);

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
        patchStyle('font_size', next);
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

  const setAlign = (e, value, cmd) => {
    formatAction(e, () => {
      if (isEditing && showText) {
        applyRichTextCommandWithFallback(cmd);
        if (!hasTextSelection()) patchStyle('align', value);
        return;
      }
      patchStyle('align', value);
    });
  };

  if (isImage) {
    return (
      <div className="editor-format-bar" role="toolbar" aria-label="Image">
        <button type="button" className="editor-format-bar__pill" onClick={() => onOpenPositionPanel?.()}>
          Position
        </button>
      </div>
    );
  }

  return (
    <div
      className="editor-format-bar"
      role="toolbar"
      aria-label="Formatage du bloc"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {showShape && (
        <>
          <button type="button" className="editor-format-bar__pill" onClick={() => onOpenShapePanel?.()}>
            Forme
          </button>
          {isLine && (
            <div className="editor-format-bar__stepper">
              <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.max(0.2, (style.stroke_width || 0.6) - 0.2)))}>−</button>
              <span>{(style.stroke_width || 0.6).toFixed(1)}</span>
              <button type="button" onMouseDown={(e) => formatAction(e, () => patchStyle('stroke_width', Math.min(8, (style.stroke_width || 0.6) + 0.2)))}>+</button>
            </div>
          )}
          <span className="editor-format-bar__sep" aria-hidden />
        </>
      )}

      {isIcon && (
        <>
          <button type="button" className="editor-format-bar__pill" onClick={() => onOpenColorPanel?.()}>
            Couleur
          </button>
          <span className="editor-format-bar__sep" aria-hidden />
        </>
      )}

      {showText && (
        <>
          <button
            type="button"
            className="editor-format-bar__pill editor-format-bar__pill--wide"
            onClick={() => onOpenFontPanel?.()}
          >
            {fontLabel(style.font_family || CANVAS_FONT_FAMILIES[0].value)}
          </button>
          <div className="editor-format-bar__stepper">
            <button type="button" onPointerDown={(e) => stepFontSize(e, -1)}>−</button>
            <span>{fontSize}</span>
            <button type="button" onPointerDown={(e) => stepFontSize(e, 1)}>+</button>
          </div>
          <button
            type="button"
            className="editor-format-bar__color-swatch"
            style={{ backgroundColor: colorPickerValue }}
            title="Couleur"
            aria-label="Couleur"
            onClick={() => onOpenColorPanel?.()}
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
          ><span className="editor-format-bar__u">U</span></button>
          <button
            type="button"
            className={isEditing && hasTextSelection() ? (queryCommandState('strikeThrough') ? 'is-active' : '') : (style.strikethrough ? 'is-active' : '')}
            onMouseDown={(e) => formatAction(e, () => runCmd('strikeThrough'))}
          ><span className="editor-format-bar__s">S</span></button>
          <button
            type="button"
            className="editor-format-bar__case-btn"
            title="Majuscules / minuscules"
            onMouseDown={(e) => formatAction(e, () => toggleTextCase())}
          >
            <span>A</span><span>a</span>
          </button>
          <div className="editor-format-bar__align-group">
            {ALIGN_OPTIONS.map(({ value, cmd, Icon }) => (
              <button
                key={value}
                type="button"
                className={align === value ? 'is-active' : ''}
                title={value}
                onMouseDown={(e) => setAlign(e, value, cmd)}
              >
                <Icon size={17} aria-hidden />
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Liste (puces / numéros)"
            onMouseDown={(e) => formatAction(e, () => cycleListMode())}
          >
            <HiListBullet size={17} aria-hidden />
          </button>
          <label className="editor-format-bar__opacity" title="Transparence">
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={style.opacity ?? 1}
              onChange={(e) => patchStyle('opacity', parseFloat(e.target.value))}
            />
          </label>
          <button type="button" className="editor-format-bar__pill" onClick={() => onOpenEffectsPanel?.()}>
            Effets
          </button>
        </>
      )}

      <button type="button" className="editor-format-bar__pill" onClick={() => onOpenPositionPanel?.()}>
        Position
      </button>
    </div>
  );
}
