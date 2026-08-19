import { useEffect, useId, useRef, useState } from 'react';

import '../../styles/DocxExportNoticeModal.css';

/**
 * Mini pop-up avant export Word : la mise en page n’est pas identique au canvas.
 */
export default function DocxExportNoticeModal({
  open = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const checkboxId = useId();
  const primaryRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setDontShowAgain(false);
    const t = window.setTimeout(() => primaryRef.current?.focus?.(), 0);
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="docx-export-notice-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="docx-export-notice-modal__card">
        <header className="docx-export-notice-modal__head">
          <div>
            <span className="docx-export-notice-modal__eyebrow">Export Word</span>
            <h3 id={titleId}>Le Word n’est pas identique au PDF</h3>
          </div>
          <button
            type="button"
            className="docx-export-notice-modal__close"
            onClick={() => onCancel?.()}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <p className="docx-export-notice-modal__copy">
          Word reprend ton contenu et une mise en page simple.
          Pour un rendu fidèle, préfère le PDF.
        </p>
        <label className="docx-export-notice-modal__check" htmlFor={checkboxId}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          Ne plus afficher ce message
        </label>
        <footer className="docx-export-notice-modal__actions">
          <button type="button" onClick={() => onCancel?.()}>
            Annuler
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="docx-export-notice-modal__primary"
            onClick={() => onConfirm?.({ dontShowAgain })}
          >
            Télécharger Word
          </button>
        </footer>
      </div>
    </div>
  );
}
