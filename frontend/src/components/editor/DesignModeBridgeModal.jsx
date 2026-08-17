import {
  dismissDesignBridge,
} from '../../lib/designModeBridge.js';
import '../../styles/DesignModeBridgeModal.css';

/**
 * Modal opt-in pour appliquer un design Stable ↔ Beta (AXE-335).
 * Aucune application automatique — l’utilisateur confirme.
 */
export default function DesignModeBridgeModal({
  offer = null,
  confirming = false,
  variant = 'editor',
  onConfirm,
  onDismiss,
}) {
  if (!offer) return null;

  const handleDismiss = (remember) => {
    if (remember) {
      dismissDesignBridge(offer.direction, offer.templateId);
    }
    onDismiss?.({ rememberChoice: Boolean(remember) });
  };

  return (
    <div
      className={`design-mode-bridge-modal${variant === 'profile' ? ' design-mode-bridge-modal--profile' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="design-mode-bridge-title"
    >
      <div className="design-mode-bridge-modal__card">
        <header className="design-mode-bridge-modal__head">
          <div>
            <span className="design-mode-bridge-modal__eyebrow">Design Stable ↔ Beta</span>
            <h3 id="design-mode-bridge-title">{offer.title}</h3>
          </div>
          <button
            type="button"
            className="design-mode-bridge-modal__close"
            onClick={() => handleDismiss(false)}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <p className="design-mode-bridge-modal__copy">{offer.copy}</p>
        {Array.isArray(offer.warnings) && offer.warnings.length > 0 && (
          <ul className="design-mode-bridge-modal__warnings">
            {offer.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        <footer className="design-mode-bridge-modal__actions">
          <button type="button" onClick={() => handleDismiss(true)} disabled={confirming}>
            Garder tel quel
          </button>
          <button
            type="button"
            className="design-mode-bridge-modal__primary"
            onClick={() => onConfirm?.(offer)}
            disabled={confirming}
          >
            {confirming
              ? 'Application…'
              : offer.direction === 'stable_to_beta'
                ? `Appliquer « ${offer.templateLabel} »`
                : `Utiliser « ${offer.templateLabel} »`}
          </button>
        </footer>
      </div>
    </div>
  );
}
