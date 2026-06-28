import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiBars3BottomLeft,
  HiBars3,
  HiBars4,
  HiListBullet,
  HiAdjustmentsHorizontal,
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
  cycleListModeOnBlockContent,
  getEditingBlockInnerRoot,
  hasTextSelection,
  queryCommandState,
  toggleTextCase,
} from '../../lib/canvasRichTextFormat.js';
import { buildCanvasFontFamilies, fontLabelFromFamilies } from '../../lib/canvasFontOptions.js';
import {
  blockSupportsStyleToolbar,
  blockSupportsTextToolbar,
  blockSupportsShapeToolbar,
} from '../../lib/canvasBlockToolbar.js';
import { DEFAULT_TEXT_COLOR } from '../../lib/canvasColorPalette.js';
import '../../styles/EditorFloatingTextToolbar.css';

/** Cycle alignement : centre → gauche → justifié */
const ALIGN_CYCLE = [
  { value: 'center', cmd: 'justifyCenter', Icon: HiBars3, title: 'Centré' },
  { value: 'left', cmd: 'justifyLeft', Icon: HiBars3BottomLeft, title: 'Gauche' },
  { value: 'justify', cmd: 'justifyFull', Icon: HiBars4, title: 'Justifié' },
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

function fontLabel(value, families) {
  return fontLabelFromFamilies(families, value);
}

function nextAlignValue(current) {
  if (current === 'center') return ALIGN_CYCLE[1];
  if (current === 'left') return ALIGN_CYCLE[2];
  return ALIGN_CYCLE[0];
}

export default function EditorFloatingTextToolbar({
  block,
  isEditing = false,
  fontFamilies,
  onBlockStylePatch,
  onBlockContentPatch,
  onOpenFontPanel,
  onOpenColorPanel,
  onOpenEffectsPanel,
  onOpenShapePanel,
  onOpenPositionPanel,
}) {
  const families = useMemo(
    () => (fontFamilies?.length ? fontFamilies : buildCanvasFontFamilies()),
    [fontFamilies],
  );
  const [, tick] = useState(0);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const opacityWrapRef = useRef(null);

  useEffect(() => {
    if (!isEditing) return undefined;
    const onSel = () => tick((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [isEditing]);

  useEffect(() => {
    if (!opacityOpen) return undefined;
    const onDoc = (e) => {
      if (opacityWrapRef.current?.contains(e.target)) return;
      setOpacityOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [opacityOpen]);

  if (!block || !blockSupportsStyleToolbar(block.type)) return null;

  const style = block.style || {};
  const showText = blockSupportsTextToolbar(block.type);
  const showShape = blockSupportsShapeToolbar(block.type);
  const isLine = block.type === 'shape:line';
  const isIcon = block.type === 'icon';
  const isImage = block.type === 'image' || block.type === 'photo';
  const fontSize = style.font_size || 12;
  const align = style.align || 'left';
  const alignEntry = ALIGN_CYCLE.find((a) => a.value === align) || ALIGN_CYCLE[1];
  const opacity = style.opacity ?? 1;
  const opacityPercent = Math.round(opacity * 100);
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

  const setOpacityFromPercent = (percent) => {
    const clamped = Math.min(100, Math.max(10, percent));
    patchStyle('opacity', clamped / 100);
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

  const cycleAlign = (e) => {
    formatAction(e, () => {
      const next = nextAlignValue(align);
      if (isEditing && showText) {
        applyRichTextCommandWithFallback(next.cmd);
        if (!hasTextSelection()) patchStyle('align', next.value);
        return;
      }
      patchStyle('align', next.value);
    });
  };

  const handleCaseToggle = (e) => {
    formatAction(e, () => {
      if (isEditing && showText) {
        toggleTextCase();
        return;
      }
      if (typeof onBlockContentPatch !== 'function') return;
      onBlockContentPatch({ toggleCase: true });
    });
  };

  const handleListToggle = (e) => {
    formatAction(e, () => {
      if (isEditing && showText) {
        cycleListMode();
        return;
      }
      if (typeof onBlockContentPatch !== 'function') return;
      const next = cycleListModeOnBlockContent(block.content);
      onBlockContentPatch({ content: next });
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

  const AlignIcon = alignEntry.Icon;

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
            {fontLabel(style.font_family || families[0]?.value, families)}
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
            onMouseDown={handleCaseToggle}
          >
            <span className="editor-format-bar__case-a">A</span>
            <span className="editor-format-bar__case-a editor-format-bar__case-a--small">a</span>
          </button>
          <button
            type="button"
            className={alignEntry.value === align ? 'is-active' : ''}
            title={`Alignement : ${alignEntry.title} (cliquer pour changer)`}
            aria-label={`Alignement : ${alignEntry.title}`}
            onMouseDown={cycleAlign}
          >
            <AlignIcon size={17} aria-hidden />
          </button>
          <button
            type="button"
            title="Liste (puces / numéros)"
            onMouseDown={handleListToggle}
          >
            <HiListBullet size={17} aria-hidden />
          </button>
          <div className="editor-format-bar__opacity-wrap" ref={opacityWrapRef}>
            <button
              type="button"
              className={opacityOpen ? 'is-active' : ''}
              title="Transparence"
              aria-label="Transparence"
              aria-expanded={opacityOpen}
              onClick={() => setOpacityOpen((v) => !v)}
            >
              <HiAdjustmentsHorizontal size={17} aria-hidden />
            </button>
            {opacityOpen && (
              <div className="editor-format-bar__opacity-popover" role="group" aria-label="Transparence">
                <span className="editor-format-bar__opacity-label">Opacité</span>
                <div className="ds-range-row">
                  <input
                    type="range"
                    className="ds-range"
                    min="10"
                    max="100"
                    step="5"
                    value={opacityPercent}
                    onChange={(e) => setOpacityFromPercent(parseInt(e.target.value, 10))}
                  />
                  <input
                    type="text"
                    className="ds-range-input"
                    inputMode="numeric"
                    value={opacityPercent}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      if (!Number.isNaN(n)) setOpacityFromPercent(n);
                    }}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      setOpacityFromPercent(Number.isNaN(n) ? opacityPercent : n);
                    }}
                    aria-label="Opacité en pourcentage"
                  />
                  <span className="editor-format-bar__opacity-suffix">%</span>
                </div>
              </div>
            )}
          </div>
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
