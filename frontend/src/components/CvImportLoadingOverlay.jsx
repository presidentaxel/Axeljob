import { CV_IMPORT_STEPS } from '../lib/cvImportUtils.js';
import '../styles/ProfileView.css';

export default function CvImportLoadingOverlay({ stepIndex = 0, title = 'Analyse de ton CV en cours' }) {
  return (
    <div className="import-cv-loading-overlay" role="status" aria-live="polite">
      <div className="import-cv-loading-card">
        <div className="import-cv-loading-spinner" aria-hidden="true" />
        <p className="import-cv-loading-title">{title}</p>
        <ul className="import-cv-loading-steps" aria-live="polite">
          {CV_IMPORT_STEPS.map((label, i) => (
            <li
              key={label}
              className={`import-cv-loading-step ${
                i < stepIndex
                  ? 'import-cv-loading-step--done'
                  : i === stepIndex
                    ? 'import-cv-loading-step--current'
                    : ''
              }`}
            >
              <span className="import-cv-loading-step-icon">
                {i < stepIndex ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : i === stepIndex ? (
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
