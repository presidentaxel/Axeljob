/**
 * Bibliothèque locale d’images importées pour le canvas (localStorage).
 */

import { listAllBlocks } from './cvLayoutModelV3.js';

const STORAGE_KEY = 'cv_canvas_user_images_v1';
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
    // quota — on garde les plus récentes
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, Math.max(8, Math.floor(MAX_ITEMS / 2)))));
    } catch {
      /* ignore */
    }
  }
}

export function listUserCanvasImages() {
  return readAll().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/**
 * Ajoute une image (data URL). Déduplique par contenu exact.
 */
export function addUserCanvasImage(dataUrl, meta = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
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
  writeAll(readAll().filter((item) => item.id !== id));
}

export function collectImageUrlsFromLayout(layout) {
  const urls = new Set();
  for (const block of listAllBlocks(layout)) {
    if (block?.type === 'image' && block.image_src) urls.add(block.image_src);
  }
  return [...urls];
}

export function syncUserCanvasImagesFromLayout(layout) {
  const urls = collectImageUrlsFromLayout(layout);
  let changed = false;
  for (const dataUrl of urls) {
    addUserCanvasImage(dataUrl);
    changed = true;
  }
  return changed;
}

export const CANVAS_IMAGE_DROP_MIME = 'application/x-cv-canvas-image';
