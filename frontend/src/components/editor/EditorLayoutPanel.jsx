import { useCallback, useMemo, useState } from 'react';

import {
  getOrderedSectionEntries,
  isDefaultLayout,
  moveSectionInLayout,
  resetLayout,
} from '../../lib/cvLayoutModel.js';
import { computeReorderTargetIndex } from '../../lib/cvSectionOps.js';
import { groupIdLabel } from '../../lib/sectionsAvailability.js';

/**
 * Onglet "Mise en page" du drawer inspecteur.
 *
 * Permet de reordonner les sections du CV avec deux niveaux d UX :
 *
 *  1. Sections **rendues** dans le DOM (decouvertes via
 *     `sectionsAvailability` qui lit `data-cv-section` apres render) :
 *       - draggable + boutons ↑ / ↓ actifs
 *       - badge "Principal" / "Sidebar" pour signaler la zone
 *  2. Sections **verrouillees** (presentes dans le layout mais pas
 *     rendues -- typique : `resume` qui est dans le header du template
 *     sidebar) :
 *       - grisees, draggable=false, boutons disabled
 *       - cadenas visuel pour expliciter l etat
 *
 * Limitation acceptee : le reorder DOM (`applyLayoutToDom`) regroupe
 * par parent. Bouger une section de "Principal" vers "Sidebar" via le
 * drawer modifie l ordre dans `layout.sectionsOrder` mais n a aucun
 * effet visuel sur le canvas (chaque parent garde ses propres sections).
 * Le badge de zone permet au user de comprendre pourquoi. Le cross-
 * column proprement dit viendra en P2.4 avec le sidebar ratio + un vrai
 * renderer layout-aware.
 */
export default function EditorLayoutPanel({ layout, onLayoutChange, sectionsAvailability }) {
  const [dragState, setDragState] = useState(null);

  const entries = getOrderedSectionEntries(layout);
  const isDefault = isDefaultLayout(layout);

  /**
   * Mapping section.key -> info de mobilite, derive de `sectionsAvailability`.
   * Si pas encore disponible (premier render), on considere tout comme
   * verrouille pour ne pas autoriser un drag avant que la verite-terrain
   * du DOM ne soit connue.
   */
  const sectionMeta = useMemo(() => {
    const map = new Map();
    if (!sectionsAvailability) {
      for (const entry of entries) {
        map.set(entry.key, { available: false, groupId: null, groupLabel: null });
      }
      return map;
    }
    for (const entry of entries) {
      const groupId = sectionsAvailability.keyToGroup[entry.key] || null;
      map.set(entry.key, {
        available: !!groupId,
        groupId,
        groupLabel: groupIdLabel(groupId),
      });
    }
    return map;
  }, [entries, sectionsAvailability]);

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

  const handleDragStart = useCallback((index, key, event) => {
    const meta = sectionMeta.get(key);
    if (!meta || !meta.available) {
      event.preventDefault();
      return;
    }
    setDragState({ fromIndex: index, overIndex: index });
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', `section:${index}`); } catch (_) { /* ignore */ }
    }
  }, [sectionMeta]);

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

  /**
   * `↑` n est utile que si la section au-dessus est dans le meme groupe
   * (ou s il n y a pas de section au-dessus, il est desactive). Meme
   * logique pour `↓`. Cela rend les boutons coherents avec ce que le
   * canvas peut effectivement reorganiser.
   *
   * Note : on n empeche PAS la modification de `layout.sectionsOrder` au
   * niveau du modele -- une section principale "deplacee" au-dessus d une
   * sidebar reste enregistree dans l ordre, juste sans effet visuel
   * immediat. Si l user change ensuite de template (un qui rend les deux
   * dans la meme colonne), l ordre choisi sera respecte.
   */
  const isMoveUseful = useCallback((index, direction) => {
    if (direction !== 'up' && direction !== 'down') return false;
    const cur = entries[index];
    const neighbor = direction === 'up' ? entries[index - 1] : entries[index + 1];
    if (!cur || !neighbor) return false;
    const a = sectionMeta.get(cur.key);
    const b = sectionMeta.get(neighbor.key);
    if (!a || !a.available) return false;
    if (!b || !b.available) return false;
    return a.groupId === b.groupId;
  }, [entries, sectionMeta]);

  return (
    <div className="editor-layout-panel">
      <p className="editor-layout-help">
        Glissez-déposez ou utilisez les flèches pour réordonner les sections.
        L’aperçu et le score ATS reflètent votre choix en temps réel.
        Les sections verrouillées (cadenas) sont rendues dans le header
        du template et ne sont pas déplaçables.
      </p>

      <ul className="editor-layout-list" role="list">
        {entries.map((entry, index) => {
          const meta = sectionMeta.get(entry.key);
          const isDragging = dragState?.fromIndex === index;
          const isOver = dragState?.overIndex === index && dragState?.fromIndex !== index;
          const locked = !meta || !meta.available;
          const className = [
            'editor-layout-item',
            isDragging ? 'editor-layout-item--dragging' : '',
            isOver ? 'editor-layout-item--over' : '',
            locked ? 'editor-layout-item--locked' : '',
          ].filter(Boolean).join(' ');
          return (
            <li
              key={entry.key}
              className={className}
              draggable={!locked}
              onDragStart={(e) => handleDragStart(index, entry.key, e)}
              onDragOver={(e) => locked ? null : handleDragOver(index, e)}
              onDrop={(e) => locked ? null : handleDrop(index, e)}
              onDragEnd={handleDragEnd}
              aria-disabled={locked || undefined}
              title={locked ? 'Cette section est rendue dans le header du template (non déplaçable)' : undefined}
            >
              <span className="editor-layout-item-handle" aria-hidden="true" title={locked ? 'Verrouillée' : 'Glisser pour réordonner'}>
                {locked ? '🔒' : '⋮⋮'}
              </span>
              <span className="editor-layout-item-index" aria-hidden="true">{index + 1}</span>
              <span className="editor-layout-item-label">{entry.label}</span>
              {meta && meta.groupLabel && (
                <span
                  className={`editor-layout-item-zone editor-layout-item-zone--${meta.groupId}`}
                  aria-label={`Zone : ${meta.groupLabel}`}
                  title={`Rendue dans la zone « ${meta.groupLabel} »`}
                >
                  {meta.groupLabel}
                </span>
              )}
              <span className="editor-layout-item-actions">
                <button
                  type="button"
                  className="editor-layout-item-btn"
                  onClick={() => handleMoveUp(index)}
                  disabled={locked || !isMoveUseful(index, 'up')}
                  aria-label={`Monter ${entry.label}`}
                  title={locked ? 'Verrouillée' : 'Monter'}
                >↑</button>
                <button
                  type="button"
                  className="editor-layout-item-btn"
                  onClick={() => handleMoveDown(index)}
                  disabled={locked || !isMoveUseful(index, 'down')}
                  aria-label={`Descendre ${entry.label}`}
                  title={locked ? 'Verrouillée' : 'Descendre'}
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
