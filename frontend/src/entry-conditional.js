/**
 * Entrée build Vite : charge l'app React uniquement sur /app et /login.
 * Sur les autres routes (/, /ats, etc.) rien n'est importé, la landing statique reste affichée.
 */
const p = typeof window !== 'undefined' ? window.location.pathname : ''
if (p.indexOf('/app') === 0 || p === '/login') {
  import('./main.jsx')
}
