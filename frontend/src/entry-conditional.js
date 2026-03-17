/**
 * Entrée build Vite : charge l'app React uniquement sur /app et /login.
 * Sur les autres routes (/, /ats, etc.) rien n'est importé, la landing statique reste affichée.
 */
function isChunkLoadError(err) {
  const msg = err?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    (err?.name === 'TypeError' && msg.includes('fetch'))
  )
}

const p = typeof window !== 'undefined' ? window.location.pathname : ''
if (p.indexOf('/app') === 0 || p === '/login') {
  import('./main.jsx').catch((err) => {
    if (typeof window !== 'undefined' && isChunkLoadError(err)) {
      if (!sessionStorage.getItem('chunkErrorReload')) {
        sessionStorage.setItem('chunkErrorReload', '1')
        window.location.reload()
        return
      }
    }
    throw err
  })
}
