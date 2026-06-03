function blockContainsPoint(block, point) {
  if (!block || !point || block.locked || !block.id) return false;
  const x = Number(block.x) || 0;
  const y = Number(block.y) || 0;
  const w = Number(block.w) || 0;
  const h = Number(block.h) || 0;
  return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

export function selectableBlocksAtPoint(blocks, point) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => blockContainsPoint(block, point))
    .sort((a, b) => {
      const zDiff = (Number(b.block.z) || 0) - (Number(a.block.z) || 0);
      return zDiff || b.index - a.index;
    })
    .map(({ block }) => block);
}

export function nextOverlappingBlockId(blocks, point, selectedBlockId) {
  if (!selectedBlockId) return null;
  const hits = selectableBlocksAtPoint(blocks, point);
  if (hits.length < 2) return null;
  const selectedIndex = hits.findIndex((block) => block.id === selectedBlockId);
  if (selectedIndex < 0) return null;
  return hits[(selectedIndex + 1) % hits.length]?.id || null;
}
