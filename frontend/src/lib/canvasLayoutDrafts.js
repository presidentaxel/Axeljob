import { migrateLayoutToV3 } from './cvLayoutModelV3.js';

const DRAFTS_STORAGE_KEY = 'cv_canvas_layout_drafts_v1';
const PREFS_STORAGE_KEY = 'cv_canvas_layout_draft_prefs_v1';
const ACTIVE_CONTEXT_STORAGE_KEY = 'cv_canvas_layout_active_context_v1';

export const BLANK_CANVAS_CONTEXT_KEY = 'blank';
/** Brouillon dédié au dernier import CV (ne remplace pas les brouillons template:*). */
export const IMPORTED_CANVAS_CONTEXT_KEY = 'imported';

export function templateCanvasContextKey(templateId) {
  const id = String(templateId || '').trim();
  return id ? `template:${id}` : BLANK_CANVAS_CONTEXT_KEY;
}

export function canvasContextLabel(contextKey, templatesList = []) {
  if (contextKey === BLANK_CANVAS_CONTEXT_KEY) return 'Page blanche';
  if (contextKey === IMPORTED_CANVAS_CONTEXT_KEY) return 'CV importé';
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
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // QuotaExceededError ou localStorage indisponible (mode privé) : on ne
    // doit JAMAIS laisser remonter l'exception (les drafts sont un cache
    // best-effort, la source de vérité est le backend).
    return false;
  }
}

/**
 * Les polices embarquées d'un PDF importé sont des data-URLs base64 lourdes
 * (souvent plusieurs centaines de Ko). On ne les persiste PAS dans les drafts
 * localStorage (quota ~5 Mo vite atteint) : le layout actif est rechargé
 * depuis le backend avec ses polices, le draft local n'est qu'un cache de
 * repositionnement.
 */
function stripHeavyFieldsForLocal(layout) {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.fonts) || !layout.fonts.length) {
    return layout;
  }
  const { fonts: _fonts, ...rest } = layout;
  return rest;
}

/** Conserve le contexte courant + les N drafts les plus récents (purge le reste). */
function pruneDrafts(drafts, keepKey, keepRecent = 2) {
  const entries = Object.values(drafts).filter((e) => e?.contextKey);
  const sorted = entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const kept = {};
  if (drafts[keepKey]) kept[keepKey] = drafts[keepKey];
  for (const entry of sorted) {
    if (Object.keys(kept).length >= keepRecent + 1) break;
    kept[entry.contextKey] = entry;
  }
  return kept;
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
    layout: stripHeavyFieldsForLocal(layout),
    label: meta.label || drafts[key]?.label || key,
    updatedAt: Date.now(),
  };
  drafts[key] = entry;
  if (!writeJson(DRAFTS_STORAGE_KEY, drafts)) {
    // Quota dépassé : on purge les drafts les plus anciens et on retente une
    // fois avec uniquement le contexte courant + les plus récents.
    writeJson(DRAFTS_STORAGE_KEY, pruneDrafts(drafts, key));
  }
  return entry;
}

/** Supprime le brouillon local d’un contexte (reset Page blanche AXE-28). */
export function clearCanvasDraft(contextKey) {
  const key = String(contextKey || BLANK_CANVAS_CONTEXT_KEY);
  const drafts = readJson(DRAFTS_STORAGE_KEY, {});
  if (!(key in drafts)) return false;
  delete drafts[key];
  writeJson(DRAFTS_STORAGE_KEY, drafts);
  return true;
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
