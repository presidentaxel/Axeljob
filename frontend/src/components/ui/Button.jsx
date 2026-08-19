import { buttonClassName } from '../../lib/buttonClassName.js';

/**
 * Bouton design-system (variant × size × tone + états CSS).
 *
 * @param {object} props
 * @param {'primary' | 'secondary' | 'tertiary' | 'ghost' | 'link' | 'danger' | 'success'} [props.variant]
 * @param {'sm' | 'md' | 'lg'} [props.size]
 * @param {'default' | 'inverse'} [props.tone]
 * @param {boolean} [props.iconOnly]
 * @param {boolean} [props.fullWidth]
 * @param {boolean} [props.loading]
 * @param {string} [props.className]
 * @param {React.ElementType} [props.as]
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  tone = 'default',
  iconOnly = false,
  fullWidth = false,
  loading = false,
  className = '',
  as: Component = 'button',
  type,
  disabled,
  children,
  ...props
}) {
  const resolvedType = Component === 'button' ? (type ?? 'button') : type;
  return (
    <Component
      className={buttonClassName({
        variant,
        size,
        tone,
        iconOnly,
        fullWidth,
        className,
      })}
      type={resolvedType}
      disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </Component>
  );
}
