import { inputClassName } from '../../lib/inputClassName.js';

/**
 * Champ texte design-system (états hover / focus / invalid / disabled).
 */
export default function Input({
  invalid = false,
  className = '',
  disabled,
  ...props
}) {
  return (
    <input
      {...props}
      className={inputClassName({ invalid, className })}
      aria-invalid={invalid || undefined}
      disabled={disabled}
    />
  );
}
