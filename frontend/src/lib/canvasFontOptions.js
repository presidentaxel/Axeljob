/** Polices disponibles dans la toolbar canvas (alignées sur les templates CV). */
export const CANVAS_FONT_FAMILIES = Object.freeze([
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
  { value: 'Merriweather, serif', label: 'Merriweather' },
  { value: "'Playfair Display', serif", label: 'Playfair Display' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Raleway, sans-serif', label: 'Raleway' },
  { value: "'Work Sans', sans-serif", label: 'Work Sans' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
]);

const FONT_STACK_BY_NAME = Object.freeze({
  Inter: 'Inter, sans-serif',
  'Plus Jakarta Sans': "'Plus Jakarta Sans', sans-serif",
  Georgia: 'Georgia, serif',
  'Open Sans': "'Open Sans', sans-serif",
  Lato: 'Lato, sans-serif',
  Roboto: 'Roboto, sans-serif',
});

export function fontStackFromTemplateOption(name) {
  if (!name) return 'Inter, sans-serif';
  return FONT_STACK_BY_NAME[name] || `${name}, sans-serif`;
}
