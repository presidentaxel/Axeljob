import { useCallback } from 'react';
import {
  BLOCK_GEOMETRY_FIELDS,
  blockHasEditableContent,
  blockHasStyleFields,
  blockIsSemanticBound,
  getBlockContentFields,
  getBlockStyleFields,
  getBlockTypeLabel,
} from '../../lib/blockInspectorSchema.js';

function NumberInput({ label, value, min, max, step, onChange, blockField = false }) {
  const id = `block-field-${label.replace(/\s/g, '-')}`;
  const fieldClass = blockField
    ? 'editor-inspector-field editor-inspector-field--number editor-block-inspector-field'
    : 'editor-inspector-field editor-inspector-field--number';
  return (
    <label className={fieldClass} htmlFor={id}>
      <span className="editor-inspector-field-label">{label}</span>
      <input
        id={id}
        type="number"
        className="editor-inspector-field-control"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

function TextInput({ label, value, placeholder, onChange }) {
  const id = `block-field-${label}`;
  return (
    <label className="editor-inspector-field" htmlFor={id}>
      <span className="editor-inspector-field-label">{label}</span>
      <input
        id={id}
        type="text"
        className="editor-inspector-field-control"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  const id = `block-field-${label}`;
  return (
    <label className="editor-inspector-field editor-inspector-field--textarea" htmlFor={id}>
      <span className="editor-inspector-field-label">{label}</span>
      <textarea
        id={id}
        className="editor-inspector-field-control editor-inspector-textarea"
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function SelectInput({ label, value, choices, onChange }) {
  const id = `block-field-${label}`;
  return (
    <label className="editor-inspector-field editor-inspector-field--select" htmlFor={id}>
      <span className="editor-inspector-field-label">{label}</span>
      <select
        id={id}
        className="editor-inspector-field-control"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  const hex = typeof value === 'string' && value.startsWith('#') ? value : '#000000';
  return (
    <label className="editor-inspector-field editor-inspector-field--color">
      <span className="editor-inspector-field-label">{label}</span>
      <span className="editor-inspector-field-control">
        <input
          type="color"
          className="editor-inspector-color-picker"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          className="editor-inspector-color-hex"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
        />
      </span>
    </label>
  );
}

function BooleanInput({ label, value, onChange }) {
  const id = `block-field-${label}`;
  return (
    <label className="editor-inspector-field editor-inspector-field--boolean" htmlFor={id}>
      <span className="editor-inspector-field-label">{label}</span>
      <span className="editor-inspector-field-control">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </label>
  );
}

/**
 * Panneau inspecteur du bloc selectionne (P3.6).
 */
export default function EditorBlockInspectorPanel({
  block,
  onBlockPatch,
  onBlockStylePatch,
  onBringToFront,
  onSendToBack,
}) {
  const handleGeometry = useCallback((key, value) => {
    if (typeof onBlockPatch === 'function') onBlockPatch({ [key]: value });
  }, [onBlockPatch]);

  const handleContent = useCallback((key, value) => {
    if (typeof onBlockPatch === 'function') onBlockPatch({ [key]: value });
  }, [onBlockPatch]);

  const handleStyle = useCallback((styleKey, value) => {
    if (typeof onBlockStylePatch === 'function') onBlockStylePatch({ [styleKey]: value });
  }, [onBlockStylePatch]);

  if (!block) {
    return (
      <p className="editor-inspector-drawer-empty">
        Sélectionnez un bloc sur le canvas pour l’éditer ici.
      </p>
    );
  }

  const contentFields = getBlockContentFields(block);
  const styleFields = getBlockStyleFields(block);

  return (
    <div className="editor-block-inspector">
      <section className="editor-block-inspector-card editor-block-inspector-card--meta">
        <h3 className="editor-block-inspector-card-title">Bloc</h3>
        <div className="editor-block-inspector-type">
          <span className="editor-block-inspector-type-badge">{getBlockTypeLabel(block.type)}</span>
          <code className="editor-block-inspector-id" title="Identifiant technique">{block.id}</code>
        </div>
        {blockIsSemanticBound(block) && (
          <p className="editor-block-inspector-hint">
            Contenu lié au CV - modifiez-le via l’onglet Contenu ou l’édition guidée.
          </p>
        )}
      </section>

      <section className="editor-block-inspector-card editor-block-inspector-card--geometry">
        <h3 className="editor-block-inspector-card-title">Position et taille</h3>
        <p className="editor-block-inspector-card-kicker">Coordonnées en millimètres (page A4)</p>
        <div className="editor-block-inspector-geometry-grid">
          {BLOCK_GEOMETRY_FIELDS.map((f) => (
            <NumberInput
              key={f.key}
              blockField
              label={f.label}
              value={block[f.key]}
              min={f.min}
              max={f.max}
              step={f.step}
              onChange={(v) => handleGeometry(f.key, f.key === 'z' ? Math.floor(v) : v)}
            />
          ))}
        </div>
      </section>

      <section className="editor-block-inspector-card editor-block-inspector-card--layer">
        <h3 className="editor-block-inspector-card-title">Plan</h3>
        <div className="editor-block-inspector-layer-btns">
          <button type="button" className="editor-block-inspector-layer-btn" onClick={onBringToFront}>
            Premier plan
          </button>
          <button type="button" className="editor-block-inspector-layer-btn editor-block-inspector-layer-btn--secondary" onClick={onSendToBack}>
            Arrière-plan
          </button>
        </div>
      </section>

      {blockHasEditableContent(block) && (
        <section className="editor-block-inspector-card">
          <h3 className="editor-block-inspector-card-title">Contenu du bloc</h3>
          <div className="editor-inspector-group-fields">
            {contentFields.map((f) => {
              if (f.input === 'textarea') {
                return (
                  <TextArea
                    key={f.key}
                    label={f.label}
                    value={block.content}
                    onChange={(v) => handleContent('content', v)}
                  />
                );
              }
              if (f.input === 'number') {
                return (
                  <NumberInput
                    key={f.key}
                    label={f.label}
                    value={block.limit}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={(v) => handleContent('limit', Math.floor(v))}
                  />
                );
              }
              return (
                <TextInput
                  key={f.key}
                  label={f.label}
                  value={block[f.key]}
                  placeholder={f.placeholder}
                  onChange={(v) => handleContent(f.key, v)}
                />
              );
            })}
          </div>
        </section>
      )}

      {blockHasStyleFields(block) && (
        <section className="editor-block-inspector-card">
          <h3 className="editor-block-inspector-card-title">Style</h3>
          <div className="editor-inspector-group-fields">
            {styleFields.map((f) => {
              const val = block.style?.[f.styleKey];
              if (f.input === 'select') {
                return (
                  <SelectInput
                    key={f.styleKey}
                    label={f.label}
                    value={val}
                    choices={f.choices}
                    onChange={(v) => handleStyle(f.styleKey, v)}
                  />
                );
              }
              if (f.input === 'color') {
                return (
                  <ColorInput
                    key={f.styleKey}
                    label={f.label}
                    value={val}
                    onChange={(v) => handleStyle(f.styleKey, v)}
                  />
                );
              }
              if (f.input === 'boolean') {
                return (
                  <BooleanInput
                    key={f.styleKey}
                    label={f.label}
                    value={val}
                    onChange={(v) => handleStyle(f.styleKey, v)}
                  />
                );
              }
              if (f.input === 'number') {
                return (
                  <NumberInput
                    key={f.styleKey}
                    label={f.label}
                    value={val}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={(v) => handleStyle(f.styleKey, v)}
                  />
                );
              }
              return null;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
