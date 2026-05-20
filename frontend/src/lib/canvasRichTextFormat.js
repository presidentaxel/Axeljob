/**
 * Formatage riche inline dans les blocs canvas (selection contentEditable).
 */

export function getActiveEditableRoot() {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || typeof node.closest !== 'function') return null;
  return node.closest(
    '.free-canvas-block__text--editing, .free-canvas-block__title--editing, .canvas-editable-field',
  );
}

export function applyRichTextCommand(command, value = null) {
  const root = getActiveEditableRoot();
  if (!root) return false;
  root.focus();
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

export function readRichHtmlFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(`${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing`);
  if (!el) return '';
  return el.innerHTML || '';
}
