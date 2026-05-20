/**
 * Empreinte stable d un layout v3 pour le scoring ATS.
 * Evite les refetch inutiles quand la reference objet change sans
 * modification geometrique (undo/redo, re-render React).
 */

function roundMm(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 2) / 2;
}

/**
 * @param {object | null | undefined} layout
 * @returns {string}
 */
export function layoutFingerprintForScoring(layout) {
  if (!layout || typeof layout !== 'object') return '';
  const blockLines = [];
  for (const page of layout.pages || []) {
    if (!page || !Array.isArray(page.blocks)) continue;
    for (const b of page.blocks) {
      if (!b?.id) continue;
      const style = b.style && typeof b.style === 'object' ? b.style : {};
      blockLines.push([
        b.id,
        b.type || '',
        roundMm(b.x),
        roundMm(b.y),
        roundMm(b.w),
        roundMm(b.h),
        Number.isFinite(b.z) ? Math.floor(b.z) : 0,
        style.overflow || '',
        style.format || '',
      ].join('|'));
    }
  }
  blockLines.sort();
  return JSON.stringify({
    v: layout.version ?? null,
    g: layout.grid ?? null,
    sr: layout.sidebar_ratio ?? null,
    blocks: blockLines,
  });
}
