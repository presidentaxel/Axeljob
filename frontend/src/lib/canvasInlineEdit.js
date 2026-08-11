/**
 * Edition inline canvas libre (P4.1) : sync champs data-cv-field et block.content.
 */

import DOMPurify from 'dompurify';
import { getByPath } from './freeCanvasContent.js';

/**
 * Whitelist stricte pour le texte riche du canvas. Seules les balises de
 * formatage inline produites par la toolbar (gras / italique / souligné /
 * couleur) sont autorisées : tout le reste (script, img, on*, iframe…) est
 * retiré. Appliqué A LA CAPTURE et AU RENDU (defense in depth) car le HTML
 * est aussi renvoyé au backend (rendu PDF / serveur).
 */
const RICH_TEXT_SANITIZE_CONFIG = Object.freeze({
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'font', 'br'],
  ALLOWED_ATTR: ['style', 'color', 'face'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'img', 'iframe', 'object', 'embed', 'svg', 'a'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'href', 'src'],
});

/** Nettoie un fragment de texte riche selon la whitelist canvas. */
export function sanitizeRichTextHtml(html) {
  if (typeof html !== 'string' || html === '') return '';
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE_CONFIG);
}

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

const ESCAPED_RICH_HTML_RE = /&lt;\/?(?:b|strong|i|em|u|s|strike|span|font|br|div|p)\b/i;

function decodeHtmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function normalizeRichTextHtml(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!ESCAPED_RICH_HTML_RE.test(trimmed)) return trimmed;
  return decodeHtmlEntities(trimmed);
}

/** Valeur d'un champ contentEditable (HTML si formatage inline, sinon texte). */
export function fieldValueFromEditableEl(el) {
  if (!el) return '';
  const html = normalizeRichTextHtml(el.innerHTML || '');
  if (!html || html === '<br>') return '';
  if (/<(?:b|strong|i|em|u|s|strike|span|font)\b/i.test(html)) {
    return sanitizeRichTextHtml(html);
  }
  return (el.textContent || '').trim();
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
    setByPath(next, path, fieldValueFromEditableEl(el));
  });
  return next;
}

/** Contenu texte libre / titre depuis le DOM du bloc (HTML riche autorisé). */
export function readBlockContentFromRoot(rootEl, blockType) {
  if (!rootEl) return '';
  const sel = blockType === 'title' ? '.free-canvas-block__title' : '.free-canvas-block__text';
  const el = rootEl.querySelector(
    `${sel}, .free-canvas-block__title--editing, .free-canvas-block__text--editing, [data-canvas-block-content]`,
  );
  if (!el) return '';
  const html = normalizeRichTextHtml(el.innerHTML || '');
  if (!html || html === '<br>') return '';
  return sanitizeRichTextHtml(html);
}

export function getFieldDisplayValue(cv, path) {
  const v = getByPath(cv, path);
  return typeof v === 'string' ? v : '';
}

export function fieldValueLooksLikeHtml(value) {
  return typeof value === 'string' && /<[a-z][\s\S]*>/i.test(normalizeRichTextHtml(value));
}
