/**
 * Entrée build Vite : charge l'app React sur /, /login et /app/*.
 * Sur / : landing React (menu burger, navigation) ; le HTML statique dans #root est remplacé au montage.
 * Sur /ats, /faq, etc. : pages statiques (public/*.html) ou index sans bundle si autre stratégie de déploiement.
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
const loadSpa = p === '/' || p === '/login' || p.indexOf('/app') === 0
if (loadSpa) {
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
