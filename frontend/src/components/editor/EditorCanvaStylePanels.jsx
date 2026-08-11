import { buildCanvasFontFamilies, fontPickerPreviewFamily } from '../../lib/canvasFontOptions.js';
import { CANVAS_COLOR_SWATCHES } from '../../lib/canvasColorPalette.js';
import { CANVAS_BLOCK_EFFECTS } from '../../lib/canvasBlockEffects.js';
import '../../styles/EditorCanvaStylePanels.css';

function SwatchGrid({ value, onChange }) {
  return (
    <div className="editor-style-panel__swatches" role="list">
      {CANVAS_COLOR_SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          role="listitem"
          className={`editor-style-panel__swatch${value === color ? ' editor-style-panel__swatch--active' : ''}`}
          style={{ backgroundColor: color }}
          title={color}
          aria-label={color}
          onClick={() => onChange?.(color)}
        />
      ))}
    </div>
  );
}

export function EditorCanvaFontPanel({ block, onBlockStylePatch, fontFamilies }) {
  const families = fontFamilies?.length ? fontFamilies : buildCanvasFontFamilies();
  const style = block?.style || {};
  const current = style.font_family || families[0]?.value;

  return (
    <div className="editor-style-panel editor-style-panel--font">
      <h3 className="editor-style-panel__title">Police</h3>
      <ul className="editor-style-panel__font-list">
        {families.map((font) => (
          <li key={font.value}>
            <button
              type="button"
              className={`editor-style-panel__font-item${current === font.value ? ' is-active' : ''}`}
              style={{ fontFamily: fontPickerPreviewFamily(font) }}
              onClick={() => onBlockStylePatch?.({ font_family: font.value })}
            >
              {font.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EditorCanvaColorPanel({ block, onBlockStylePatch, mode = 'text' }) {
  const style = block?.style || {};
  const isShape = mode === 'shape';
  const colorKey = isShape ? 'color' : 'color';
  const current = style[colorKey] || '#17171c';

  return (
    <div className="editor-style-panel">
      <h3 className="editor-style-panel__title">Couleur</h3>
      <SwatchGrid
        value={current}
        onChange={(c) => onBlockStylePatch?.({ [colorKey]: c })}
      />
      <label className="editor-style-panel__picker-row">
        <span>Personnalisée</span>
        <input
          type="color"
          value={current.startsWith('#') && current.length >= 7 ? current.slice(0, 7) : '#17171c'}
          onChange={(e) => onBlockStylePatch?.({ [colorKey]: e.target.value })}
        />
      </label>
      {isShape && (
        <>
          <h4 className="editor-style-panel__subtitle">Contour</h4>
          <SwatchGrid
            value={style.stroke_color || '#17171c'}
            onChange={(c) => onBlockStylePatch?.({ stroke_color: c })}
          />
        </>
      )}
    </div>
  );
}

export function EditorCanvaEffectsPanel({ block, onBlockStylePatch }) {
  const style = block?.style || {};
  const effect = style.effect || 'none';
  const opacity = style.opacity ?? 1;

  return (
    <div className="editor-style-panel">
      <h3 className="editor-style-panel__title">Effets</h3>
      <div className="editor-style-panel__effect-grid">
        {CANVAS_BLOCK_EFFECTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`editor-style-panel__effect-tile${effect === item.id ? ' is-active' : ''}`}
            onClick={() => onBlockStylePatch?.({ effect: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="editor-style-panel__range-row">
        <span>Transparence</span>
        <input
          type="range"
          className="ds-range"
          min="10"
          max="100"
          step="5"
          value={Math.round(opacity * 100)}
          onChange={(e) => onBlockStylePatch?.({ opacity: parseInt(e.target.value, 10) / 100 })}
        />
        <span className="editor-style-panel__range-value">{Math.round(opacity * 100)}%</span>
      </label>
      {effect !== 'none' && (
        <label className="editor-style-panel__picker-row">
          <span>Couleur d&apos;effet</span>
          <input
            type="color"
            value={style.effect_color || style.color || '#17171c'}
            onChange={(e) => onBlockStylePatch?.({ effect_color: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export function EditorCanvaShapePanel({ block, onBlockStylePatch }) {
  const style = block?.style || {};
  const strokeWidth = style.stroke_width ?? 0;

  return (
    <div className="editor-style-panel">
      <h3 className="editor-style-panel__title">Forme</h3>
      <EditorCanvaColorPanel block={block} onBlockStylePatch={onBlockStylePatch} mode="shape" />
      <label className="editor-style-panel__range-row">
        <span>Épaisseur</span>
        <input
          type="range"
          className="ds-range"
          min="0"
          max="4"
          step="0.1"
          value={strokeWidth}
          onChange={(e) => onBlockStylePatch?.({ stroke_width: parseFloat(e.target.value) })}
        />
        <span className="editor-style-panel__range-value">{strokeWidth.toFixed(1)} mm</span>
      </label>
      <EditorCanvaEffectsPanel block={block} onBlockStylePatch={onBlockStylePatch} />
    </div>
  );
}
