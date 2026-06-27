/**
 * Effets visuels bloc canvas (ombre, contour, néon, …) → CSS inline.
 */

export const CANVAS_BLOCK_EFFECTS = Object.freeze([
  { id: 'none', label: 'Aucun' },
  { id: 'shadow', label: 'Ombre portée' },
  { id: 'glow', label: 'Brillance' },
  { id: 'echo', label: 'Écho' },
  { id: 'border', label: 'Bordure' },
  { id: 'bevel', label: 'Biseautage' },
  { id: 'outline', label: 'Contour' },
  { id: 'neon', label: 'Néon' },
  { id: 'glitch', label: 'Glitch' },
]);

export function blockEffectToCss(effectId, style = {}) {
  const color = style.color || style.effect_color || '#17171c';
  const accent = style.effect_color || color;
  switch (effectId) {
    case 'shadow':
      return { boxShadow: '0 4px 14px rgba(23, 23, 28, 0.22)' };
    case 'glow':
      return { boxShadow: `0 0 18px ${accent}88` };
    case 'echo':
      return { boxShadow: `4px 4px 0 ${accent}55, 8px 8px 0 ${accent}33` };
    case 'border':
      return { border: `2px solid ${accent}` };
    case 'bevel':
      return {
        boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.45), inset -2px -2px 0 rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.08)',
      };
    case 'outline':
      return { outline: `2px solid ${accent}`, outlineOffset: '2px' };
    case 'neon':
      return {
        boxShadow: `0 0 6px ${accent}, 0 0 14px ${accent}aa, 0 0 28px ${accent}66`,
      };
    case 'glitch':
      return {
        textShadow: `2px 0 #ff7759, -2px 0 #4c6ee6`,
        filter: 'contrast(1.05)',
      };
    default:
      return {};
  }
}
