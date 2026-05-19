import { useCallback, useState } from 'react';

import {
  getOrderedSectionEntries,
  isDefaultLayout,
  moveSectionInLayout,
  resetLayout,
} from '../../lib/cvLayoutModel.js';
import { computeReorderTargetIndex } from '../../lib/cvSectionOps.js';

/**
 * Onglet "Mise en page" du drawer inspecteur (P2.1).
 *
 * Permet de reordonner les SECTIONS du CV (resume, experiences,
 * formations, ...) via drag-and-drop natif HTML5 (handle `⋮⋮`) ou
 * boutons `↑` / `↓`.
 *
 * IMPORTANT (etat actuel de l implementation) :
 *  - Le panneau modifie l etat `layout` local de l editeur.
 *  - Le **rendu effectif** des sections selon `layout.sectionsOrder` viendra
 *    en P2.2 (cf. docs/editor-vision.md). Tant que ce n est pas fait, le
 *    canvas continue d afficher les sections dans l ordre du template, et
 *    l onglet sert a preparer le layout (qui sera ensuite consomme par
 *    le nouveau renderer + envoye au backend pour persistance).
 *  - Aucun appel reseau n est declenche par les changements de cet onglet.
 *
 * Reutilise la logique de drag-and-drop de EditorContentPanel (P1.5) :
 *  - meme conventions d evenements
 *  - meme helper `computeReorderTargetIndex` (lib/cvSectionOps.js)
 */
export default function EditorLayoutPanel({ layout, onLayoutChange }) {
  const [dragState, setDragState] = useState(null);

  const entries = getOrderedSectionEntries(layout);
  const isDefault = isDefaultLayout(layout);

  const update = useCallback((nextLayout) => {
    if (typeof onLayoutChange === 'function') onLayoutChange(nextLayout);
  }, [onLayoutChange]);

  const handleMoveUp = useCallback((index) => {
    update(moveSectionInLayout(layout, index, index - 1));
  }, [layout, update]);

  const handleMoveDown = useCallback((index) => {
    update(moveSectionInLayout(layout, index, index + 1));
  }, [layout, update]);

  const handleReset = useCallback(() => {
    update(resetLayout());
  }, [update]);

  const handleDragStart = useCallback((index, event) => {
    setDragState({ fromIndex: index, overIndex: index });
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', `section:${index}`); } catch (_) { /* ignore */ }
    }
  }, []);

  const handleDragOver = useCallback((index, event) => {
    if (!dragState) return;
    event.preventDefault();
    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDragState((prev) => (prev && prev.overIndex !== index
      ? { ...prev, overIndex: index }
      : prev));
  }, [dragState]);

  const handleDrop = useCallback((index, event) => {
    event.preventDefault();
    if (!dragState) return;
    const target = computeReorderTargetIndex(dragState.fromIndex, index, entries.length);
    if (target >= 0) {
      update(moveSectionInLayout(layout, dragState.fromIndex, target));
    }
    setDragState(null);
  }, [dragState, entries.length, layout, update]);

  const handleDragEnd = useCallback(() => setDragState(null), []);

  return (
    <div className="editor-layout-panel">
      <p className="editor-layout-help">
        Glissez-déposez ou utilisez les flèches pour réordonner les sections.
        Le nouveau rendu effectif arrive bientôt — l’ordre choisi sera
        appliqué au CV et au score ATS.
      </p>

      <ul className="editor-layout-list" role="list">
        {entries.map((entry, index) => {
          const isDragging = dragState?.fromIndex === index;
          const isOver = dragState?.overIndex === index && dragState?.fromIndex !== index;
          const className = [
            'editor-layout-item',
            isDragging ? 'editor-layout-item--dragging' : '',
            isOver ? 'editor-layout-item--over' : '',
          ].filter(Boolean).join(' ');
          return (
            <li
              key={entry.key}
              className={className}
              draggable
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={(e) => handleDrop(index, e)}
              onDragEnd={handleDragEnd}
            >
              <span className="editor-layout-item-handle" aria-hidden="true" title="Glisser pour réordonner">⋮⋮</span>
              <span className="editor-layout-item-index" aria-hidden="true">{index + 1}</span>
              <span className="editor-layout-item-label">{entry.label}</span>
              <span className="editor-layout-item-actions">
                <button
                  type="button"
                  className="editor-layout-item-btn"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  aria-label={`Monter ${entry.label}`}
                  title="Monter"
                >↑</button>
                <button
                  type="button"
                  className="editor-layout-item-btn"
                  onClick={() => handleMoveDown(index)}
                  disabled={index >= entries.length - 1}
                  aria-label={`Descendre ${entry.label}`}
                  title="Descendre"
                >↓</button>
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="editor-layout-reset"
        onClick={handleReset}
        disabled={isDefault}
        title={isDefault ? 'Déjà à l’ordre par défaut' : 'Réinitialiser l’ordre par défaut'}
      >
        Réinitialiser l’ordre par défaut
      </button>
    </div>
  );
}
