/**
 * Classes CSS du bouton — axes séparés (docs/design-system.md).
 *
 * Cible : ds-button ds-button--primary ds-button--md
 * Alias : button button-primary (transition).
 */

export const BUTTON_VARIANTS = Object.freeze({
  primary: 'ds-button--primary',
  secondary: 'ds-button--secondary',
  tertiary: 'ds-button--tertiary',
  ghost: 'ds-button--ghost',
  link: 'ds-button--link',
  danger: 'ds-button--danger',
  success: 'ds-button--success',
});

export const BUTTON_SIZES = Object.freeze({
  sm: 'ds-button--sm',
  md: 'ds-button--md',
  lg: 'ds-button--lg',
});

export const BUTTON_TONES = Object.freeze({
  default: '',
  inverse: 'ds-button--inverse',
});

const LEGACY_VARIANT = Object.freeze({
  primary: 'button-primary',
  secondary: 'button-secondary',
  tertiary: 'button-tertiary',
  ghost: 'button-ghost',
  link: '',
  danger: '',
  success: 'button-success',
});

const LEGACY_SIZE = Object.freeze({
  sm: 'button--sm',
  md: '',
  lg: 'button--lg',
});

/**
 * @param {{
 *   variant?: keyof typeof BUTTON_VARIANTS,
 *   size?: keyof typeof BUTTON_SIZES,
 *   tone?: keyof typeof BUTTON_TONES,
 *   iconOnly?: boolean,
 *   fullWidth?: boolean,
 *   className?: string,
 * }} [options]
 * @returns {string}
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  tone = 'default',
  iconOnly = false,
  fullWidth = false,
  className = '',
} = {}) {
  const variantClass = BUTTON_VARIANTS[variant];
  if (!variantClass) {
    throw new Error(`Unknown button variant: ${variant}`);
  }
  const sizeClass = BUTTON_SIZES[size];
  if (!sizeClass) {
    throw new Error(`Unknown button size: ${size}`);
  }
  if (!(tone in BUTTON_TONES)) {
    throw new Error(`Unknown button tone: ${tone}`);
  }
  return [
    'ds-button',
    variantClass,
    sizeClass,
    BUTTON_TONES[tone],
    iconOnly ? 'ds-button--icon-only' : '',
    fullWidth ? 'ds-button--full-width' : '',
    'button',
    LEGACY_VARIANT[variant],
    LEGACY_SIZE[size],
    className,
  ].filter(Boolean).join(' ');
}
