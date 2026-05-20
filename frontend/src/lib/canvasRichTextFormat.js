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

const PT_PER_PX = 72 / 96;

function parseFontSizePt(el) {
  if (!el || el.nodeType !== 1) return null;
  const inline = el.style?.fontSize;
  if (inline && inline.endsWith('pt')) {
    const n = parseFloat(inline);
    return Number.isFinite(n) ? n : null;
  }
  const px = parseFloat(window.getComputedStyle(el).fontSize);
  if (!Number.isFinite(px) || px <= 0) return null;
  return px * PT_PER_PX;
}

function setFontSizePt(el, pt) {
  if (!el || el.nodeType !== 1) return;
  const clamped = Math.min(48, Math.max(6, pt));
  el.style.fontSize = `${clamped}pt`;
}

/** Incrémente chaque taille de police distincte dans la sélection ou tout le root. */
export function bumpFontSizesBy(delta, { root: rootOverride } = {}) {
  const root = rootOverride || getActiveEditableRoot();
  if (!root || !Number.isFinite(delta) || delta === 0) return false;

  const sel = document.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  const hasRange = range && !range.collapsed && root.contains(range.commonAncestorContainer);

  const elements = new Set();
  if (hasRange) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (range.intersectsNode(node)) elements.add(node);
      node = walker.nextNode();
    }
    if (range.commonAncestorContainer.nodeType === 1) {
      elements.add(range.commonAncestorContainer);
    }
  } else {
    elements.add(root);
    root.querySelectorAll('*').forEach((el) => elements.add(el));
  }

  let changed = false;
  for (const el of elements) {
    const cur = parseFontSizePt(el);
    if (cur == null) continue;
    setFontSizePt(el, cur + delta);
    changed = true;
  }

  const rootPt = parseFontSizePt(root);
  if (rootPt != null) {
    setFontSizePt(root, rootPt + delta);
    changed = true;
  }

  return changed;
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

export function getEditingBlockInnerRoot() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.free-canvas-block--editing .free-canvas-block__inner');
}

export function applyStyleToEditableRoot(stylePatch) {
  const root = getActiveEditableRoot();
  if (root) {
    Object.assign(root.style, stylePatch);
    return true;
  }
  return applyStyleToBlockEditables(getEditingBlockInnerRoot(), stylePatch);
}

/** Applique un style à tous les champs éditables du bloc en cours d’édition. */
export function applyStyleToBlockEditables(blockRootEl, stylePatch) {
  if (!blockRootEl || !stylePatch) return false;
  const fields = blockRootEl.querySelectorAll(
    '.canvas-editable-field, .free-canvas-block__text--editing, .free-canvas-block__title--editing',
  );
  if (!fields.length) return false;
  fields.forEach((el) => Object.assign(el.style, stylePatch));
  return true;
}

export function readRichHtmlFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(`${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing`);
  if (!el) return '';
  return el.innerHTML || '';
}
