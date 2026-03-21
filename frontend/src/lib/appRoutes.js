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
};

/**
 * Section logique pour effets (fetch, tracking) - alignée sur l’URL.
 */
export function getViewFromPathname(pathname) {
  if (!pathname) return 'cv';
  if (pathname === `${APP_BASE}/cv` || pathname.startsWith(`${APP_BASE}/cv`)) return 'cv';
  if (pathname === `${APP_BASE}/postule` || pathname.startsWith(`${APP_BASE}/postule`)) return 'candidatures';
  if (pathname === `${APP_BASE}/profil` || pathname.startsWith(`${APP_BASE}/profil`)) return 'profil';
  if (pathname === `${APP_BASE}/linkedin` || pathname.startsWith(`${APP_BASE}/linkedin`)) return 'profil';
  if (pathname === `${APP_BASE}/support` || pathname.startsWith(`${APP_BASE}/support`)) return 'support';
  return 'cv';
}
