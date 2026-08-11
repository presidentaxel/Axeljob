/**
 * Formes vectorielles pour la section Éléments (sans texte).
 */
import { DEFAULT_SHAPE_COLOR, DEFAULT_SHAPE_FILL } from './canvasColorPalette.js';
import { PAGE_USABLE_WIDTH_MM } from './cvLayoutModelV3.js';

/** Entrées UI section Éléments (formes uniquement). */
export const ELEMENT_SHAPE_ITEMS = Object.freeze([
  { type: 'shape:rect', label: 'Rectangle' },
  { type: 'shape:frame', label: 'Cadre' },
  { type: 'shape:circle', label: 'Cercle' },
  { type: 'shape:ellipse', label: 'Ellipse' },
  { type: 'shape:triangle', label: 'Triangle' },
  { type: 'shape:diamond', label: 'Losange' },
  { type: 'shape:star', label: 'Étoile' },
  { type: 'shape:hexagon', label: 'Hexagone' },
  { type: 'shape:line', label: 'Trait' },
  { type: 'shape:arrow-right', label: 'Flèche →' },
  { type: 'shape:arrow-left', label: 'Flèche ←' },
  { type: 'shape:arrow-up', label: 'Flèche ↑' },
  { type: 'shape:arrow-down', label: 'Flèche ↓' },
  { type: 'shape:cross', label: 'Croix' },
  { type: 'shape:heart', label: 'Cœur' },
]);

const SHAPE_PRESETS = Object.freeze({
  'shape:rect': {
    type: 'shape:rect',
    w: 60,
    h: 24,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:frame': {
    type: 'shape:frame',
    w: 60,
    h: 40,
    style: { color: 'transparent', stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0.8 },
  },
  'shape:circle': {
    type: 'shape:circle',
    w: 28,
    h: 28,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:ellipse': {
    type: 'shape:ellipse',
    w: 48,
    h: 28,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:triangle': {
    type: 'shape:triangle',
    w: 32,
    h: 28,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:diamond': {
    type: 'shape:diamond',
    w: 28,
    h: 28,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:star': {
    type: 'shape:star',
    w: 32,
    h: 32,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:hexagon': {
    type: 'shape:hexagon',
    w: 32,
    h: 32,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
  'shape:line': {
    type: 'shape:line',
    w: PAGE_USABLE_WIDTH_MM,
    h: 0.6,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 0.6 },
  },
  'shape:arrow-right': {
    type: 'shape:arrow-right',
    w: 40,
    h: 12,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 1.2 },
  },
  'shape:arrow-left': {
    type: 'shape:arrow-left',
    w: 40,
    h: 12,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 1.2 },
  },
  'shape:arrow-up': {
    type: 'shape:arrow-up',
    w: 12,
    h: 40,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 1.2 },
  },
  'shape:arrow-down': {
    type: 'shape:arrow-down',
    w: 12,
    h: 40,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 1.2 },
  },
  'shape:cross': {
    type: 'shape:cross',
    w: 24,
    h: 24,
    style: { color: DEFAULT_SHAPE_COLOR, stroke_width: 1.4 },
  },
  'shape:heart': {
    type: 'shape:heart',
    w: 28,
    h: 28,
    style: { color: DEFAULT_SHAPE_FILL, stroke_color: DEFAULT_SHAPE_COLOR, stroke_width: 0 },
  },
});

/** Paths SVG (viewBox 0 0 100 100). */
export const SHAPE_SVG_PATHS = Object.freeze({
  'shape:rect': 'M0,0 H100 V100 H0 Z',
  'shape:frame': 'M0,0 H100 V100 H0 Z',
  'shape:circle': 'M50,50 m-50,0 a50,50 0 1,0 100,0 a50,50 0 1,0 -100,0',
  'shape:ellipse': 'M50,50 m-50,0 a50,30 0 1,0 100,0 a50,30 0 1,0 -100,0',
  'shape:triangle': 'M50,5 L95,95 L5,95 Z',
  'shape:diamond': 'M50,2 L98,50 L50,98 L2,50 Z',
  'shape:star': 'M50,2 L61,38 L98,38 L67,60 L78,96 L50,74 L22,96 L33,60 L2,38 L39,38 Z',
  'shape:hexagon': 'M50,2 L93,27 L93,73 L50,98 L7,73 L7,27 Z',
  'shape:line': 'M2,50 H98',
  'shape:arrow-right': 'M2,50 H72 M72,50 L55,32 M72,50 L55,68',
  'shape:arrow-left': 'M98,50 H28 M28,50 L45,32 M28,50 L45,68',
  'shape:arrow-up': 'M50,98 V28 M50,28 L32,45 M50,28 L68,45',
  'shape:arrow-down': 'M50,2 V72 M50,72 L32,55 M50,72 L68,55',
  'shape:cross': 'M50,10 V90 M10,50 H90',
  'shape:heart': 'M50,88 C20,62 2,42 2,26 C2,12 14,2 28,2 C38,2 46,8 50,16 C54,8 62,2 72,2 C86,2 98,12 98,26 C98,42 80,62 50,88 Z',
});

export const VECTOR_SHAPE_TYPES = new Set(Object.keys(SHAPE_SVG_PATHS));

export function isVectorShapeType(type) {
  return VECTOR_SHAPE_TYPES.has(type);
}

export function createShapeBlockPreset(type) {
  const preset = SHAPE_PRESETS[type];
  if (!preset) return null;
  return { ...preset, style: { ...preset.style } };
}
