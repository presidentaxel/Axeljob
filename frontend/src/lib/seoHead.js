/**
 * Meta robots pour routes SPA (même index.html que la home : le crawler exécute le JS).
 * Aligné sur public/*.html : login (noindex dans login.html en prod) + pages légales en noindex.
 */
const DEFAULT_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const NOINDEX_PATHS = new Set(['/login', '/mentions-legales', '/confidentialite', '/cgu']);

export function syncRobotsMeta(pathname) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', NOINDEX_PATHS.has(pathname) ? 'noindex, follow' : DEFAULT_ROBOTS);
}
