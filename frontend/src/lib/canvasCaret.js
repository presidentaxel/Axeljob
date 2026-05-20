/**
 * Placement du curseur dans un bloc canvas en édition.
 */

/** Place le caret au point client (x, y) dans root, ou focus le champ le plus proche. */
export function placeCaretAtPoint(root, clientX, clientY) {
  if (!root) return false;

  let range = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(clientX, clientY);
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  if (range && root.contains(range.startContainer)) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  const editables = root.querySelectorAll(
    '[contenteditable="true"], [data-cv-field], .canvas-editable-field',
  );
  if (editables.length === 0) {
    root.focus?.();
    return false;
  }

  let best = editables[0];
  let bestDist = Infinity;
  for (const el of editables) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = (cx - clientX) ** 2 + (cy - clientY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }

  best.focus();
  const sel = window.getSelection();
  const endRange = document.createRange();
  endRange.selectNodeContents(best);
  endRange.collapse(false);
  sel.removeAllRanges();
  sel.addRange(endRange);
  return true;
}

/** true si target est dans la toolbar flottante (ne doit pas quitter l'édition). */
export function isFloatingToolbarTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('.editor-floating-toolbar, .editor-block-chrome-toolbar'));
}
