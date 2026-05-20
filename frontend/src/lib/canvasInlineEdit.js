/**
 * Edition inline canvas libre (P4.1) : sync champs data-cv-field et block.content.
 */

import { getByPath } from './freeCanvasContent.js';

export function setByPath(obj, path, value) {
  const parts = path.split('.');
  const key = parts.pop();
  let target = obj;
  for (const p of parts) {
    const i = parseInt(p, 10);
    const k = !Number.isNaN(i) && String(i) === p ? i : p;
    if (target[k] === undefined) target[k] = Number.isNaN(i) ? {} : [];
    target = target[k];
  }
  target[key] = value;
}

export function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

/** Types de blocs ou l utilisateur peut editer du texte inline. */
export const CANVAS_INLINE_EDITABLE_TYPES = new Set([
  'text',
  'title',
  'identity',
  'contact',
  'resume',
  'experiences',
  'formations',
  'certifications',
  'projets',
]);

export function isCanvasInlineEditableType(type) {
  return CANVAS_INLINE_EDITABLE_TYPES.has(type);
}

export function findCvArrayIndex(cv, arrayKey, item) {
  const all = Array.isArray(cv?.[arrayKey]) ? cv[arrayKey] : [];
  if (item?.id) {
    const byId = all.findIndex((e) => e?.id === item.id);
    if (byId >= 0) return byId;
  }
  return all.indexOf(item);
}

/**
 * Lit les champs [data-cv-field] sous root et applique sur une copie du CV.
 */
export function applyCvFieldsFromRoot(cv, rootEl) {
  if (!cv || !rootEl) return cv;
  const fields = rootEl.querySelectorAll('[data-cv-field]');
  if (!fields.length) return cv;
  const next = deepClone(cv);
  fields.forEach((el) => {
    const path = el.getAttribute('data-cv-field');
    if (!path) return;
    setByPath(next, path, (el.textContent || '').trim());
  });
  return next;
}

/** Contenu texte libre / titre depuis le DOM du bloc (HTML riche autorisé). */
export function readBlockContentFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(
    `${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing`,
  );
  if (!el) return '';
  const html = (el.innerHTML || '').trim();
  if (!html || html === '<br>') return '';
  return html;
}

export function getFieldDisplayValue(cv, path) {
  const v = getByPath(cv, path);
  return typeof v === 'string' ? v : '';
}
