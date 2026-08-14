/**
 * Vignette proportionnelle d'un layout v3 (blocs page 1).
 * Approximation visuelle — pas un rendu pixel-perfect (AXE-326).
 */

const PAGE_W = 210;
const PAGE_H = 297;

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function blockFill(block) {
  const type = typeof block?.type === 'string' ? block.type : '';
  if (type.startsWith('shape:')) {
    return block?.style?.color || block?.style?.fill || '#d9d9dd';
  }
  if (type === 'photo' || type === 'image') return '#c5c5ce';
  if (type === 'identity' || type === 'title') return '#17171c';
  if (type === 'contact') return '#75758a';
  return '#93939f';
}

export default function ImportLayoutMiniPreview({ layout, className = '' }) {
  const page = layout?.pages?.[0];
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const sorted = [...blocks].sort((a, b) => asNum(a.z) - asNum(b.z));

  return (
    <div
      className={`import-layout-mini ${className}`.trim()}
      aria-hidden="true"
    >
      <div className="import-layout-mini__page">
        {sorted.slice(0, 40).map((block) => {
          if (!block?.id) return null;
          const x = (asNum(block.x) / PAGE_W) * 100;
          const y = (asNum(block.y) / PAGE_H) * 100;
          const w = Math.max((asNum(block.w, 10) / PAGE_W) * 100, 1.5);
          const h = Math.max((asNum(block.h, 4) / PAGE_H) * 100, 0.8);
          return (
            <span
              key={block.id}
              className="import-layout-mini__block"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${w}%`,
                height: `${h}%`,
                background: blockFill(block),
                opacity: String(block.type || '').startsWith('shape:') ? 0.55 : 0.85,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
