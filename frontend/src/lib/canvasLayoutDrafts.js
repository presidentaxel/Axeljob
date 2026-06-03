import { migrateLayoutToV3 } from './cvLayoutModelV3.js';

const DRAFTS_STORAGE_KEY = 'cv_canvas_layout_drafts_v1';
const PREFS_STORAGE_KEY = 'cv_canvas_layout_draft_prefs_v1';
const ACTIVE_CONTEXT_STORAGE_KEY = 'cv_canvas_layout_active_context_v1';

export const BLANK_CANVAS_CONTEXT_KEY = 'blank';

export function templateCanvasContextKey(templateId) {
  const id = String(templateId || '').trim();
  return id ? `template:${id}` : BLANK_CANVAS_CONTEXT_KEY;
}

export function canvasContextLabel(contextKey, templatesList = []) {
  if (contextKey === BLANK_CANVAS_CONTEXT_KEY) return 'Page blanche';
  const templateId = String(contextKey || '').replace(/^template:/, '');
  const template = (templatesList || []).find((item) => item?.id === templateId);
  return template?.name || templateId || 'Template';
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadCanvasDraft(contextKey) {
  const key = String(contextKey || BLANK_CANVAS_CONTEXT_KEY);
  const drafts = readJson(DRAFTS_STORAGE_KEY, {});
  const entry = drafts[key];
  if (!entry?.layout) return null;
  return {
    ...entry,
    contextKey: key,
    layout: migrateLayoutToV3(entry.layout),
  };
}

export function saveCanvasDraft(contextKey, layout, meta = {}) {
  if (!layout) return null;
  const key = String(contextKey || BLANK_CANVAS_CONTEXT_KEY);
  const drafts = readJson(DRAFTS_STORAGE_KEY, {});
  const entry = {
    contextKey: key,
    layout,
    label: meta.label || drafts[key]?.label || key,
    updatedAt: Date.now(),
  };
  drafts[key] = entry;
  writeJson(DRAFTS_STORAGE_KEY, drafts);
  return entry;
}

export function listCanvasDrafts(templatesList = []) {
  const drafts = readJson(DRAFTS_STORAGE_KEY, {});
  return Object.values(drafts)
    .filter((entry) => entry?.contextKey && entry?.layout)
    .map((entry) => ({
      ...entry,
      label: entry.label || canvasContextLabel(entry.contextKey, templatesList),
      layout: migrateLayoutToV3(entry.layout),
    }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getCanvasDraftPrefs() {
  const prefs = readJson(PREFS_STORAGE_KEY, {});
  return {
    showTransferPrompt: prefs.showTransferPrompt !== false,
  };
}

export function setCanvasDraftPrefs(nextPrefs) {
  const current = getCanvasDraftPrefs();
  const next = { ...current, ...(nextPrefs || {}) };
  writeJson(PREFS_STORAGE_KEY, next);
  return next;
}

export function getActiveCanvasContext() {
  try {
    return localStorage.getItem(ACTIVE_CONTEXT_STORAGE_KEY) || BLANK_CANVAS_CONTEXT_KEY;
  } catch {
    return BLANK_CANVAS_CONTEXT_KEY;
  }
}

export function setActiveCanvasContext(contextKey) {
  const key = String(contextKey || BLANK_CANVAS_CONTEXT_KEY);
  localStorage.setItem(ACTIVE_CONTEXT_STORAGE_KEY, key);
  return key;
}
