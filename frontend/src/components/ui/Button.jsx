import { buttonClassName } from '../../lib/buttonClassName.js';

/**
 * Bouton design-system. Toujours émet `button` + `button-primary` (ou autre variant).
 *
 * @param {object} props
 * @param {'primary' | 'secondary' | 'outline' | 'tertiary' | 'ghost' | 'success'} [props.variant]
 * @param {'sm' | 'lg'} [props.size]
 * @param {string} [props.className]
 * @param {React.ElementType} [props.as]
 */
export default function Button({
  variant = 'primary',
  size,
  className = '',
  as: Component = 'button',
  type,
  children,
  ...props
}) {
  const resolvedType = Component === 'button' ? (type ?? 'button') : type;
  return (
    <Component
      className={buttonClassName({ variant, size, className })}
      type={resolvedType}
      {...props}
    >
      {children}
    </Component>
  );
}
