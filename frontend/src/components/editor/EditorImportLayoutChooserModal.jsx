import { useEffect, useState } from 'react';

import { scoreToneFor } from '../../lib/atsScoreClient.js';
import {
  defaultImportVariantId,
  isBestAtsVariant,
  resolveImportVariant,
  variantHasAtsScore,
} from '../../lib/importLayoutChooser.js';
import ImportLayoutMiniPreview from './ImportLayoutMiniPreview.jsx';
import '../../styles/EditorImportLayoutChooserModal.css';

function formatDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return 'Meilleur score';
  return delta > 0 ? `+${delta} vs meilleur` : `${delta} vs meilleur`;
}

export default function EditorImportLayoutChooserModal({
  open,
  variants = [],
  bestTotal = null,
  initialSelectedId = '',
  policyNotice = '',
  onConfirm,
  onCancel,
  confirming = false,
}) {
  const [selectedId, setSelectedId] = useState(
    () => initialSelectedId || defaultImportVariantId(variants),
  );

  useEffect(() => {
    if (!open) return;
    setSelectedId(initialSelectedId || defaultImportVariantId(variants));
  }, [open, initialSelectedId, variants]);

  if (!open) return null;

  const selected = resolveImportVariant(variants, selectedId);

  const handleConfirm = () => {
    if (!selected || confirming) return;
    onConfirm?.(selected);
  };

  return (
    <div
      className="editor-import-chooser-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-import-chooser-title"
      onClick={() => {
        if (!confirming) onCancel?.();
      }}
    >
      <div
        className="editor-import-chooser-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="editor-import-chooser-head">
          <div>
            <span className="editor-import-chooser-eyebrow">Après import</span>
            <h2 id="editor-import-chooser-title">Choisis une mise en page</h2>
            <p>
              Trois propositions éditables. Compare le rendu et le score, puis continue.
            </p>
            {policyNotice ? (
              <p className="editor-import-chooser-policy" role="note">{policyNotice}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="editor-import-chooser-close"
            onClick={() => onCancel?.()}
            aria-label="Fermer"
            disabled={confirming}
          >
            ×
          </button>
        </header>

        <div className="editor-import-chooser-grid" role="listbox" aria-label="Variantes d'import">
          {variants.map((variant) => {
            const score = variant?.score_json?.total;
            const hasScore = variantHasAtsScore(variant);
            const tone = scoreToneFor(score);
            const isSelected = variant.id === selectedId;
            const isBest = isBestAtsVariant(variant);
            return (
              <button
                key={variant.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`editor-import-chooser-card${isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(variant.id)}
                disabled={confirming}
              >
                <ImportLayoutMiniPreview layout={variant.layout} />
                <div className="editor-import-chooser-card__meta">
                  <strong>{variant.label || variant.id}</strong>
                  <span className={`editor-import-chooser-score tone-${tone}`}>
                    {hasScore ? score : '—'}
                    {Number.isFinite(bestTotal) && hasScore ? (
                      <small>{formatDelta(variant.delta_vs_best)}</small>
                    ) : null}
                  </span>
                  <span className="editor-import-chooser-card__sub">
                    {variant.blockCount || 0} blocs
                    {isBest ? ' · meilleur ATS' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="editor-import-chooser-actions">
          <button type="button" onClick={() => onCancel?.()} disabled={confirming}>
            Utiliser Design proche
          </button>
          <button
            type="button"
            className="editor-import-chooser-primary"
            onClick={handleConfirm}
            disabled={!selected || confirming}
          >
            {confirming
              ? 'Application…'
              : `Continuer avec ${selected?.label || 'cette variante'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
