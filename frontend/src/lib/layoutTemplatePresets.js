/**
 * Layouts canvas v3 - copie structurelle des templates HTML.
 */
import { buildTemplateBlocks, parseCanvasTheme } from './canvasTemplateSpecs.js';
import { createBlankLayoutV3, createStarterLayoutV3, sanitizeLayoutV3 } from './cvLayoutModelV3.js';

/**
 * @param {object} template
 * @param {Record<string, unknown>|null|undefined} [optionValues] Stable template_options live
 */
export function createCanvasLayoutForTemplate(template, optionValues = null) {
  if (!template?.id) return createStarterLayoutV3();
  const blocks = buildTemplateBlocks(template, optionValues);
  if (!blocks.length) return createStarterLayoutV3();
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...parseCanvasTheme(template, optionValues) };
  // Répliques mono-colonne : géométrie mm calquée Stable — ne pas ré-empiler au reflow ATS.
  // `replica_cascade` : autorise le reflow colonne après auto-height (sans toucher lock_geometry).
  if (
    template.id === 'minimal'
    || template.id === 'elegant'
    || template.id === 'classic'
    || template.id === 'bold'
    || template.id === 'modern'
  ) {
    layout.freeform = true;
    layout.replica_cascade = true;
  }
  return sanitizeLayoutV3(layout);
}

export function createCanvasLayoutBlank() {
  return createBlankLayoutV3();
}
