import { useCallback, useMemo, useState } from 'react';
import { getBlockTypeLabel } from '../../lib/blockInspectorSchema.js';
import { listAllBlocks } from '../../lib/cvLayoutModelV3.js';
import '../../styles/EditorCanvaPositionDrawer.css';

const LAYER_DRAG_MIME = 'application/x-cv-canvas-layer';

/**
 * Panneau Position / calques (drawer sidebar) avec onglets.
 */
export default function EditorCanvaPositionDrawer({
  layout,
  selectedBlockId,
  onSelectBlock,
  onBlockPatch,
  onBlockBringToFront,
  onBlockSendToBack,
  onBlockZStep,
  onReorderLayers,
}) {
  const [activeTab, setActiveTab] = useState('position');
  const [dragLayerId, setDragLayerId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const blocks = useMemo(
    () => listAllBlocks(layout).slice().sort((a, b) => (b.z || 0) - (a.z || 0)),
    [layout],
  );
  const selected = blocks.find((b) => b.id === selectedBlockId);

  const handleLayerDragStart = useCallback((blockId, event) => {
    setDragLayerId(blockId);
    setDragOverId(blockId);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData(LAYER_DRAG_MIME, blockId);
        event.dataTransfer.setData('text/plain', blockId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleLayerDragOver = useCallback((blockId, event) => {
    if (!dragLayerId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDragOverId(blockId);
  }, [dragLayerId]);

  const handleLayerDrop = useCallback((targetId, event) => {
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData(LAYER_DRAG_MIME) || dragLayerId;
    setDragLayerId(null);
    setDragOverId(null);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    onReorderLayers?.(next);
  }, [blocks, dragLayerId, onReorderLayers]);

  const handleLayerDragEnd = useCallback(() => {
    setDragLayerId(null);
    setDragOverId(null);
  }, []);

  return (
    <div className="editor-canva-position-drawer">
      <div className="editor-canva-position-drawer__tabs" role="tablist" aria-label="Position ou calques">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'position'}
          className={
            activeTab === 'position'
              ? 'editor-canva-position-drawer__tab editor-canva-position-drawer__tab--active'
              : 'editor-canva-position-drawer__tab'
          }
          onClick={() => setActiveTab('position')}
        >
          Position
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'layers'}
          className={
            activeTab === 'layers'
              ? 'editor-canva-position-drawer__tab editor-canva-position-drawer__tab--active'
              : 'editor-canva-position-drawer__tab'
          }
          onClick={() => setActiveTab('layers')}
        >
          Calques
        </button>
      </div>

      {activeTab === 'position' && (
        <div role="tabpanel">
          {!selected && (
            <p className="editor-canva-position-drawer__empty">
              Sélectionnez un élément sur le canevas pour ajuster sa position.
            </p>
          )}
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
        </div>
      )}

      {activeTab === 'layers' && (
        <div role="tabpanel">
          <p className="editor-canva-position-drawer__layers-hint">
            Glissez les calques pour changer l&apos;ordre d&apos;empilement.
          </p>
          <ul className="editor-canva-position-drawer__layers">
            {blocks.map((b) => (
              <li
                key={b.id}
                className={
                  dragOverId === b.id && dragLayerId !== b.id
                    ? 'editor-canva-position-drawer__layer-row editor-canva-position-drawer__layer-row--over'
                    : 'editor-canva-position-drawer__layer-row'
                }
                onDragOver={(e) => handleLayerDragOver(b.id, e)}
                onDrop={(e) => handleLayerDrop(b.id, e)}
              >
                <span
                  className="editor-canva-position-drawer__layer-grip"
                  draggable
                  title="Glisser pour réordonner"
                  aria-label="Glisser pour réordonner"
                  onDragStart={(e) => handleLayerDragStart(b.id, e)}
                  onDragEnd={handleLayerDragEnd}
                >
                  ⋮⋮
                </span>
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
      )}
    </div>
  );
}
