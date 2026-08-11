/**
 * Compresse une image pour stockage dans layout v3 (limite PUT /api/cv ~2 Mo).
 */

const DEFAULT_MAX_DIM = 1200;
const DEFAULT_MAX_BYTES = 160_000;
const DEFAULT_QUALITY = 0.82;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function encodeBlobWithQuality(img, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToJpegBlob(canvas, quality);
  if (!blob) throw new Error('Compression impossible');
  return blob;
}

async function loadImageFromFile(file) {
  const rawUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return loadImage(rawUrl);
}

/**
 * Compresse un fichier image → Blob JPEG (cible < maxBytes si possible).
 * Préféré pour upload Storage (AXE-40 : pas de data URL dans le layout).
 */
export async function compressImageFileToBlob(file, options = {}) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Fichier non image');
  }
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options.quality ?? DEFAULT_QUALITY;

  const img = await loadImageFromFile(file);
  let blob = await encodeBlobWithQuality(img, maxDim, quality);

  let attempts = 0;
  while (attempts < 6 && blob.size > maxBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await encodeBlobWithQuality(img, maxDim, quality);
    attempts += 1;
  }

  if (blob.size > maxBytes) {
    const smallerDim = Math.round(maxDim * 0.75);
    blob = await encodeBlobWithQuality(img, smallerDim, quality);
  }

  return blob;
}

/**
 * Compresse un fichier image → data URL JPEG (cible < maxBytes si possible).
 * @deprecated Préférer compressImageFileToBlob + uploadCanvasAsset pour le layout.
 */
export async function compressImageFile(file, options = {}) {
  const blob = await compressImageFileToBlob(file, options);
  return blobToDataUrl(blob);
}

/** Compresse une data URL → Blob JPEG (ré-upload d’historique legacy). */
export async function compressDataUrlToBlob(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('Data URL image attendue');
  }
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options.quality ?? DEFAULT_QUALITY;
  const img = await loadImage(dataUrl);
  let blob = await encodeBlobWithQuality(img, maxDim, quality);
  let attempts = 0;
  while (attempts < 6 && blob.size > maxBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await encodeBlobWithQuality(img, maxDim, quality);
    attempts += 1;
  }
  return blob;
}
