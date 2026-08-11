/**
 * Edition inline canvas libre (P4.1) : sync champs data-cv-field et block.content.
 * AXE-40 : whitelist HTML stricte + collage propre.
 */

import createDOMPurify from 'dompurify';
import { getByPath } from './freeCanvasContent.js';

function getDomPurify() {
  if (typeof createDOMPurify?.sanitize === 'function') return createDOMPurify;
  if (typeof globalThis.window !== 'undefined') {
    try {
      return createDOMPurify(globalThis.window);
    } catch {
      return null;
    }
  }
  return null;
}

const DOMPurify = getDomPurify();

/** Styles CSS autorisés sur <span> (alignés backend html_sanitize). */
const ALLOWED_SPAN_STYLE_PROPS = new Set([
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
]);

const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)|[a-zA-Z]{3,20})$/;
const FONT_WEIGHT_RE = /^(normal|bold|[1-9]00)$/i;
const FONT_STYLE_RE = /^(normal|italic|oblique)$/i;
const TEXT_DECO_RE = /^(none|underline|line-through|underline line-through)$/i;

function sanitizeSpanStyle(styleValue) {
  if (typeof styleValue !== 'string' || !styleValue) return '';
  const parts = [];
  for (const decl of styleValue.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_SPAN_STYLE_PROPS.has(prop) || !value) continue;
    if (prop === 'color' && !COLOR_RE.test(value)) continue;
    if (prop === 'font-weight' && !FONT_WEIGHT_RE.test(value)) continue;
    if (prop === 'font-style' && !FONT_STYLE_RE.test(value)) continue;
    if (prop === 'text-decoration' && !TEXT_DECO_RE.test(value)) continue;
    parts.push(`${prop}:${value}`);
  }
  return parts.join(';');
}

/**
 * Whitelist AXE-40 : strong, em, u, s, span (style limité), br.
 * b/i/strike acceptés en entrée puis normalisés par DOMPurify / alias.
 */
const RICH_TEXT_SANITIZE_CONFIG = Object.freeze({
  ALLOWED_TAGS: ['strong', 'em', 'u', 's', 'span', 'br', 'b', 'i', 'strike'],
  ALLOWED_ATTR: ['style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'img', 'iframe', 'object', 'embed', 'svg', 'a', 'font'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'href', 'src', 'color', 'face', 'class', 'id'],
});

let _hooksInstalled = false;

function ensureDomPurifyHooks() {
  if (_hooksInstalled || typeof DOMPurify?.addHook !== 'function') return;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'style') return;
    if ((node.tagName || '').toLowerCase() !== 'span') {
      data.keepAttr = false;
      return;
    }
    const cleaned = sanitizeSpanStyle(data.attrValue);
    if (!cleaned) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = cleaned;
  });
  _hooksInstalled = true;
}

function normalizeAliasTags(html) {
  return html
    .replace(/<\s*\/?\s*b\b/gi, (m) => m.replace(/b/i, 'strong'))
    .replace(/<\s*\/?\s*i\b/gi, (m) => m.replace(/i/i, 'em'))
    .replace(/<\s*\/?\s*strike\b/gi, (m) => m.replace(/strike/i, 's'));
}

/** Escape HTML (Node / absence de DOM) — jamais de regex strip tags (CodeQL). */
function escapeHtmlPlain(html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Nettoie un fragment de texte riche selon la whitelist canvas. */
export function sanitizeRichTextHtml(html) {
  if (typeof html !== 'string' || html === '') return '';
  ensureDomPurifyHooks();
  if (!DOMPurify?.sanitize) {
    return escapeHtmlPlain(html);
  }
  const cleaned = normalizeAliasTags(DOMPurify.sanitize(html, RICH_TEXT_SANITIZE_CONFIG));
  return cleaned === '<br>' ? '' : cleaned;
}

/**
 * Collage propre : HTML clipboard → whitelist, sinon texte brut échappé.
 * À brancher sur contentEditable via onPaste={handleRichTextPaste}.
 */
export function handleRichTextPaste(event) {
  if (!event?.clipboardData) return;
  event.preventDefault();
  const html = event.clipboardData.getData('text/html');
  const text = event.clipboardData.getData('text/plain');
  let fragment = '';
  if (html && html.trim()) {
    fragment = sanitizeRichTextHtml(html);
  } else if (text) {
    fragment = sanitizeRichTextHtml(
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>'),
    );
  }
  if (!fragment) return;
  if (typeof document !== 'undefined' && document.execCommand) {
    document.execCommand('insertHTML', false, fragment);
  }
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

const ESCAPED_RICH_HTML_RE = /&lt;\/?(?:b|strong|i|em|u|s|strike|span|br|div|p)\b/i;

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

export function fieldValueLooksLikeHtml(value) {
  if (typeof value !== 'string' || !value) return false;
  const normalized = normalizeRichTextHtml(value);
  return /<(?:strong|em|u|s|span|b|i|br|strike)\b/i.test(normalized);
}

/** Valeur d'un champ contentEditable (HTML si formatage inline, sinon texte). */
export function fieldValueFromEditableEl(el) {
  if (!el) return '';
  const html = normalizeRichTextHtml(el.innerHTML || '');
  if (!html || html === '<br>') return '';
  if (/<(?:b|strong|i|em|u|s|strike|span)\b/i.test(html)) {
    return sanitizeRichTextHtml(html);
  }
  return (el.textContent || '').trim();
}

export function getFieldDisplayValue(cv, path) {
  const v = getByPath(cv, path);
  return typeof v === 'string' ? v : '';
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

export function readBlockContentFromRoot(rootEl) {
  if (!rootEl) return '';
  const el = rootEl.querySelector('[data-canvas-block-content="1"]');
  if (!el) return '';
  return fieldValueFromEditableEl(el);
}
