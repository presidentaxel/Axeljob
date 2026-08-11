import { useId, useMemo } from 'react';

import {
  findTemplateById,
  isAtsSafe,
  sortTemplatesForEditor,
  templateOptionLabel,
} from '../../lib/editorTemplateUtils.js';

/**
 * Selecteur compact de template dans la topbar de l editeur Beta.
 *
 * Volontairement minimal :
 *  - `<select>` natif (accessible, mobile-friendly, gere les claviers).
 *  - tri stable (ATS-safe non-premium en haut, voir `editorTemplateUtils`).
 *  - badge discret "ATS-safe" si le template actif est juge sur (heuristique
 *    sur les tags `ats-safe` / `single-column`).
 *
 * Props :
 *  - `templates` : liste de templates (App.jsx -> ProfileViewSwitcher).
 *  - `templateId` : id courant.
 *  - `onTemplateIdChange(nextId)` : invoque a chaque changement.
 *
 * L iterateur des options retourne null gracieusement si la liste est vide
 * (etat transitoire au chargement, l API /api/templates renvoie une liste
 * non vide en pratique).
 */
export default function EditorTemplateSelector({ templates, templateId, onTemplateIdChange }) {
  const sortedTemplates = useMemo(() => sortTemplatesForEditor(templates), [templates]);
  const selectId = useId();

  if (sortedTemplates.length === 0) {
    return null;
  }

  const active = findTemplateById(sortedTemplates, templateId);
  const showAtsBadge = active ? isAtsSafe(active) : false;

  const handleChange = (event) => {
    const nextId = event.target.value;
    if (nextId && nextId !== templateId && typeof onTemplateIdChange === 'function') {
      onTemplateIdChange(nextId);
    }
  };

  return (
    <span className="editor-template-selector">
      <label htmlFor={selectId} className="editor-template-selector-label">
        Template
      </label>
      <select
        id={selectId}
        className="editor-template-selector-select"
        value={templateId || ''}
        onChange={handleChange}
        aria-label="Choisir un template de CV"
      >
        {sortedTemplates.map((template) => (
          <option key={template.id} value={template.id}>
            {templateOptionLabel(template)}
          </option>
        ))}
      </select>
      {showAtsBadge && (
        <span className="editor-template-selector-ats" title="Template ATS-safe (recommandé pour le parsing)">
          ATS-safe
        </span>
      )}
    </span>
  );
}
