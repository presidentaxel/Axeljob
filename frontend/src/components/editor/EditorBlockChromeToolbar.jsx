import { HiLockClosed, HiLockOpen, HiTrash } from 'react-icons/hi2';
import '../../styles/EditorBlockChromeToolbar.css';

/**
 * Barre d actions au-dessus du bloc sélectionné (supprimer, verrouiller).
 */
export default function EditorBlockChromeToolbar({
  block,
  anchorRect,
  locked = false,
  onDelete,
  onToggleLock,
}) {
  if (!block || !anchorRect) return null;

  const top = anchorRect.top - 40;
  const left = anchorRect.left + anchorRect.width / 2;

  return (
    <div
      className="editor-block-chrome-toolbar"
      role="toolbar"
      aria-label="Actions sur le bloc"
      style={{
        top: `${Math.max(8, top)}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="editor-block-chrome-toolbar__btn editor-block-chrome-toolbar__btn--danger"
        title="Supprimer le bloc (Suppr)"
        onClick={onDelete}
      >
        <HiTrash size={16} aria-hidden />
        <span>Supprimer</span>
      </button>
      <button
        type="button"
        className={
          locked
            ? 'editor-block-chrome-toolbar__btn editor-block-chrome-toolbar__btn--active'
            : 'editor-block-chrome-toolbar__btn'
        }
        title={locked ? 'Déverrouiller la position' : 'Verrouiller la position'}
        onClick={onToggleLock}
      >
        {locked ? <HiLockClosed size={16} aria-hidden /> : <HiLockOpen size={16} aria-hidden />}
        <span>{locked ? 'Verrouillé' : 'Verrouiller'}</span>
      </button>
    </div>
  );
}
