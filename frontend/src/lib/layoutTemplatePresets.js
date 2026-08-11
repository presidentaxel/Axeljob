/**
 * Layouts canvas v3 - copie structurelle des templates HTML.
 */
import { buildTemplateBlocks, parseCanvasTheme } from './canvasTemplateSpecs.js';
import { createBlankLayoutV3, createStarterLayoutV3, sanitizeLayoutV3 } from './cvLayoutModelV3.js';

export function createCanvasLayoutForTemplate(template) {
  if (!template?.id) return createStarterLayoutV3();
  const blocks = buildTemplateBlocks(template);
  if (!blocks.length) return createStarterLayoutV3();
  const layout = createStarterLayoutV3();
  layout.pages[0].blocks = blocks;
  layout.theme = { ...layout.theme, ...parseCanvasTheme(template) };
  return sanitizeLayoutV3(layout);
}

export function createCanvasLayoutBlank() {
  return createBlankLayoutV3();
}
