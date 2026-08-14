import { useEffect, useState } from 'react';

import {
  HEADER_COMPOSER_CONTACT_FIELDS,
  HEADER_COMPOSER_FIELD_LABELS,
  HEADER_COMPOSER_IDENTITY_FIELDS,
  HEADER_COMPOSER_VARIANTS,
  defaultHeaderComposerState,
  resolveHeaderComposerVariant,
  selectedContactBinds,
  selectedIdentityBinds,
} from '../../lib/headerComposerPresets.js';
import '../../styles/HeaderComposerModal.css';

/**
 * Composer guidé En-tête (AXE-334 P0).
 * Design variant + champs + inputs → place sur le canvas.
 */
export default function HeaderComposerModal({
  open,
  cv = null,
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const [variantId, setVariantId] = useState(HEADER_COMPOSER_VARIANTS[0].id);
  const [fields, setFields] = useState(() => defaultHeaderComposerState(cv).fields);
  const [values, setValues] = useState(() => defaultHeaderComposerState(cv).values);

  useEffect(() => {
    if (!open) return;
    const initial = defaultHeaderComposerState(cv);
    setVariantId(HEADER_COMPOSER_VARIANTS[0].id);
    setFields(initial.fields);
    setValues(initial.values);
  }, [open, cv]);

  if (!open) return null;

  const identityOk = selectedIdentityBinds(fields).length > 0;
  const contactOk = selectedContactBinds(fields).length > 0;
  const canPlace = identityOk || contactOk;

  const toggleField = (key) => {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setValue = (key, next) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const handleConfirm = () => {
    if (!canPlace || confirming) return;
    onConfirm?.({
      variantId: resolveHeaderComposerVariant(variantId).id,
      fields: { ...fields },
      values: { ...values },
    });
  };

  const renderFieldRow = (key) => {
    const checked = Boolean(fields[key]);
    const label = HEADER_COMPOSER_FIELD_LABELS[key] || key;
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
  };

  return (
    <div
      className="header-composer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="header-composer-title"
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
            <h2 id="header-composer-title">En-tête du CV</h2>
            <p>
              Choisis un design, coche ce que tu affiches, renseigne tes infos —
              puis place. Tu pourras tout bouger librement ensuite.
            </p>
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
          <div className="header-composer-variants" role="listbox" aria-label="Variantes d’en-tête">
            {HEADER_COMPOSER_VARIANTS.map((variant) => {
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

        <section className="header-composer-section" aria-label="Identité">
          <h3 className="header-composer-section__title">Identité</h3>
          <div className="header-composer-fields">
            {HEADER_COMPOSER_IDENTITY_FIELDS.map(renderFieldRow)}
          </div>
        </section>

        <section className="header-composer-section" aria-label="Contact">
          <h3 className="header-composer-section__title">Contact (optionnel)</h3>
          <div className="header-composer-fields">
            {HEADER_COMPOSER_CONTACT_FIELDS.map(renderFieldRow)}
          </div>
        </section>

        {!canPlace ? (
          <p className="header-composer-warn" role="status">
            Coche au moins un champ pour placer l’en-tête.
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
            {confirming
              ? 'Placement…'
              : contactOk
                ? 'Placer l’en-tête'
                : 'Placer l’identité'}
          </button>
        </footer>
      </div>
    </div>
  );
}
