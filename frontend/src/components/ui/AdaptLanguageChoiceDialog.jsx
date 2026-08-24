import { useEffect, useId, useRef, useState } from 'react';

import Button from './Button.jsx';
import '../../styles/ConfirmDialog.css';
import { adaptLanguageChoiceCopy } from '../../lib/adaptLanguageNotice.js';

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
 * Choix langue CV vs annonce (AXE-357). Fermer / overlay = garder la langue du CV.
 */
export default function AdaptLanguageChoiceDialog({
  open = false,
  cvLanguage,
  offerLanguage,
  rememberDefault = false,
  onKeepCv,
  onUseOffer,
}) {
  const copy = adaptLanguageChoiceCopy(cvLanguage, offerLanguage);
  const titleId = useId();
  const descriptionId = useId();
  const rememberId = useId();
  const cardRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [remember, setRemember] = useState(Boolean(rememberDefault));

  useEffect(() => {
    if (!open) return undefined;
    setRemember(Boolean(rememberDefault));
    return undefined;
  }, [open, rememberDefault]);

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
        onKeepCv?.({ remember });
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
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open, onKeepCv, remember]);

  if (!open || !copy) return null;

  return (
    <div
      className="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className="confirm-dialog__backdrop"
        aria-hidden="true"
        onClick={() => onKeepCv?.({ remember })}
      />
      <div className="confirm-dialog__card" ref={cardRef}>
        <header className="confirm-dialog__head">
          <div>
            <span className="confirm-dialog__eyebrow ds-label-sm">{copy.eyebrow}</span>
            <h3 id={titleId} className="confirm-dialog__title ds-heading-md">
              {copy.title}
            </h3>
          </div>
          <button
            type="button"
            className="confirm-dialog__close"
            onClick={() => onKeepCv?.({ remember })}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <p id={descriptionId} className="confirm-dialog__copy ds-body-md">
          {copy.message}
        </p>
        <label className="confirm-dialog__remember ds-body-md" htmlFor={rememberId}>
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>{copy.rememberLabel}</span>
        </label>
        <footer className="confirm-dialog__actions">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => onUseOffer?.({ remember })}
          >
            {copy.offerLabel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            data-confirm-primary=""
            onClick={() => onKeepCv?.({ remember })}
          >
            {copy.keepLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
