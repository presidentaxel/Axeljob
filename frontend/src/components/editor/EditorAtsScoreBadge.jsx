import { useEffect, useRef, useState } from 'react';

import { scoreToneFor, fetchAtsScoreParsing } from '../../lib/atsScoreClient.js';
import { useAtsScoreFetching } from '../../lib/useAtsScoreFetching.js';
import {
  filterRulesForCoachMode,
  getAtsCoachAdvice,
  isAtsCoachRuleFixable,
  summarizeAtsCoachStatus,
} from '../../lib/atsCoachAdvice.js';
import { applyAtsCoachFix, didAtsCoachFixChangeLayout, formatAtsScoreImpact } from '../../lib/atsCoachFixes.js';

const IGNORED_STORAGE_KEY = 'axeljob.atsCoach.ignoredRules';

function readIgnoredRuleIds() {
  try {
    const raw = sessionStorage.getItem(IGNORED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function persistIgnoredRuleIds(ids) {
  try {
    sessionStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

function scrollBlockIntoView(blockId) {
  if (!blockId || typeof document === 'undefined') return;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(blockId)
    : String(blockId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = document.querySelector(`[data-block-id="${escaped}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

/**
 * Badge ATS + panneau coach (AXE-36) : conseils, highlight, corriger / ignorer, impact.
 *
 * @param {boolean} [paused] - true pendant drag/resize canvas (pas de rafale API).
 * @param {(blockId: string|null, options?: object) => void} [onSelectBlock]
 * @param {(layout: object, meta?: object) => void} [onApplyLayout]
 */
export default function EditorAtsScoreBadge({
  templateId,
  layout,
  cv,
  paused = false,
  onScoreChange,
  onSelectBlock,
  onApplyLayout,
}) {
  const wrapRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [coachMode, setCoachMode] = useState('ats-safe');
  const [ignoredIds, setIgnoredIds] = useState(() => readIgnoredRuleIds());
  const [previewByRule, setPreviewByRule] = useState({});
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const { status, data, error, stale, refreshNow } = useAtsScoreFetching({
    templateId,
    layout,
    cv,
    paused,
    onScoreChange,
  });

  useEffect(() => {
    if (!panelOpen) return undefined;
    const handlePointerDown = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      setPanelOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [panelOpen]);

  useEffect(() => {
    setPreviewByRule({});
    setActionError('');
  }, [layout, data?.score, data?.version]);

  const ignoreRule = (ruleId) => {
    setIgnoredIds((prev) => {
      const next = new Set(prev);
      next.add(ruleId);
      persistIgnoredRuleIds(next);
      return next;
    });
  };

  const clearIgnored = () => {
    setIgnoredIds(new Set());
    persistIgnoredRuleIds(new Set());
  };

  const rules = Array.isArray(data?.rules) ? data.rules : [];
  const visibleRules = filterRulesForCoachMode(rules, coachMode)
    .filter((rule) => !ignoredIds.has(rule.id))
    .slice()
    .sort((a, b) => (Number(a.delta) || 0) - (Number(b.delta) || 0));

  const handleSeeOnCanvas = (rule) => {
    const ids = Array.isArray(rule.blockIds) ? rule.blockIds : [];
    if (!ids.length || !onSelectBlock) return;
    if (ids.length === 1) {
      onSelectBlock(ids[0]);
    } else {
      onSelectBlock(null, { replaceIds: ids });
    }
    scrollBlockIntoView(ids[0]);
  };

  const ensureImpactPreview = async (rule) => {
    if (!layout || !isAtsCoachRuleFixable(rule.id)) return null;
    if (previewByRule[rule.id]) return previewByRule[rule.id];
    const nextLayout = applyAtsCoachFix(layout, rule.id, { cv });
    if (!didAtsCoachFixChangeLayout(layout, nextLayout)) {
      setActionError('Cette correction ne modifie pas le layout actuel.');
      return null;
    }
    setPreviewLoadingId(rule.id);
    setActionError('');
    try {
      const scored = await fetchAtsScoreParsing({ layout: nextLayout, cv, templateId });
      const impact = {
        before: data?.score ?? null,
        after: scored.score,
        nextLayout,
      };
      setPreviewByRule((prev) => ({ ...prev, [rule.id]: impact }));
      return impact;
    } catch (err) {
      setActionError(err?.message || 'Impossible de prévisualiser l’impact ATS');
      return null;
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleFix = async (rule) => {
    if (!onApplyLayout || !layout) return;
    const impact = await ensureImpactPreview(rule);
    if (!impact?.nextLayout) return;
    onApplyLayout(impact.nextLayout, { groupKey: `ats:coach:${rule.id}` });
  };

  if (status === 'idle') {
    return null;
  }

  const showScore = data && (status === 'ok' || status === 'loading' || (status === 'error' && stale));
  const score = showScore ? (data.score ?? 0) : null;
  const tone = score !== null ? scoreToneFor(score) : 'unknown';
  const statusLine = showScore
    ? summarizeAtsCoachStatus(score, rules.filter((r) => !ignoredIds.has(r.id)))
    : '';

  if (status === 'loading' && !showScore) {
    return (
      <span className="ats-badge ats-badge--loading" aria-live="polite">
        ATS : …
      </span>
    );
  }

  if (status === 'error' && !showScore) {
    return (
      <span className="ats-badge-wrap" ref={wrapRef}>
        <button
          type="button"
          className="ats-badge ats-badge--error"
          title={error || 'Erreur ATS - cliquer pour réessayer'}
          onClick={() => refreshNow()}
        >
          ATS : indispo
        </button>
      </span>
    );
  }

  return (
    <span className="ats-badge-wrap" ref={wrapRef}>
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
        title={statusLine || 'Coach ATS — conseils actionnables'}
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
        <div className="ats-badge-panel ats-coach-panel" role="dialog" aria-label="Coach ATS">
          <div className="ats-badge-panel-header">
            <div className="ats-coach-panel-heading">
              <strong>Coach ATS · {score}/100</strong>
              <p className="ats-coach-status">{statusLine}</p>
            </div>
            <button
              type="button"
              className="ats-badge-panel-close"
              onClick={() => setPanelOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="ats-coach-mode" role="group" aria-label="Mode coach">
            <button
              type="button"
              className={coachMode === 'ats-safe' ? 'ats-coach-mode-btn is-active' : 'ats-coach-mode-btn'}
              onClick={() => setCoachMode('ats-safe')}
            >
              Version ATS-safe
            </button>
            <button
              type="button"
              className={coachMode === 'design' ? 'ats-coach-mode-btn is-active' : 'ats-coach-mode-btn'}
              onClick={() => setCoachMode('design')}
            >
              Version design
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
          {actionError && (
            <p className="ats-badge-panel-error" role="status">{actionError}</p>
          )}

          {visibleRules.length === 0 ? (
            <p className="ats-badge-panel-empty">
              {ignoredIds.size > 0
                ? 'Tous les conseils visibles sont ignorés.'
                : coachMode === 'design'
                  ? 'Aucun risque ATS affiché en mode design.'
                  : 'Aucune règle déclenchée. Layout optimal.'}
            </p>
          ) : (
            <ul className="ats-badge-panel-list ats-coach-list">
              {visibleRules.map((rule) => {
                const advice = getAtsCoachAdvice(rule);
                const canSee = Array.isArray(rule.blockIds) && rule.blockIds.length > 0 && onSelectBlock;
                const canFix = isAtsCoachRuleFixable(rule.id) && onApplyLayout;
                const preview = previewByRule[rule.id];
                const soft = coachMode === 'design' && advice.designTradeoff;
                return (
                  <li
                    key={rule.id}
                    className={[
                      'ats-badge-rule',
                      'ats-coach-rule',
                      `ats-badge-rule--${rule.severity}`,
                      soft ? 'ats-coach-rule--tradeoff' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="ats-coach-rule-main">
                      <span className={`ats-badge-rule-delta ${rule.delta >= 0 ? 'ats-badge-rule-delta--positive' : 'ats-badge-rule-delta--negative'}`}>
                        {rule.delta > 0 ? `+${rule.delta}` : rule.delta}
                      </span>
                      <div className="ats-coach-rule-copy">
                        <span className="ats-coach-rule-title">{advice.title}</span>
                        <span className="ats-coach-rule-expl">{advice.explanation}</span>
                        {soft && (
                          <span className="ats-coach-rule-note">Choix design acceptable — impact ATS limité.</span>
                        )}
                        {!canFix && advice.notApplicableReason && (
                          <span className="ats-coach-rule-note">{advice.notApplicableReason}</span>
                        )}
                        {preview && (
                          <span className="ats-coach-impact" role="status">
                            {formatAtsScoreImpact(preview.before, preview.after)}
                          </span>
                        )}
                        {previewLoadingId === rule.id && !preview && (
                          <span className="ats-coach-impact" role="status">Calcul de l’impact…</span>
                        )}
                      </div>
                    </div>
                    <div className="ats-coach-actions">
                      {canSee && (
                        <button
                          type="button"
                          className="ats-coach-action"
                          onClick={() => handleSeeOnCanvas(rule)}
                        >
                          Voir sur le canvas
                        </button>
                      )}
                      {canFix && (
                        <button
                          type="button"
                          className="ats-coach-action ats-coach-action--primary"
                          disabled={previewLoadingId === rule.id}
                          onClick={async () => {
                            if (!preview) {
                              await ensureImpactPreview(rule);
                              return;
                            }
                            await handleFix(rule);
                          }}
                        >
                          {preview ? 'Corriger' : 'Voir l’impact'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ats-coach-action"
                        onClick={() => ignoreRule(rule.id)}
                      >
                        Ignorer
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="ats-badge-panel-footer ats-coach-footer">
            <span>Version : {data?.version || '?'}</span>
            {ignoredIds.size > 0 && (
              <button type="button" className="ats-coach-reset-ignored" onClick={clearIgnored}>
                Réafficher {ignoredIds.size} ignoré(s)
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
