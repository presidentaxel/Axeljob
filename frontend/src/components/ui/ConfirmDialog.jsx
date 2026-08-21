import { useEffect, useId, useRef } from 'react';

import Button from './Button.jsx';
import '../../styles/ConfirmDialog.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function listFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Dialogue de confirmation design system (remplace `window.confirm`).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.eyebrow]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {'primary' | 'danger'} [props.confirmVariant]
 * @param {() => void} [props.onConfirm]
 * @param {() => void} [props.onCancel]
 */
export default function ConfirmDialog({
  open = false,
  title,
  message = '',
  eyebrow = '',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cardRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      cardRef.current?.querySelector('[data-confirm-primary]')?.focus?.();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = listFocusable(cardRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = cardRef.current?.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={message ? descriptionId : undefined}
    >
      <div
        className="confirm-dialog__backdrop"
        aria-hidden="true"
        onClick={() => onCancel?.()}
      />
      <div className="confirm-dialog__card" ref={cardRef}>
        <header className="confirm-dialog__head">
          <div>
            {eyebrow ? (
              <span className="confirm-dialog__eyebrow ds-label-sm">{eyebrow}</span>
            ) : null}
            <h3 id={titleId} className="confirm-dialog__title ds-heading-md">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="confirm-dialog__close"
            onClick={() => onCancel?.()}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        {message ? (
          <p id={descriptionId} className="confirm-dialog__copy ds-body-md">
            {message}
          </p>
        ) : null}
        <footer className="confirm-dialog__actions">
          <Button type="button" variant="secondary" size="md" onClick={() => onCancel?.()}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="md"
            data-confirm-primary=""
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
