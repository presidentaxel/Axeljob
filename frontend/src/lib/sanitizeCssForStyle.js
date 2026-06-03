/**
 * Réduit le risque d’échappement depuis un bloc <style> (CSS utilisateur / template perso).
 * Aligné sur backend/css_sanitize.py (mêmes motifs).
 */
export function sanitizeCssForStyleTag(css) {
  if (css == null || typeof css !== 'string') return '';
  // NUL ASCII : évite no-control-regex (équivalent à /\u0000/g).
  let s = css.split('\0').join('\ufffd');
  const strip = (pattern) => {
    let prev;
    do {
      prev = s;
      s = s.replace(pattern, '');
    } while (s !== prev);
  };
  strip(/<\s*\/\s*style\b/gi);
  strip(/<\s*script\b/gi);
  strip(/<\s*\/\s*script\b/gi);
  return s;
}
