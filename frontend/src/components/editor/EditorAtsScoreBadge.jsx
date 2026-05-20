import { useState } from 'react';

import { scoreToneFor } from '../../lib/atsScoreClient.js';
import { useAtsScoreFetching } from '../../lib/useAtsScoreFetching.js';

/**
 * Badge ATS avec debounce, retry et dernier score conserve pendant le chargement.
 *
 * @param {boolean} [paused] — true pendant drag/resize canvas (pas de rafale API).
 */
export default function EditorAtsScoreBadge({
  templateId,
  layout,
  cv,
  paused = false,
  onScoreChange,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { status, data, error, stale, refreshNow } = useAtsScoreFetching({
    templateId,
    layout,
    cv,
    paused,
    onScoreChange,
  });

  if (status === 'idle') {
    return null;
  }

  const showScore = data && (status === 'ok' || status === 'loading' || (status === 'error' && stale));
  const score = showScore ? (data.score ?? 0) : null;
  const tone = score !== null ? scoreToneFor(score) : 'unknown';
  const rules = Array.isArray(data?.rules) ? data.rules : [];

  if (status === 'loading' && !showScore) {
    return (
      <span className="ats-badge ats-badge--loading" aria-live="polite">
        ATS : …
      </span>
    );
  }

  if (status === 'error' && !showScore) {
    return (
      <span className="ats-badge-wrap">
        <button
          type="button"
          className="ats-badge ats-badge--error"
          title={error || 'Erreur ATS — cliquer pour réessayer'}
          onClick={() => refreshNow()}
        >
          ATS : indispo
        </button>
      </span>
    );
  }

  return (
    <span className="ats-badge-wrap">
      <button
        type="button"
        className={[
          'ats-badge',
          `ats-badge--${tone}`,
          status === 'loading' ? 'ats-badge--stale' : '',
          status === 'error' ? 'ats-badge--stale' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        title={
          status === 'error'
            ? `${error} — score affiché : dernière valeur connue`
            : 'Score ATS de parsing — clique pour voir les règles déclenchées'
        }
      >
        ATS : {score}/100
        {(status === 'loading' || stale) && (
          <span className="ats-badge-sync" aria-hidden="true"> …</span>
        )}
      </button>
      {status === 'error' && (
        <button
          type="button"
          className="ats-badge-retry"
          onClick={() => refreshNow()}
          title="Réessayer le calcul ATS"
        >
          ↻
        </button>
      )}
      {panelOpen && (
        <div className="ats-badge-panel" role="dialog" aria-label="Détail du score ATS">
          <div className="ats-badge-panel-header">
            <strong>
              Score ATS Parsing : {score}/100
              {status === 'error' ? ' (dernière valeur)' : ''}
            </strong>
            <button
              type="button"
              className="ats-badge-panel-close"
              onClick={() => setPanelOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          {status === 'error' && (
            <p className="ats-badge-panel-error" role="status">
              {error}
              {' '}
              <button type="button" className="ats-badge-panel-retry-link" onClick={() => refreshNow()}>
                Réessayer
              </button>
            </p>
          )}
          {rules.length === 0 ? (
            <p className="ats-badge-panel-empty">Aucune règle déclenchée. Layout optimal.</p>
          ) : (
            <ul className="ats-badge-panel-list">
              {rules.map((rule) => (
                <li key={rule.id} className={`ats-badge-rule ats-badge-rule--${rule.severity}`}>
                  <span className={`ats-badge-rule-delta ${rule.delta >= 0 ? 'ats-badge-rule-delta--positive' : 'ats-badge-rule-delta--negative'}`}>
                    {rule.delta > 0 ? `+${rule.delta}` : rule.delta}
                  </span>
                  <span className="ats-badge-rule-label">{rule.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="ats-badge-panel-footer">
            Version : {data?.version || '?'}
          </div>
        </div>
      )}
    </span>
  );
}
