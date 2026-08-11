/**
 * Upload d’images canvas hors data URL (AXE-40).
 */

import { apiPostFile } from '../api.js';
import {
  compressDataUrlToBlob,
  compressImageFileToBlob,
} from './compressImageForCanvas.js';

function isHttpOrAssetUrl(url) {
  return (
    typeof url === 'string' &&
    (url.startsWith('https://') ||
      url.startsWith('http://') ||
      url.startsWith('assets/'))
  );
}

async function postJpegBlob(blob, filename = 'canvas.jpg') {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const data = await apiPostFile('/api/cv/upload-canvas-asset', file);
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url) throw new Error('Upload canvas sans URL');
  return url;
}

/** Compresse + upload un File → URL Storage / assets. */
export async function uploadCanvasImageFile(file) {
  const blob = await compressImageFileToBlob(file);
  return postJpegBlob(blob, (file?.name || 'canvas').replace(/\.[^.]+$/, '') + '.jpg');
}

/**
 * Résout une source image pour le layout : URL déjà safe, sinon upload data URL.
 */
export async function resolveCanvasImageSrcForLayout(src) {
  if (isHttpOrAssetUrl(src)) return src;
  if (typeof src === 'string' && src.startsWith('data:image/')) {
    const blob = await compressDataUrlToBlob(src);
    return postJpegBlob(blob);
  }
  throw new Error('Source image canvas non supportée');
}
