/** Utilitaires sélection marquee canvas (mm). */

export function normalizeMarqueeRect(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function blockIntersectsRect(block, rect) {
  if (!block || !rect || rect.w < 1 || rect.h < 1) return false;
  const bx = Number(block.x) || 0;
  const by = Number(block.y) || 0;
  const bw = Number(block.w) || 0;
  const bh = Number(block.h) || 0;
  return !(bx + bw < rect.x || bx > rect.x + rect.w || by + bh < rect.y || by > rect.y + rect.h);
}

export function blockIdsInMarquee(blocks, rect) {
  if (!Array.isArray(blocks) || !rect) return [];
  return blocks.filter((b) => b?.id && blockIntersectsRect(b, rect)).map((b) => b.id);
}
