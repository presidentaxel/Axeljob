import {
  CV_IMPORT_SCALAR_KEYS,
  CV_IMPORT_SECTION_KEYS,
  formatScalarPreviewForPrivacy,
} from '../lib/cvImportUtils.js';
import '../styles/ProfileView.css';

export default function CvImportMergeModal({
  cv,
  parsed,
  choices,
  onChoicesChange,
  onConfirm,
  onCancel,
  confirming = false,
}) {
  if (!parsed) return null;

  return (
    <div
      className="linkedin-sync-overlay import-merge-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-merge-title"
    >
      <div className="linkedin-sync-modal import-merge-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="import-merge-title" className="import-merge-modal-title">Importer le CV - choisir les champs</h3>
        <p className="linkedin-sync-intro import-merge-intro">
          Champ vide : ajouter le texte importé ou l&apos;ignorer. Champ déjà rempli : remplacer ou conserver ta version actuelle.
        </p>
        <ul className="linkedin-sync-changes import-merge-list">
          {CV_IMPORT_SCALAR_KEYS.filter(
            ({ key }) => parsed[key] !== undefined && String(parsed[key] ?? '').trim() !== '',
          ).map(({ key, label }) => {
            const currentVal = (cv[key] ?? '').toString().trim();
            const isEmpty = currentVal === '';
            const choice = choices[key];
            return (
              <li key={key} className="linkedin-sync-change import-merge-row">
                <span className="change-label import-merge-field-label">{label}</span>
                <div className="change-values import-merge-field-body">
                  {isEmpty ? (
                    <>
                      <div className="import-merge-previews">
                        <div className="change-new import-merge-preview import-merge-preview--import">
                          <span className="import-merge-preview-tag">Import</span>
                          <span className="import-merge-preview-text">
                            {formatScalarPreviewForPrivacy(key, parsed[key], 80)}
                          </span>
                        </div>
                      </div>
                      <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                        <label className="import-merge-choice">
                          <input
                            type="radio"
                            name={`import-merge-${key}`}
                            checked={choice === 'add'}
                            onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'add' }))}
                          />
                          Ajouter
                        </label>
                        <label className="import-merge-choice">
                          <input
                            type="radio"
                            name={`import-merge-${key}`}
                            checked={choice === 'skip'}
                            onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'skip' }))}
                          />
                          Ne pas ajouter
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="import-merge-previews import-merge-previews--compare">
                        <div className="change-current import-merge-preview import-merge-preview--current">
                          <span className="import-merge-preview-tag">Actuel</span>
                          <span className="import-merge-preview-text">
                            {formatScalarPreviewForPrivacy(key, currentVal, 60)}
                          </span>
                        </div>
                        <div className="change-new import-merge-preview import-merge-preview--import">
                          <span className="import-merge-preview-tag">Import</span>
                          <span className="import-merge-preview-text">
                            {formatScalarPreviewForPrivacy(key, parsed[key], 60)}
                          </span>
                        </div>
                      </div>
                      <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                        <label className="import-merge-choice">
                          <input
                            type="radio"
                            name={`import-merge-${key}`}
                            checked={choice === 'replace'}
                            onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'replace' }))}
                          />
                          Remplacer
                        </label>
                        <label className="import-merge-choice">
                          <input
                            type="radio"
                            name={`import-merge-${key}`}
                            checked={choice === 'keep'}
                            onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'keep' }))}
                          />
                          Garder l&apos;actuel
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {CV_IMPORT_SECTION_KEYS.filter(({ key }) => {
            const imported = parsed[key];
            if (Array.isArray(imported)) return imported.length > 0;
            if (!imported || typeof imported !== 'object') return false;
            if (key === 'competences') {
              return Boolean(
                (imported.techniques || []).some(Boolean)
                || (imported.logiciels || []).some(Boolean)
                || (imported.langues || []).length
                || (imported.autres || []).some(Boolean),
              );
            }
            return Object.keys(imported).length > 0;
          }).map(({ key, label }) => {
            const choice = choices[key];
            return (
              <li key={key} className="linkedin-sync-change import-merge-row import-merge-row--section">
                <span className="change-label import-merge-field-label">{label}</span>
                <div className="change-values import-merge-field-body">
                  <p className="import-merge-section-note">
                    Section complète (plusieurs entrées). Tu choisis si tout le bloc importé remplace le tien.
                  </p>
                  <div className="import-merge-choice-group" role="group" aria-label={`Choix pour ${label}`}>
                    <label className="import-merge-choice">
                      <input
                        type="radio"
                        name={`import-merge-${key}`}
                        checked={choice === 'replace'}
                        onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'replace' }))}
                      />
                      Remplacer par l&apos;import
                    </label>
                    <label className="import-merge-choice">
                      <input
                        type="radio"
                        name={`import-merge-${key}`}
                        checked={choice === 'keep'}
                        onChange={() => onChoicesChange((p) => ({ ...p, [key]: 'keep' }))}
                      />
                      Garder l&apos;actuel
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="linkedin-sync-actions import-merge-actions">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Application…' : 'Appliquer et générer le canvas'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
