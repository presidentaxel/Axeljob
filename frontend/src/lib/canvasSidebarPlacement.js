/**
 * Drag & drop de presets depuis la sidebar vers le canvas (AXE-33).
 *
 * Sérialisation JSON dans un type MIME dédié pour coexister avec
 * `CANVAS_IMAGE_DROP_MIME` (images).
 */

export const CANVAS_BLOCK_PRESET_MIME = 'application/x-cv-canvas-block-preset';

/**
 * Sérialise un preset de bloc pour dataTransfer.
 * @param {object|null|undefined} preset
 * @returns {string} JSON ou chaîne vide si invalide
 */
export function serializeBlockPreset(preset) {
  if (!preset || typeof preset !== 'object' || typeof preset.type !== 'string') {
    return '';
  }
  try {
    return JSON.stringify(preset);
  } catch {
    return '';
  }
}

/**
 * Parse un preset depuis dataTransfer.
 * @param {string|null|undefined} raw
 * @returns {object|null}
 */
export function parseBlockPreset(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Détermine si un DataTransfer contient un preset de bloc (types HTML5).
 * @param {DataTransfer | { types?: ArrayLike<string> } | null | undefined} dataTransfer
 * @returns {boolean}
 */
export function dataTransferHasBlockPreset(dataTransfer) {
  const types = dataTransfer?.types;
  if (!types) return false;
  if (typeof types.includes === 'function') {
    return types.includes(CANVAS_BLOCK_PRESET_MIME);
  }
  return Array.from(types).includes(CANVAS_BLOCK_PRESET_MIME);
}

/**
 * Calcule x/y pour centrer un preset sur un point (mm).
 * @param {object} preset
 * @param {number} xMm
 * @param {number} yMm
 * @returns {{ x: number, y: number, partial: object }}
 */
export function placementPartialAtPoint(preset, xMm, yMm) {
  const w = Number(preset?.w) > 0 ? Number(preset.w) : 20;
  const h = Number(preset?.h) > 0 ? Number(preset.h) : 10;
  const partial = { ...preset };
  delete partial.placementMode;
  return {
    x: Math.max(0, xMm - w / 2),
    y: Math.max(0, yMm - h / 2),
    partial: { ...partial, w, h },
  };
}
