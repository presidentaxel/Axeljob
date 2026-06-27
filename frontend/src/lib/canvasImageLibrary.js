/**
 * Bibliothèque locale d’images importées pour le canvas (localStorage).
 */

import { listAllBlocks } from './cvLayoutModelV3.js';

const STORAGE_KEY = 'cv_canvas_user_images_v1';
const REMOVED_KEY = 'cv_canvas_user_images_removed_v1';
const MAX_ITEMS = 24;

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, Math.max(8, Math.floor(MAX_ITEMS / 2)))));
    } catch {
      /* ignore */
    }
  }
}

function readRemoved() {
  try {
    const raw = localStorage.getItem(REMOVED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeRemoved(set) {
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function addToRemovedSet(dataUrl) {
  if (!dataUrl) return;
  const removed = readRemoved();
  removed.add(dataUrl);
  writeRemoved(removed);
}

function removeFromRemovedSet(dataUrl) {
  if (!dataUrl) return;
  const removed = readRemoved();
  if (!removed.delete(dataUrl)) return;
  writeRemoved(removed);
}

export function listUserCanvasImages() {
  return readAll().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/**
 * Ajoute une image (data URL). Déduplique par contenu exact.
 */
export function addUserCanvasImage(dataUrl, meta = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  removeFromRemovedSet(dataUrl);
  const all = readAll();
  const existing = all.find((item) => item.dataUrl === dataUrl);
  if (existing) {
    const bumped = { ...existing, addedAt: Date.now(), label: meta.label || existing.label };
    writeAll([bumped, ...all.filter((i) => i.id !== existing.id)].slice(0, MAX_ITEMS));
    return bumped;
  }
  const entry = {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    label: meta.label || '',
    addedAt: Date.now(),
  };
  writeAll([entry, ...all].slice(0, MAX_ITEMS));
  return entry;
}

export function removeUserCanvasImage(id) {
  const all = readAll();
  const item = all.find((entry) => entry.id === id);
  if (item?.dataUrl) addToRemovedSet(item.dataUrl);
  writeAll(all.filter((entry) => entry.id !== id));
}

export function collectImageUrlsFromLayout(layout) {
  const urls = new Set();
  for (const block of listAllBlocks(layout)) {
    if (block?.type === 'image' && block.image_src) urls.add(block.image_src);
  }
  return [...urls];
}

export function syncUserCanvasImagesFromLayout(layout) {
  const removed = readRemoved();
  for (const dataUrl of collectImageUrlsFromLayout(layout)) {
    if (removed.has(dataUrl)) continue;
    addUserCanvasImage(dataUrl);
  }
}

export const CANVAS_IMAGE_DROP_MIME = 'application/x-cv-canvas-image';
