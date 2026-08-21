import CompanyLogo from './CompanyLogo';
import Button from './ui/Button.jsx';
import { KANBAN_COLUMNS, STATUT_LABELS } from '../constants';
import { formatApplicationDateLabel, formatApplicationRelativeLabel } from '../lib/applicationDates';
import { getApplicationCardAccent, isApplicationToFollowUp } from '../lib/applicationStats.js';

/**
 * Carte candidature — kanban (drag) ou liste mobile (select statut).
 * @param {'kanban' | 'list'} [props.variant]
 */
export default function CandidatureBoardCard({
  app,
  variant = 'kanban',
  isDragging = false,
  justAdded = false,
  onDragStart,
  onDragEnd,
  onView,
  onArchive,
  onStatutChange,
}) {
  const titre = app.poste || app.poste_offre || 'Sans intitulé';
  const entreprise = (app.entreprise || '').trim();
  const statutKey = app.statut in STATUT_LABELS ? app.statut : 'candidature_envoyee';
  const needsFollowUp = isApplicationToFollowUp(app);
  const accent = getApplicationCardAccent(app);
  const hasDocs = Boolean(
    app.pdf_lettre_url || app.pdf_cv_url || app.pdf_fiche_url
    || app.pdf_cv_stored || app.pdf_fiche_stored || app.pdf_lettre_stored,
  );
  const dateAbs = formatApplicationDateLabel(app.date);
  const dateRel = formatApplicationRelativeLabel(app.date);
  const isList = variant === 'list';

  return (
    <div
      className={[
        'application-card',
        isList ? 'candidatures-list-card' : 'kanban-card',
        app.archived ? 'archived' : '',
        isDragging ? 'dragging' : '',
        justAdded ? 'just-added' : '',
        accent ? `application-card--accent-${accent}` : '',
      ].filter(Boolean).join(' ')}
      draggable={!isList && !app.archived}
      onDragStart={!isList ? onDragStart : undefined}
      onDragEnd={!isList ? onDragEnd : undefined}
    >
      <div className="app-card-actions-icons">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          className="app-card-action"
          onClick={onView}
          title="Voir"
          aria-label="Voir"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          className="app-card-action app-card-action--archive"
          onClick={onArchive}
          title="Archiver"
          aria-label="Archiver"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </Button>
      </div>
      <div className="app-card-top">
        <CompanyLogo companyName={entreprise || app.entreprise} className="app-company-logo" size={32} />
        <div className="app-card-text">
          <div className="app-title-row">
            <div className="app-title">{titre}</div>
            {needsFollowUp && (
              <span
                className="app-follow-up-dot"
                title="Sans nouvelle depuis 14 jours ou plus"
                aria-label="À relancer"
              />
            )}
          </div>
          {entreprise ? <div className="app-meta">{entreprise}</div> : null}
        </div>
      </div>
      <div className="app-card-footer">
        {hasDocs ? (
          <div className="app-docs-badge" title="Documents PDF joints">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
            <span>PDF</span>
          </div>
        ) : (
          <span className="app-card-footer-spacer" aria-hidden />
        )}
        <time
          className="app-date"
          dateTime={(app.date || '').trim().slice(0, 10) || undefined}
          title={dateAbs || undefined}
        >
          {dateRel}
        </time>
      </div>
      {isList ? (
        <label className="candidatures-list-statut">
          <span className="candidatures-list-statut-label">Statut</span>
          <select
            className="ds-input candidatures-list-statut-select"
            value={statutKey}
            aria-label={`Statut — ${titre}`}
            data-attr="candidatures-list-input-statut"
            data-track="input"
            data-zone="list"
            data-level="tertiary"
            onChange={(e) => onStatutChange?.(e.target.value)}
          >
            {KANBAN_COLUMNS.map((col) => (
              <option key={col.id} value={col.id}>{col.label}</option>
            ))}
          </select>
        </label>
      ) : (
        <span className="app-card-statut-sr">{STATUT_LABELS[statutKey]}</span>
      )}
    </div>
  );
}
