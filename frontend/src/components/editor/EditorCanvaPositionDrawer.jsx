import { getBlockTypeLabel } from '../../lib/blockInspectorSchema.js';
import { listAllBlocks } from '../../lib/cvLayoutModelV3.js';
import '../../styles/EditorCanvaPositionDrawer.css';

/**
 * Panneau Position / calques (drawer sidebar).
 */
export default function EditorCanvaPositionDrawer({
  layout,
  selectedBlockId,
  onSelectBlock,
  onBlockPatch,
  onBlockBringToFront,
  onBlockSendToBack,
  onBlockZStep,
}) {
  const blocks = listAllBlocks(layout).slice().sort((a, b) => (b.z || 0) - (a.z || 0));
  const selected = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="editor-canva-position-drawer">
      <h3 className="editor-canva-drawer__title">Position & calques</h3>
      {selected && (
        <div className="editor-canva-position-drawer__geom">
          {['x', 'y', 'w', 'h', 'z'].map((key) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                step={key === 'z' ? 1 : 0.5}
                value={selected[key] ?? 0}
                onChange={(e) => onBlockPatch?.(selected.id, { [key]: parseFloat(e.target.value) || 0 })}
              />
            </label>
          ))}
          <div className="editor-canva-position-drawer__z-actions">
            <button type="button" onClick={() => onBlockBringToFront?.(selected.id)}>Premier plan</button>
            <button type="button" onClick={() => onBlockSendToBack?.(selected.id)}>Arrière-plan</button>
            <button type="button" onClick={() => onBlockZStep?.(selected.id, 1)}>+ plan</button>
            <button type="button" onClick={() => onBlockZStep?.(selected.id, -1)}>− plan</button>
          </div>
        </div>
      )}
      <h4 className="editor-canva-drawer__subtitle">Calques</h4>
      <ul className="editor-canva-position-drawer__layers">
        {blocks.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={
                b.id === selectedBlockId
                  ? 'editor-canva-position-drawer__layer editor-canva-position-drawer__layer--active'
                  : 'editor-canva-position-drawer__layer'
              }
              onClick={() => onSelectBlock?.(b.id)}
            >
              <span className="editor-canva-position-drawer__layer-z">z{b.z ?? 0}</span>
              <span>{getBlockTypeLabel(b.type)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
