import { useEffect, useId, useState } from 'react';
import { EDITOR_ONBOARDING_STEPS } from '../../lib/editorOnboarding.js';
import '../../styles/EditorOnboardingTour.css';

/**
 * Tour d'accueil 3 étapes (AXE-32) — dismissable, une seule fois.
 */
export default function EditorOnboardingTour({ open = false, onDismiss }) {
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  if (!open) return null;

  const steps = EDITOR_ONBOARDING_STEPS;
  const step = steps[stepIndex] || steps[0];
  const isLast = stepIndex >= steps.length - 1;

  const finish = () => {
    onDismiss?.();
  };

  return (
    <section
      className="editor-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="editor-onboarding__backdrop" aria-hidden />
      <div className="editor-onboarding__card">
        <p className="editor-onboarding__eyebrow">
          Prise en main · {stepIndex + 1}/{steps.length}
        </p>
        <h2 id={titleId} className="editor-onboarding__title">{step.title}</h2>
        <p className="editor-onboarding__body">{step.body}</p>
        <ol className="editor-onboarding__dots" aria-hidden>
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={
                i === stepIndex
                  ? 'editor-onboarding__dot editor-onboarding__dot--active'
                  : 'editor-onboarding__dot'
              }
            />
          ))}
        </ol>
        <div className="editor-onboarding__actions">
          <button
            type="button"
            className="editor-onboarding__skip"
            onClick={finish}
          >
            Passer
          </button>
          {!isLast ? (
            <button
              type="button"
              className="editor-onboarding__next"
              onClick={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))}
            >
              Suivant
            </button>
          ) : (
            <button
              type="button"
              className="editor-onboarding__next"
              onClick={finish}
            >
              C’est compris
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
