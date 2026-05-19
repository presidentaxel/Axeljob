import { useEffect, useMemo, useState } from 'react';

import { fetchAtsScoreParsing, scoreToneFor } from '../../lib/atsScoreClient.js';

/**
 * Badge "Score ATS : 95/100" cliquable dans la topbar de l'editeur Beta.
 *
 * Appelle `POST /api/ats/score-parsing` au montage et a chaque changement
 * de `templateId` / `layout`. Affiche un panneau detail au clic, avec la
 * liste des regles declenchees (positives/negatives) telles que retournees
 * par le backend.
 *
 * Le composant est isole pour rester reutilisable (page d'inscription,
 * selecteur de templates, etc.). Toute la logique reseau est dans
 * `lib/atsScoreClient.js` (module pur, testable).
 *
 * Props :
 *  - `templateId` : id du template a scorer (mode P0). Optionnel si `layout`.
 *  - `layout` : layout custom a scorer (mode L2/L3 a venir). Optionnel si templateId.
 *  - `cv` : optionnel, pour scorer egalement les regles de contenu.
 *  - `onScoreChange(score)` : callback invoque a chaque score recu.
 */
export default function EditorAtsScoreBadge({ templateId, layout, cv, onScoreChange }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [panelOpen, setPanelOpen] = useState(false);

  // Identite stable pour le useEffect : on serialise une cle minimaliste.
  const requestKey = useMemo(() => JSON.stringify({
    t: templateId || null,
    l: layout || null,
    c: cv ? '1' : '0',
  }), [templateId, layout, cv]);

  useEffect(() => {
    if (!templateId && !layout) {
      setState({ status: 'idle', data: null, error: null });
      return undefined;
    }
    let aborted = false;
    setState((prev) => ({ ...prev, status: 'loading' }));
    fetchAtsScoreParsing({ templateId, layout, cv })
      .then((data) => {
        if (aborted) return;
        setState({ status: 'ok', data, error: null });
        if (typeof onScoreChange === 'function') onScoreChange(data.score);
      })
      .catch((err) => {
        if (aborted) return;
        setState({ status: 'error', data: null, error: err?.message || 'Erreur ATS' });
      });
    return () => { aborted = true; };
    // requestKey suffit : il change quand un input scorable change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  if (state.status === 'idle') {
    return null;
  }
  if (state.status === 'loading') {
    return (
      <span className="ats-badge ats-badge--loading" aria-live="polite">
        ATS : …
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span className="ats-badge ats-badge--error" title={state.error || 'Erreur ATS'}>
        ATS : indispo
      </span>
    );
  }

  const score = state.data?.score ?? 0;
  const tone = scoreToneFor(score);
  const rules = Array.isArray(state.data?.rules) ? state.data.rules : [];

  return (
    <span className="ats-badge-wrap">
      <button
        type="button"
        className={`ats-badge ats-badge--${tone}`}
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        title="Score ATS de parsing — clique pour voir les règles déclenchées"
      >
        ATS : {score}/100
      </button>
      {panelOpen && (
        <div className="ats-badge-panel" role="dialog" aria-label="Détail du score ATS">
          <div className="ats-badge-panel-header">
            <strong>Score ATS Parsing : {score}/100</strong>
            <button
              type="button"
              className="ats-badge-panel-close"
              onClick={() => setPanelOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
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
            Version : {state.data?.version || '?'}
          </div>
        </div>
      )}
    </span>
  );
}
