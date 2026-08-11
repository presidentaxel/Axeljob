import { useEffect, useMemo, useState } from 'react';

import { formatRelativeTime } from '../../lib/relativeTimeFormat.js';

/**
 * Pill visuelle qui affiche l etat courant de l auto-save.
 *
 * Etats supportes (cf. `lib/autoSaveScheduler.js`) :
 *   - `idle`     -> rien affiche (pas encore de modif).
 *   - `pending`  -> "Modifications en cours…"
 *   - `saving`   -> "Enregistrement…"
 *   - `saved`    -> "Enregistre · il y a 5 s" (avec rafraichissement live).
 *   - `retrying` -> "Nouvelle tentative…" (tentative N/M).
 *   - `error`    -> "Erreur d enregistrement" + tooltip avec le message.
 *
 * Props :
 *   - `state` : machine d etat retournee par `useAutoSave`.
 *   - `onRetry` : optionnel ; bouton "Reessayer" affiche en cas d erreur.
 */
export default function AutoSaveIndicator({ state, onRetry }) {
  const lastSavedRelative = useRelativeTime(state?.lastSavedAt);

  if (!state || state.kind === 'idle' || state.kind === 'disposed') {
    return null;
  }

  if (state.kind === 'pending') {
    return (
      <span className="auto-save-pill auto-save-pill--pending" role="status" aria-live="polite">
        <span className="auto-save-dot auto-save-dot--pulsing" aria-hidden="true" />
        Modifications en cours…
      </span>
    );
  }
  if (state.kind === 'saving') {
    return (
      <span className="auto-save-pill auto-save-pill--saving" role="status" aria-live="polite">
        <span className="auto-save-spinner" aria-hidden="true" />
        Enregistrement…
      </span>
    );
  }
  if (state.kind === 'retrying') {
    const attempt = Number(state.attempt) || 1;
    return (
      <span
        className="auto-save-pill auto-save-pill--retrying"
        role="status"
        aria-live="polite"
        title={state.error?.message || 'Nouvelle tentative en cours'}
      >
        <span className="auto-save-spinner" aria-hidden="true" />
        Nouvelle tentative (#{attempt})…
      </span>
    );
  }
  if (state.kind === 'saved') {
    return (
      <span className="auto-save-pill auto-save-pill--saved" role="status">
        <span className="auto-save-icon-check" aria-hidden="true">✓</span>
        Enregistré{lastSavedRelative ? ` · ${lastSavedRelative}` : ''}
      </span>
    );
  }
  if (state.kind === 'error') {
    return (
      <span className="auto-save-pill auto-save-pill--error" role="alert" title={state.error?.message || 'Erreur'}>
        <span className="auto-save-icon-warn" aria-hidden="true">⚠</span>
        Erreur d’enregistrement
        {typeof onRetry === 'function' && (
          <button
            type="button"
            className="auto-save-retry-btn"
            onClick={onRetry}
            aria-label="Réessayer la sauvegarde"
          >
            Réessayer
          </button>
        )}
      </span>
    );
  }
  return null;
}

/**
 * Petit hook qui formate un timestamp en label relatif ("il y a 5 s",
 * "il y a 2 min") et le rafraichit toutes les 5 secondes.
 */
function useRelativeTime(timestampMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestampMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [timestampMs]);

  return useMemo(() => formatRelativeTime(timestampMs, now), [timestampMs, now]);
}
