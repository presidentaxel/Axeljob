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

/** Pas fin (mm) pour flèches ; Shift = grand pas (AXE-35). */
export const CANVAS_NUDGE_STEP_MM = 1;
export const CANVAS_NUDGE_STEP_LARGE_MM = 5;

/** Media query : tablette / mobile (desktop = ≥ 1024px). */
export const CANVAS_DESKTOP_LAYOUT_MQ = '(max-width: 1023px)';

export const CANVAS_DESKTOP_HINT_DISMISSED_KEY = 'cv_beta_canvas_desktop_hint_dismissed';

/**
 * Delta de déplacement clavier pour une touche fléchée.
 * @param {string} key
 * @param {{ shiftKey?: boolean }} [opts]
 * @returns {{ dx: number, dy: number } | null}
 */
export function canvasNudgeDeltaFromKey(key, { shiftKey = false } = {}) {
  const step = shiftKey ? CANVAS_NUDGE_STEP_LARGE_MM : CANVAS_NUDGE_STEP_MM;
  if (key === 'ArrowLeft') return { dx: -step, dy: 0 };
  if (key === 'ArrowRight') return { dx: step, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: -step };
  if (key === 'ArrowDown') return { dx: 0, dy: step };
  return null;
}

/**
 * True si le focus est dans un champ où les flèches / Delete ne doivent pas
 * piloter le canvas (inputs sidebar, édition inline, etc.).
 * @param {Element|EventTarget|null|undefined} el
 */
export function isCanvasTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  const node = /** @type {Element} */ (el);
  if (typeof node.closest === 'function') {
    if (node.closest('input, textarea, select, [contenteditable="true"]')) return true;
  }
  const tag = String(node.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  // @ts-ignore isContentEditable sur HTMLElement
  if (node.isContentEditable) return true;
  return false;
}

export function isCanvasDesktopHintDismissed() {
  try {
    return localStorage.getItem(CANVAS_DESKTOP_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissCanvasDesktopHint() {
  try {
    localStorage.setItem(CANVAS_DESKTOP_HINT_DISMISSED_KEY, '1');
  } catch {
    /* ignore */
  }
}
