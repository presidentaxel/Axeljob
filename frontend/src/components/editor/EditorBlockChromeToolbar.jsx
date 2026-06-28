import {
  HiBars3BottomLeft,
  HiBars3,
  HiBars3BottomRight,
  HiBars4,
  HiListBullet,
  HiEllipsisHorizontal,
  HiDocumentDuplicate,
  HiLockClosed,
  HiLockOpen,
  HiTrash,
} from 'react-icons/hi2';
import '../../styles/EditorBlockChromeToolbar.css';

/**
 * Barre d’actions compacte au-dessus du bloc sélectionné.
 * Ordre : verrouiller, dupliquer, supprimer, menu (…).
 */
export default function EditorBlockChromeToolbar({
  block,
  anchorRect,
  locked = false,
  onDelete,
  onDuplicate,
  onToggleLock,
  onMoreMenu,
}) {
  if (!block || !anchorRect) return null;

  const topbarOffset = 60;
  const top = Math.max(topbarOffset, anchorRect.top - 36);
  const left = anchorRect.left + anchorRect.width / 2;

  return (
    <div
      className="editor-block-chrome-toolbar editor-block-chrome-toolbar--compact"
      role="toolbar"
      aria-label="Actions sur le bloc"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={locked ? 'editor-block-chrome-toolbar__btn editor-block-chrome-toolbar__btn--active' : 'editor-block-chrome-toolbar__btn'}
        title={locked ? 'Déverrouiller' : 'Verrouiller'}
        aria-label={locked ? 'Déverrouiller' : 'Verrouiller'}
        onClick={onToggleLock}
      >
        {locked ? <HiLockClosed size={16} aria-hidden /> : <HiLockOpen size={16} aria-hidden />}
      </button>
      <button
        type="button"
        className="editor-block-chrome-toolbar__btn"
        title="Dupliquer"
        aria-label="Dupliquer"
        onClick={onDuplicate}
      >
        <HiDocumentDuplicate size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="editor-block-chrome-toolbar__btn editor-block-chrome-toolbar__btn--danger"
        title="Supprimer"
        aria-label="Supprimer"
        onClick={onDelete}
      >
        <HiTrash size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="editor-block-chrome-toolbar__btn"
        title="Plus d’options"
        aria-label="Plus d’options"
        onClick={onMoreMenu}
      >
        <HiEllipsisHorizontal size={16} aria-hidden />
      </button>
    </div>
  );
}
