/**
 * Chemins workspace authentifié (/app/*).
 * Les sous-routes réelles sont déclarées dans App.jsx (React Router).
 */
export const APP_BASE = '/app';

export const APP_ROUTES = {
  cv: `${APP_BASE}/cv`,
  postule: `${APP_BASE}/postule`,
  profil: `${APP_BASE}/profil`,
  linkedin: `${APP_BASE}/linkedin`,
  support: `${APP_BASE}/support`,
  monitoring: `${APP_BASE}/monitoring`,
};

export const APP_DEFAULT_ROUTE = APP_ROUTES.cv;

export function isKnownAppPathname(pathname) {
  if (!pathname) return false;
  if (pathname === APP_BASE || pathname === `${APP_BASE}/`) return true;
  return Object.values(APP_ROUTES).some((route) => pathname.startsWith(route));
}

/**
 * Section logique pour effets (fetch, tracking) - alignée sur l’URL.
 */
export function getViewFromPathname(pathname) {
  if (!pathname) return 'cv';
  if (pathname.startsWith(APP_ROUTES.cv)) return 'cv';
  if (pathname.startsWith(APP_ROUTES.postule)) return 'candidatures';
  if (pathname.startsWith(APP_ROUTES.profil)) return 'profil';
  if (pathname.startsWith(APP_ROUTES.linkedin)) return 'profil';
  if (pathname.startsWith(APP_ROUTES.support)) return 'support';
  if (pathname.startsWith(APP_ROUTES.monitoring)) return 'monitoring';
  return 'cv';
}
