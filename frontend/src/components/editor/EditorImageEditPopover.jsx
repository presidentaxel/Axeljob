import { useEffect, useRef } from 'react';
import '../../styles/EditorImageEditPopover.css';

const FOCAL_GRID = [];
for (const y of [0, 50, 100]) {
  for (const x of [0, 50, 100]) {
    FOCAL_GRID.push({ x, y });
  }
}

/**
 * Pop-up édition image (double-clic) : cadrage, zoom, forme, position bloc.
 */
export default function EditorImageEditPopover({
  block,
  anchorRect,
  onBlockPatch,
  onBlockStylePatch,
  onClose,
}) {
  const ref = useRef(null);
  const style = block?.style || {};

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!block || block.type !== 'image' || !anchorRect) return null;

  const top = Math.min(window.innerHeight - 320, anchorRect.top + anchorRect.height + 12);
  const left = Math.min(window.innerWidth - 280, Math.max(8, anchorRect.left));

  const patchStyle = (patch) => onBlockStylePatch?.(patch);

  return (
    <div
      ref={ref}
      className="editor-image-edit-popover"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="dialog"
      aria-label="Éditer l’image"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="editor-image-edit-popover__head">
        <strong>Image</strong>
        <button type="button" className="editor-image-edit-popover__close" onClick={onClose}>×</button>
      </header>

      <label className="editor-image-edit-popover__field">
        Forme
        <select
          value={style.shape || 'rect'}
          onChange={(e) => patchStyle({ shape: e.target.value })}
        >
          <option value="rect">Rectangle</option>
          <option value="rounded">Arrondi</option>
          <option value="circle">Cercle</option>
        </select>
      </label>

      <label className="editor-image-edit-popover__field">
        Zoom ({Math.round((style.image_zoom ?? 1) * 100)}%)
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={style.image_zoom ?? 1}
          onChange={(e) => patchStyle({ image_zoom: parseFloat(e.target.value) })}
        />
      </label>

      <p className="editor-image-edit-popover__label">Centrage</p>
      <div className="editor-image-edit-popover__focal-grid">
        {FOCAL_GRID.map((p) => (
          <button
            key={`${p.x}-${p.y}`}
            type="button"
            className={
              (style.focal_x ?? 50) === p.x && (style.focal_y ?? 50) === p.y
                ? 'is-active'
                : ''
            }
            onClick={() => patchStyle({ focal_x: p.x, focal_y: p.y })}
          />
        ))}
      </div>

      <label className="editor-image-edit-popover__field">
        Coins arrondis (mm)
        <input
          type="number"
          min="0"
          max="30"
          step="1"
          value={style.border_radius_mm ?? 0}
          onChange={(e) => patchStyle({ border_radius_mm: parseFloat(e.target.value) || 0 })}
        />
      </label>

      <p className="editor-image-edit-popover__label">Position du bloc</p>
      <div className="editor-image-edit-popover__geom">
        {['x', 'y', 'w', 'h'].map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              type="number"
              step="0.5"
              value={block[key] ?? 0}
              onChange={(e) => onBlockPatch?.({ [key]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
