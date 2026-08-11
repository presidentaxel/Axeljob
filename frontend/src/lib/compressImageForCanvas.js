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

async function encodeWithQuality(img, maxDim, quality) {
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
  return blobToDataUrl(blob);
}

/**
 * Compresse un fichier image → data URL JPEG (cible < maxBytes si possible).
 */
export async function compressImageFile(file, options = {}) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Fichier non image');
  }
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options.quality ?? DEFAULT_QUALITY;

  const rawUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await loadImage(rawUrl);
  let dataUrl = await encodeWithQuality(img, maxDim, quality);

  let attempts = 0;
  while (attempts < 6 && dataUrl.length > maxBytes * 1.37 && quality > 0.45) {
    quality -= 0.08;
    dataUrl = await encodeWithQuality(img, maxDim, quality);
    attempts += 1;
  }

  if (dataUrl.length > maxBytes * 1.37) {
    const smallerDim = Math.round(maxDim * 0.75);
    dataUrl = await encodeWithQuality(img, smallerDim, quality);
  }

  return dataUrl;
}
