import { useCallback, useState } from 'react';

import {
  EDITABLE_SECTIONS,
  addItemToSection,
  computeReorderTargetIndex,
  getSectionItems,
  moveItemInSection,
  removeItemFromSection,
} from '../../lib/cvSectionOps.js';

/**
 * Panneau "Contenu" du drawer inspecteur (P1.5).
 *
 * Permet d ajouter, supprimer et reordonner les items repetes du CV
 * (experiences, formations, certifications, projets). Le reorder se
 * fait via :
 *   - boutons ↑ / ↓ (accessible clavier / souris)
 *   - drag-and-drop natif HTML5 sur le handle ⋮⋮ (sans dependance externe)
 *
 * Toutes les operations transitent par les helpers purs de
 * `lib/cvSectionOps.js` (testes unitairement). Le composant lui-meme
 * ne fait que orchestrer l etat de drag et notifier le parent via
 * `onCvChange`.
 */
export default function EditorContentPanel({ cv, onCvChange }) {
  const [dragState, setDragState] = useState(null);

  const updateCv = useCallback((nextCv) => {
    if (nextCv && nextCv !== cv && typeof onCvChange === 'function') {
      onCvChange(nextCv);
    }
  }, [cv, onCvChange]);

  const handleMoveUp = useCallback((sectionKey, index) => {
    updateCv(moveItemInSection(cv, sectionKey, index, index - 1));
  }, [cv, updateCv]);

  const handleMoveDown = useCallback((sectionKey, index) => {
    updateCv(moveItemInSection(cv, sectionKey, index, index + 1));
  }, [cv, updateCv]);

  const handleRemove = useCallback((sectionKey, index) => {
    updateCv(removeItemFromSection(cv, sectionKey, index));
  }, [cv, updateCv]);

  const handleAdd = useCallback((sectionKey) => {
    updateCv(addItemToSection(cv, sectionKey));
  }, [cv, updateCv]);

  const handleDragStart = useCallback((sectionKey, index, event) => {
    setDragState({ sectionKey, fromIndex: index, overIndex: index });
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Donnees factices pour permettre le drag (Firefox exige un set).
      try {
        event.dataTransfer.setData('text/plain', `${sectionKey}:${index}`);
      } catch (_) { /* ignore */ }
    }
  }, []);

  const handleDragOver = useCallback((sectionKey, index, event) => {
    if (!dragState || dragState.sectionKey !== sectionKey) return;
    event.preventDefault();
    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDragState((prev) => (prev && prev.overIndex !== index
      ? { ...prev, overIndex: index }
      : prev));
  }, [dragState]);

  const handleDrop = useCallback((sectionKey, index, event) => {
    event.preventDefault();
    if (!dragState || dragState.sectionKey !== sectionKey) return;
    const items = getSectionItems(cv, sectionKey);
    const target = computeReorderTargetIndex(dragState.fromIndex, index, items.length);
    if (target >= 0) {
      updateCv(moveItemInSection(cv, sectionKey, dragState.fromIndex, target));
    }
    setDragState(null);
  }, [cv, dragState, updateCv]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <div className="editor-content-panel">
      {EDITABLE_SECTIONS.map((section) => (
        <SectionList
          key={section.key}
          section={section}
          items={getSectionItems(cv, section.key)}
          dragState={dragState && dragState.sectionKey === section.key ? dragState : null}
          onMoveUp={(i) => handleMoveUp(section.key, i)}
          onMoveDown={(i) => handleMoveDown(section.key, i)}
          onRemove={(i) => handleRemove(section.key, i)}
          onAdd={() => handleAdd(section.key)}
          onDragStart={(i, event) => handleDragStart(section.key, i, event)}
          onDragOver={(i, event) => handleDragOver(section.key, i, event)}
          onDrop={(i, event) => handleDrop(section.key, i, event)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}

function SectionList({
  section,
  items,
  dragState,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAdd,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  return (
    <section className="editor-content-section" aria-labelledby={`content-section-${section.key}`}>
      <header className="editor-content-section-header">
        <h3
          id={`content-section-${section.key}`}
          className="editor-content-section-title"
        >
          {section.label}
          <span className="editor-content-section-count" aria-hidden="true">
            {' '}({items.length})
          </span>
        </h3>
      </header>

      {items.length === 0 ? (
        <p className="editor-content-section-empty">
          Aucune {section.singular} pour l’instant.
        </p>
      ) : (
        <ul className="editor-content-list" role="list">
          {items.map((item, index) => (
            <ContentItem
              key={item?.id || `${section.key}-${index}`}
              section={section}
              item={item}
              index={index}
              total={items.length}
              isDraggingThis={dragState?.fromIndex === index}
              isOverThis={dragState?.overIndex === index && dragState?.fromIndex !== index}
              onMoveUp={() => onMoveUp(index)}
              onMoveDown={() => onMoveDown(index)}
              onRemove={() => onRemove(index)}
              onDragStart={(e) => onDragStart(index, e)}
              onDragOver={(e) => onDragOver(index, e)}
              onDrop={(e) => onDrop(index, e)}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="editor-content-add-btn"
        onClick={onAdd}
      >
        <span aria-hidden="true">+</span>
        <span>Ajouter une {section.singular}</span>
      </button>
    </section>
  );
}

function ContentItem({
  section,
  item,
  index,
  total,
  isDraggingThis,
  isOverThis,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const label = section.displayLabel(item);
  const className = [
    'editor-content-item',
    isDraggingThis ? 'editor-content-item--dragging' : '',
    isOverThis ? 'editor-content-item--over' : '',
  ].filter(Boolean).join(' ');

  return (
    <li
      className={className}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span
        className="editor-content-item-handle"
        aria-hidden="true"
        title="Glisser pour réordonner"
      >
        ⋮⋮
      </span>
      <span className="editor-content-item-label" title={label}>{label}</span>
      <span className="editor-content-item-actions">
        <button
          type="button"
          className="editor-content-item-btn"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label={`Déplacer vers le haut (${section.label})`}
          title="Déplacer vers le haut"
        >
          ↑
        </button>
        <button
          type="button"
          className="editor-content-item-btn"
          onClick={onMoveDown}
          disabled={index >= total - 1}
          aria-label={`Déplacer vers le bas (${section.label})`}
          title="Déplacer vers le bas"
        >
          ↓
        </button>
        <button
          type="button"
          className="editor-content-item-btn editor-content-item-btn--danger"
          onClick={onRemove}
          aria-label={`Supprimer cette ${section.singular}`}
          title="Supprimer"
        >
          ×
        </button>
      </span>
    </li>
  );
}
