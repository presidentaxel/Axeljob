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
  onClick,
  tabIndex,
  ...props
}) {
  const isNativeButton = Component === 'button';
  const isDisabled = Boolean(disabled || loading);
  const resolvedType = isNativeButton ? (type ?? 'button') : type;

  const handleClick = (event) => {
    if (isDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <Component
      {...props}
      className={buttonClassName({
        variant,
        size,
        tone,
        iconOnly,
        fullWidth,
        className,
      })}
      type={resolvedType}
      disabled={isNativeButton ? (isDisabled || undefined) : undefined}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      tabIndex={isDisabled && !isNativeButton ? -1 : tabIndex}
      onClick={handleClick}
    >
      {children}
    </Component>
  );
}
