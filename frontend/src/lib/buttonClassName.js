/**
 * Classes CSS canoniques des boutons — alignées sur docs/DESIGN-cohere.md.
 *
 * Un CTA primaire DOIT porter `button-primary` (jamais `btn-primary` seul).
 * Le chrome partagé est `button`. Les tailles sont des modifiers BEM (`button--sm`).
 *
 * Contrôles métier hors design system (`btn-add`, `btn-icon`, …) restent en `.btn`.
 */

export const BUTTON_VARIANTS = Object.freeze({
  primary: 'button-primary',
  secondary: 'button-secondary',
  outline: 'button-pill-outline',
  tertiary: 'button-tertiary',
  ghost: 'button-ghost',
  success: 'button-success',
});

export const BUTTON_SIZES = Object.freeze({
  sm: 'button--sm',
  lg: 'button--lg',
});

/**
 * Compose la className d’un bouton design-system.
 *
 * @param {{ variant?: keyof typeof BUTTON_VARIANTS, size?: keyof typeof BUTTON_SIZES, className?: string }} [options]
 * @returns {string}
 */
export function buttonClassName({ variant = 'primary', size, className = '' } = {}) {
  const variantClass = BUTTON_VARIANTS[variant];
  if (!variantClass) {
    throw new Error(`Unknown button variant: ${variant}`);
  }
  let sizeClass = '';
  if (size) {
    sizeClass = BUTTON_SIZES[size];
    if (!sizeClass) {
      throw new Error(`Unknown button size: ${size}`);
    }
  }
  return ['button', variantClass, sizeClass, className].filter(Boolean).join(' ');
}
