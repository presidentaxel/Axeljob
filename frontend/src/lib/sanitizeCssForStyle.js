/**
 * Réduit le risque d’échappement depuis un bloc <style> (CSS utilisateur / template perso).
 * Aligné sur backend/css_sanitize.py (mêmes motifs).
 */
export function sanitizeCssForStyleTag(css) {
  if (css == null || typeof css !== 'string') return '';
  // NUL ASCII : évite no-control-regex (équivalent à /\u0000/g).
  let s = css.split('\0').join('\ufffd');
  s = s.replace(/<\s*\/\s*style\b/gi, '');
  s = s.replace(/<\s*script\b/gi, '');
  s = s.replace(/<\s*\/\s*script\b/gi, '');
  return s;
}
