import { useState } from 'react';

import { summarizeTransferCandidates } from '../../lib/canvasLayoutTransfer.js';
import '../../styles/EditorCanvaTransferModal.css';

export default function EditorCanvaTransferModal({
  request,
  onConfirm,
  onIgnore,
  onCancel,
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  if (!request) return null;
  const candidates = Array.isArray(request.candidates) ? request.candidates : [];
  const isSwitch = request.mode === 'switch';
  const title = isSwitch
    ? 'Nous avons vu des éléments personnalisés'
    : 'Transférer des éléments';
  const targetLabel = request.label || 'ce brouillon';

  return (
    <div className="editor-canva-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="editor-canva-transfer-title">
      <div className="editor-canva-transfer-modal__card">
        <header className="editor-canva-transfer-modal__head">
          <div>
            <span className="editor-canva-transfer-modal__eyebrow">
              {summarizeTransferCandidates(candidates)}
            </span>
            <h3 id="editor-canva-transfer-title">{title}</h3>
          </div>
          <button
            type="button"
            className="editor-canva-transfer-modal__close"
            onClick={onCancel}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <p className="editor-canva-transfer-modal__copy">
          {isSwitch
            ? `Ces éléments ne font pas partie du template ${targetLabel}. Vous pouvez les ajouter au nouveau brouillon.`
            : `Choisissez si vous voulez ajouter ces éléments au canvas actuel.`}
        </p>
        <ul className="editor-canva-transfer-modal__list">
          {candidates.slice(0, 8).map((candidate) => (
            <li key={`${candidate.pageIndex}-${candidate.blockId}`}>
              <span>{candidate.label}</span>
              <small>Page {(candidate.pageIndex || 0) + 1}</small>
            </li>
          ))}
        </ul>
        {candidates.length > 8 && (
          <p className="editor-canva-transfer-modal__more">
            +{candidates.length - 8} autre(s) élément(s)
          </p>
        )}
        {isSwitch && (
          <label className="editor-canva-transfer-modal__check">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
            />
            Ne plus afficher automatiquement
          </label>
        )}
        <footer className="editor-canva-transfer-modal__actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onIgnore?.({ rememberChoice: dontShowAgain })}
          >
            Ignorer
          </button>
          <button
            type="button"
            className="editor-canva-transfer-modal__primary"
            onClick={() => onConfirm?.({ rememberChoice: dontShowAgain })}
          >
            Ajouter au canvas
          </button>
        </footer>
      </div>
    </div>
  );
}
