import { useCallback, useMemo, useState } from 'react';
import {
  HiBars3BottomLeft,
  HiBars3,
  HiBars3BottomRight,
  HiDocumentDuplicate,
  HiLockClosed,
  HiLockOpen,
  HiTrash,
} from 'react-icons/hi2';
import { getBlockDisplayName } from '../../lib/blockInspectorSchema.js';
import {
  computeBlockHorizontalAlign,
  computeHorizontalDistribute,
  computeLayerLabelPatch,
} from '../../lib/canvasEditorUtils.js';
import { isNonSemanticBlockType, listAllBlocks } from '../../lib/cvLayoutModelV3.js';
import '../../styles/EditorCanvaPositionDrawer.css';

const LAYER_DRAG_MIME = 'application/x-cv-canvas-layer';

/**
 * Panneau Position / calques (drawer sidebar) — actions simples d'abord (AXE-34).
 */
export default function EditorCanvaPositionDrawer({
  layout,
  selectedBlockId,
  selectedBlockIds = [],
  onSelectBlock,
  onBlockPatch,
  onBlocksPatch,
  onBlockBringToFront,
  onBlockSendToBack,
  onBlockZStep,
  onReorderLayers,
  onDeleteSelected,
  onDuplicateSelected,
  onToggleLock,
}) {
  const [activeTab, setActiveTab] = useState('position');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragLayerId, setDragLayerId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const blocks = useMemo(
    () => listAllBlocks(layout).slice().sort((a, b) => (b.z || 0) - (a.z || 0)),
    [layout],
  );
  const selected = blocks.find((b) => b.id === selectedBlockId);
  const multiIds = selectedBlockIds?.length ? selectedBlockIds : (selectedBlockId ? [selectedBlockId] : []);
  const canDistribute = multiIds.length >= 3;
  const canRename = selected && isNonSemanticBlockType(selected.type);
  const locked = Boolean(selected?.locked);

  const applyAlign = useCallback((align) => {
    const targets = multiIds.length ? multiIds : (selectedBlockId ? [selectedBlockId] : []);
    if (!targets.length) return;
    const patches = [];
    for (const id of targets) {
      const block = blocks.find((b) => b.id === id);
      if (!block || block.locked) continue;
      const patch = computeBlockHorizontalAlign(block, align);
      if (patch) patches.push({ id, ...patch });
    }
    if (!patches.length) return;
    if (typeof onBlocksPatch === 'function') {
      onBlocksPatch(patches);
      return;
    }
    patches.forEach(({ id, ...patch }) => onBlockPatch?.(id, patch));
  }, [blocks, multiIds, onBlockPatch, onBlocksPatch, selectedBlockId]);

  const applyDistribute = useCallback(() => {
    if (!canDistribute) return;
    const selectedBlocks = multiIds
      .map((id) => blocks.find((b) => b.id === id))
      .filter(Boolean);
    const patches = computeHorizontalDistribute(selectedBlocks);
    if (!patches.length) return;
    if (typeof onBlocksPatch === 'function') {
      onBlocksPatch(patches);
      return;
    }
    patches.forEach(({ id, x }) => onBlockPatch?.(id, { x }));
  }, [blocks, canDistribute, multiIds, onBlockPatch, onBlocksPatch]);

  const handleRename = useCallback((value) => {
    if (!selected || !canRename) return;
    const patch = computeLayerLabelPatch(selected, value);
    if (patch) onBlockPatch?.(selected.id, patch);
  }, [canRename, onBlockPatch, selected]);

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
            <>
              <p className="editor-canva-position-drawer__selection-name">
                {getBlockDisplayName(selected)}
                {multiIds.length > 1 ? ` · ${multiIds.length} sélectionnés` : ''}
              </p>

              <div className="editor-canva-position-drawer__section">
                <p className="editor-canva-position-drawer__section-label">Aligner</p>
                <div className="editor-canva-position-drawer__action-row" role="group" aria-label="Alignement horizontal">
                  <button type="button" title="Aligner à gauche" aria-label="Aligner à gauche" disabled={locked && multiIds.length <= 1} onClick={() => applyAlign('left')}>
                    <HiBars3BottomLeft size={16} aria-hidden />
                  </button>
                  <button type="button" title="Centrer" aria-label="Centrer" disabled={locked && multiIds.length <= 1} onClick={() => applyAlign('center')}>
                    <HiBars3 size={16} aria-hidden />
                  </button>
                  <button type="button" title="Aligner à droite" aria-label="Aligner à droite" disabled={locked && multiIds.length <= 1} onClick={() => applyAlign('right')}>
                    <HiBars3BottomRight size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="editor-canva-position-drawer__action-text"
                    title={canDistribute ? 'Distribuer horizontalement' : 'Sélectionnez au moins 3 éléments'}
                    aria-label="Distribuer horizontalement"
                    disabled={!canDistribute}
                    onClick={applyDistribute}
                  >
                    Distribuer
                  </button>
                </div>
              </div>

              <div className="editor-canva-position-drawer__section">
                <p className="editor-canva-position-drawer__section-label">Plan</p>
                <div className="editor-canva-position-drawer__action-row editor-canva-position-drawer__action-row--wrap">
                  <button type="button" className="editor-canva-position-drawer__action-text" onClick={() => onBlockBringToFront?.(selected.id)}>
                    Premier plan
                  </button>
                  <button type="button" className="editor-canva-position-drawer__action-text" onClick={() => onBlockSendToBack?.(selected.id)}>
                    Arrière-plan
                  </button>
                </div>
              </div>

              <div className="editor-canva-position-drawer__section">
                <p className="editor-canva-position-drawer__section-label">Actions</p>
                <div className="editor-canva-position-drawer__action-row" role="group" aria-label="Actions sur le bloc">
                  <button
                    type="button"
                    title={locked ? 'Déverrouiller' : 'Verrouiller'}
                    aria-label={locked ? 'Déverrouiller' : 'Verrouiller'}
                    aria-pressed={locked}
                    onClick={() => onToggleLock?.()}
                  >
                    {locked ? <HiLockClosed size={16} aria-hidden /> : <HiLockOpen size={16} aria-hidden />}
                  </button>
                  <button type="button" title="Dupliquer" aria-label="Dupliquer" onClick={() => onDuplicateSelected?.()}>
                    <HiDocumentDuplicate size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="editor-canva-position-drawer__btn-danger"
                    title="Supprimer"
                    aria-label="Supprimer"
                    onClick={() => onDeleteSelected?.()}
                  >
                    <HiTrash size={16} aria-hidden />
                  </button>
                </div>
              </div>

              {canRename && (
                <label className="editor-canva-position-drawer__rename">
                  Nom du calque
                  <input
                    type="text"
                    maxLength={60}
                    value={typeof selected.style?.layer_label === 'string' ? selected.style.layer_label : ''}
                    placeholder={getBlockDisplayName({ type: selected.type })}
                    onChange={(e) => handleRename(e.target.value)}
                    disabled={locked}
                  />
                </label>
              )}

              <details
                className="editor-canva-position-drawer__advanced"
                open={advancedOpen}
                onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
              >
                <summary>Avancé</summary>
                <div className="editor-canva-position-drawer__geom">
                  {['x', 'y', 'w', 'h', 'z'].map((key) => (
                    <label key={key}>
                      {key.toUpperCase()}
                      <input
                        type="number"
                        step={key === 'z' ? 1 : 0.5}
                        value={selected[key] ?? 0}
                        disabled={locked && key !== 'z'}
                        onChange={(e) => onBlockPatch?.(selected.id, { [key]: parseFloat(e.target.value) || 0 })}
                      />
                    </label>
                  ))}
                  <div className="editor-canva-position-drawer__z-actions">
                    <button type="button" onClick={() => onBlockZStep?.(selected.id, 1)}>+ plan</button>
                    <button type="button" onClick={() => onBlockZStep?.(selected.id, -1)}>− plan</button>
                  </div>
                </div>
              </details>
            </>
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
                  {b.locked ? <HiLockClosed size={12} aria-hidden className="editor-canva-position-drawer__layer-lock" /> : null}
                  <span className="editor-canva-position-drawer__layer-name">{getBlockDisplayName(b)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
