import { CV_IMPORT_STEPS } from '../lib/cvImportUtils.js';
import '../styles/ProfileView.css';

export default function CvImportLoadingOverlay({
  stepIndex = 0,
  title = 'Analyse de ton CV en cours',
  subtitle = '',
  steps = CV_IMPORT_STEPS,
}) {
  const labels = Array.isArray(steps) && steps.length ? steps : CV_IMPORT_STEPS;
  const total = labels.length;
  const safeIndex = Math.min(Math.max(0, stepIndex), Math.max(0, total - 1));
  const pct = total > 0 ? Math.min(100, Math.round(((safeIndex + 1) / total) * 100)) : 0;

  return (
    <div className="import-cv-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="import-cv-loading-card">
        <div className="import-cv-loading-spinner" aria-hidden="true" />
        <p className="import-cv-loading-title">{title}</p>
        {subtitle ? (
          <p className="import-cv-loading-desc import-cv-loading-subtitle">{subtitle}</p>
        ) : null}
        <div
          className="import-cv-loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Progression de l’analyse"
        >
          <div className="import-cv-loading-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="import-cv-loading-pct ds-label-sm">{pct} %</p>
        <ul className="import-cv-loading-steps" aria-live="polite">
          {labels.map((label, i) => (
            <li
              key={label}
              className={`import-cv-loading-step ${
                i < safeIndex
                  ? 'import-cv-loading-step--done'
                  : i === safeIndex
                    ? 'import-cv-loading-step--current'
                    : ''
              }`}
            >
              <span className="import-cv-loading-step-icon">
                {i < safeIndex ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : i === safeIndex ? (
                  <span className="import-cv-loading-step-spinner" aria-hidden="true" />
                ) : (
                  <span className="import-cv-loading-step-dot" aria-hidden="true" />
                )}
              </span>
              <span className="import-cv-loading-step-label">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
