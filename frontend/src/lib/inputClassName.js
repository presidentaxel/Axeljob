/**
 * Classes CSS du champ texte design-system.
 */
export function inputClassName({ invalid = false, className = '' } = {}) {
  return ['ds-input', invalid ? 'ds-input--invalid' : '', className].filter(Boolean).join(' ');
}
