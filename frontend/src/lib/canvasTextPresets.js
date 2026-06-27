/** Presets texte pour la section Texte. */
import { PAGE_USABLE_WIDTH_MM } from './cvLayoutModelV3.js';
import { DEFAULT_TEXT_COLOR } from './canvasColorPalette.js';

export const TEXT_PRESET_ITEMS = Object.freeze([
  { type: 'text-box', label: 'Zone de texte', placementMode: 'draw-rect' },
  { type: 'title', label: 'Titre' },
  { type: 'subtitle', label: 'Sous-titre' },
  { type: 'text', label: 'Paragraphe' },
]);

const TEXT_PRESETS_BY_TYPE = Object.freeze({
  title: {
    type: 'title',
    content: 'Titre',
    w: PAGE_USABLE_WIDTH_MM,
    h: 12,
    style: { font_size: 18, align: 'left', color: DEFAULT_TEXT_COLOR, bold: true },
  },
  subtitle: {
    type: 'title',
    content: 'Sous-titre',
    w: PAGE_USABLE_WIDTH_MM,
    h: 10,
    style: { font_size: 13, align: 'left', color: DEFAULT_TEXT_COLOR },
  },
  text: {
    type: 'text',
    content: 'Paragraphe',
    w: 120,
    h: 14,
    style: { font_size: 10, align: 'left', color: DEFAULT_TEXT_COLOR },
  },
  'text-box': {
    type: 'text',
    content: '',
    w: 80,
    h: 24,
    style: { font_size: 10, align: 'left', color: DEFAULT_TEXT_COLOR },
    placementMode: 'draw-rect',
  },
});

export function createTextBlockPreset(type) {
  const preset = TEXT_PRESETS_BY_TYPE[type];
  if (!preset) return null;
  return { ...preset, style: { ...preset.style } };
}
