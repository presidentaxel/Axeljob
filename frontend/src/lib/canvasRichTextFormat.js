/**
 * Formatage riche inline (sélection ou bloc entier en édition).
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

export function hasTextSelection() {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  return !range.collapsed && getActiveEditableRoot() != null;
}

export function saveSelection() {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return null;
  try {
    return sel.getRangeAt(0).cloneRange();
  } catch {
    return null;
  }
}

export function restoreSelection(range) {
  if (!range) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

export function selectAllInEditableRoot() {
  const root = getActiveEditableRoot();
  if (!root) return false;
  root.focus();
  const range = document.createRange();
  range.selectNodeContents(root);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

export function applyRichTextCommand(command, value = null) {
  const root = getActiveEditableRoot();
  if (!root) return false;
  const saved = saveSelection();
  root.focus();
  if (saved) restoreSelection(saved);
  try {
    document.execCommand('styleWithCSS', false, true);
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

export function applyRichTextCommandWithFallback(command, value = null) {
  if (hasTextSelection()) return applyRichTextCommand(command, value);
  if (selectAllInEditableRoot()) return applyRichTextCommand(command, value);
  return false;
}

export function applyStyleToSelection(cssStyles) {
  const root = getActiveEditableRoot();
  if (!root) return false;
  const saved = saveSelection();
  root.focus();
  if (saved) restoreSelection(saved);
  const sel = document.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return false;

  const span = document.createElement('span');
  Object.assign(span.style, cssStyles);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const nr = document.createRange();
  nr.selectNodeContents(span);
  nr.collapse(false);
  sel.addRange(nr);
  return true;
}

export function queryCommandState(command) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

export function applyFontFamilyToSelection(fontFamily) {
  return applyStyleToSelection({ fontFamily });
}

export function applyFontSizeToSelection(pt) {
  const size = typeof pt === 'number' ? `${pt}pt` : pt;
  return applyStyleToSelection({ fontSize: size });
}

export function applyColorToSelection(color) {
  if (applyRichTextCommand('foreColor', color)) return true;
  return applyStyleToSelection({ color });
}

/** Bascule majuscules / minuscules sur la sélection (ou tout le champ). */
export function toggleTextCase() {
  const root = getActiveEditableRoot();
  if (!root) return false;
  const saved = saveSelection();
  root.focus();
  if (saved) restoreSelection(saved);
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  let range = sel.getRangeAt(0);
  if (range.collapsed) {
    selectAllInEditableRoot();
    if (!sel.rangeCount) return false;
    range = sel.getRangeAt(0);
  }
  const text = range.toString();
  if (!text) return false;
  const next = flipCase(text);
  range.deleteContents();
  const textNode = document.createTextNode(next);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function flipCase(text) {
  if (!text) return text;
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (!letters) return text;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (allUpper) return text.toLowerCase();
  if (allLower) return text.toUpperCase();
  return text.toLowerCase();
}

export function applyStyleToEditableRoot(stylePatch) {
  const root = getActiveEditableRoot();
  if (!root) return;
  Object.assign(root.style, stylePatch);
}

export function readRichHtmlFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(`${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing`);
  if (!el) return '';
  return el.innerHTML || '';
}
