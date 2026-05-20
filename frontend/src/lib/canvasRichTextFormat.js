/**
 * Formatage riche inline (sélection uniquement en mode édition).
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

export function applyRichTextCommand(command, value = null) {
  const root = getActiveEditableRoot();
  if (!root) return false;
  root.focus();
  try {
    document.execCommand('styleWithCSS', false, true);
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

/** Applique des styles CSS sur la sélection (police, taille, couleur…). */
export function applyStyleToSelection(cssStyles) {
  const root = getActiveEditableRoot();
  if (!root) return false;
  root.focus();
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

export function readRichHtmlFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(`${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing`);
  if (!el) return '';
  return el.innerHTML || '';
}
