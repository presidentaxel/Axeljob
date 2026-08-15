import { useEffect, useState } from 'react';

import {
  CONTACT_COMPOSER_FIELDS,
  CONTACT_COMPOSER_FIELD_LABELS,
  SECTION_COMPOSER_META,
  SECTION_COMPOSER_VARIANTS,
  canPlaceSectionComposer,
  createEmptyComposerItem,
  defaultSectionComposerState,
  getListItemFields,
  resolveSectionComposerVariant,
} from '../../lib/sectionComposerPresets.js';
import '../../styles/HeaderComposerModal.css';

/**
 * Composer guidé pour une section CV (AXE-340) — même UX que l’en-tête.
 */
export default function SectionComposerModal({
  open,
  sectionType = null,
  cv = null,
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const meta = sectionType ? SECTION_COMPOSER_META[sectionType] : null;
  const variants = sectionType ? (SECTION_COMPOSER_VARIANTS[sectionType] || []) : [];

  const [variantId, setVariantId] = useState(variants[0]?.id || 'classic');
  const [fields, setFields] = useState({});
  const [values, setValues] = useState({});
  const [text, setText] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open || !sectionType) return;
    const initial = defaultSectionComposerState(sectionType, cv);
    setVariantId(initial.variantId);
    setFields(initial.fields || {});
    setValues(initial.values || {});
    setText(initial.text || '');
    setSkillsText(initial.skillsText || '');
    setItems(Array.isArray(initial.items) ? initial.items : []);
  }, [open, sectionType, cv]);

  if (!open || !sectionType || !meta) return null;

  const state = { variantId, fields, values, text, skillsText, items };
  const canPlace = canPlaceSectionComposer(sectionType, state);

  const toggleField = (key) => {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setValue = (key, next) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const updateItem = (index, key, next) => {
    setItems((prev) => prev.map((row, i) => (
      i === index ? { ...row, [key]: next } : row
    )));
  };

  const addItem = () => {
    setItems((prev) => [...prev, createEmptyComposerItem(sectionType)]);
  };

  const removeItem = (index) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleConfirm = () => {
    if (!canPlace || confirming) return;
    onConfirm?.({
      sectionType,
      variantId: resolveSectionComposerVariant(sectionType, variantId).id,
      fields: { ...fields },
      values: { ...values },
      text,
      skillsText,
      items: items.map((row) => ({ ...row })),
    });
  };

  const renderContactFields = () => (
    <section className="header-composer-section" aria-label="Champs contact">
      <h3 className="header-composer-section__title">Champs</h3>
      <div className="header-composer-fields">
        {CONTACT_COMPOSER_FIELDS.map((key) => {
          const checked = Boolean(fields[key]);
          const label = CONTACT_COMPOSER_FIELD_LABELS[key] || key;
          return (
            <div key={key} className="header-composer-field">
              <label className="header-composer-field__check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(key)}
                  disabled={confirming}
                />
                <span>{label}</span>
              </label>
              {checked ? (
                <input
                  type="text"
                  className="header-composer-field__input"
                  value={values[key] || ''}
                  onChange={(e) => setValue(key, e.target.value)}
                  placeholder={label}
                  disabled={confirming}
                  autoComplete="off"
                />
              ) : (
                <p className="header-composer-field__hint">
                  Masqué sur le canvas — reste dans ton CV
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderText = () => (
    <section className="header-composer-section" aria-label="Contenu">
      <h3 className="header-composer-section__title">Contenu</h3>
      <textarea
        className="header-composer-field__input"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quelques lignes sur ton parcours…"
        disabled={confirming}
        style={{ width: '100%', resize: 'vertical', minHeight: '6rem' }}
      />
    </section>
  );

  const renderSkills = () => (
    <section className="header-composer-section" aria-label="Compétences">
      <h3 className="header-composer-section__title">Compétences (une par ligne)</h3>
      <textarea
        className="header-composer-field__input"
        rows={6}
        value={skillsText}
        onChange={(e) => setSkillsText(e.target.value)}
        placeholder={'React\nTypeScript\nSQL'}
        disabled={confirming}
        style={{ width: '100%', resize: 'vertical', minHeight: '7rem' }}
      />
    </section>
  );

  const renderLanguages = () => (
    <section className="header-composer-section" aria-label="Langues">
      <h3 className="header-composer-section__title">Langues</h3>
      <div className="header-composer-fields">
        {items.map((row, index) => (
          <div key={row.id || index} className="header-composer-field" style={{ gap: '0.45rem' }}>
            <input
              type="text"
              className="header-composer-field__input"
              value={row.langue || ''}
              onChange={(e) => updateItem(index, 'langue', e.target.value)}
              placeholder="Langue"
              disabled={confirming}
            />
            <input
              type="text"
              className="header-composer-field__input"
              value={row.niveau || ''}
              onChange={(e) => updateItem(index, 'niveau', e.target.value)}
              placeholder="Niveau"
              disabled={confirming}
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={confirming || items.length <= 1}
            >
              Retirer
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} disabled={confirming}>
          Ajouter une langue
        </button>
      </div>
    </section>
  );

  const renderList = () => {
    const itemFields = getListItemFields(sectionType);
    return (
      <section className="header-composer-section" aria-label="Éléments">
        <h3 className="header-composer-section__title">Éléments</h3>
        <div className="header-composer-fields">
          {items.map((row, index) => (
            <div
              key={row.id || index}
              className="header-composer-field"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '0.4rem',
                paddingBottom: '0.65rem',
                borderBottom: '1px solid var(--color-hairline, #d9d9dd)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.78rem', fontWeight: 500 }}>
                  #{index + 1}
                </strong>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={confirming || items.length <= 1}
                >
                  Retirer
                </button>
              </div>
              {itemFields.map((field) => (
                field.multiline ? (
                  <textarea
                    key={field.key}
                    className="header-composer-field__input"
                    rows={3}
                    value={row[field.key] || ''}
                    onChange={(e) => updateItem(index, field.key, e.target.value)}
                    placeholder={field.label}
                    disabled={confirming}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                ) : (
                  <input
                    key={field.key}
                    type="text"
                    className="header-composer-field__input"
                    value={row[field.key] || ''}
                    onChange={(e) => updateItem(index, field.key, e.target.value)}
                    placeholder={field.label}
                    disabled={confirming}
                  />
                )
              ))}
            </div>
          ))}
          <button type="button" onClick={addItem} disabled={confirming}>
            Ajouter
          </button>
        </div>
      </section>
    );
  };

  const renderPhotoNote = () => (
    <section className="header-composer-section" aria-label="Photo">
      <p className="header-composer-field__hint" style={{ margin: 0 }}>
        Le cadre est placé avec le style choisi. Ajoute ou change la photo ensuite
        en cliquant le bloc sur le canvas (champ photo du CV).
      </p>
    </section>
  );

  return (
    <div
      className="header-composer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-composer-title"
      onClick={() => {
        if (!confirming) onCancel?.();
      }}
    >
      <div
        className="header-composer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="header-composer-head">
          <div>
            <span className="header-composer-eyebrow">Composer</span>
            <h2 id="section-composer-title">{meta.title}</h2>
            <p>{meta.hint}</p>
          </div>
          <button
            type="button"
            className="header-composer-close"
            onClick={() => onCancel?.()}
            aria-label="Fermer"
            disabled={confirming}
          >
            ×
          </button>
        </header>

        <section className="header-composer-section" aria-label="Design">
          <h3 className="header-composer-section__title">Design</h3>
          <div className="header-composer-variants" role="listbox" aria-label={`Variantes ${meta.label}`}>
            {variants.map((variant) => {
              const selected = variant.id === variantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`header-composer-variant${selected ? ' is-selected' : ''}`}
                  onClick={() => setVariantId(variant.id)}
                  disabled={confirming}
                >
                  <span
                    className={`header-composer-variant__preview header-composer-variant__preview--${variant.id}`}
                    aria-hidden
                  />
                  <strong>{variant.label}</strong>
                  <span>{variant.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {meta.kind === 'fields' && renderContactFields()}
        {meta.kind === 'text' && renderText()}
        {meta.kind === 'skills' && renderSkills()}
        {meta.kind === 'languages' && renderLanguages()}
        {meta.kind === 'list' && renderList()}
        {meta.kind === 'photo' && renderPhotoNote()}

        {!canPlace ? (
          <p className="header-composer-warn" role="status">
            Complète au moins un élément pour placer la section.
          </p>
        ) : null}

        <footer className="header-composer-actions">
          <button type="button" onClick={() => onCancel?.()} disabled={confirming}>
            Annuler
          </button>
          <button
            type="button"
            className="header-composer-primary"
            onClick={handleConfirm}
            disabled={!canPlace || confirming}
          >
            {confirming ? 'Placement…' : `Placer — ${meta.label}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
