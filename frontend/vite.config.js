import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

/** Sur les pages publiques (/ats, /faq, etc.) servir le HTML statique au lieu de index.html (SPA). */
const STATIC_ROUTES = ['/ats', '/faq', '/guide-cv', '/modeles-cv', '/erreurs-cv', '/cv-par-metier', '/cv-adapte-chaque-offre', '/mentions-legales', '/confidentialite', '/cgu']

function staticPagesPlugin() {
  return {
    name: 'static-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || !req.url) return next()
        const path = req.url.split('?')[0].replace(/%24/g, '$')
        if (!STATIC_ROUTES.includes(path)) return next()
        const file = path.slice(1) + '.html'
        const filePath = join(process.cwd(), 'public', file)
        if (!existsSync(filePath)) return next()
        try {
          const html = readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (_) {
          next()
        }
      })
    },
  }
}

/** Rendre le CSS des chunks non bloquant après build (LCP). Le CSS principal reste bloquant. */
function cssNonBlockingPlugin() {
  let outDir = 'dist'
  return {
    name: 'css-non-blocking',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const indexPath = join(process.cwd(), outDir, 'index.html')
      const assetsDir = join(process.cwd(), outDir, 'assets')
      try {
        let html = readFileSync(indexPath, 'utf-8')
        html = html.replace(
          /<link([^>]*rel="stylesheet"[^>]*)href="([^"]+\.css)"([^>]*)>/gi,
          (match, before, href, after) => {
            if (match.includes('media=') || match.includes('fonts.googleapis')) return match
            if (/\/index-[^/]+\.css$/i.test(href) || /landing-static\.css/i.test(href)) return match
            return `<link${before}href="${href}" media="print" onload="this.media='all'"${after}>`
          }
        )
        // Remplir __APP_CSS_FILENAME__ pour que /login et /app chargent le CSS de l'app
        let appCssFilename = ''
        if (existsSync(assetsDir)) {
          const files = readdirSync(assetsDir)
          const mainCss = files.find((f) => /^main-.+\.css$/.test(f)) || files.find((f) => /^index-.+\.css$/.test(f))
          const anyCss = files.find((f) => /\.css$/.test(f))
          if (mainCss) appCssFilename = mainCss
          else if (anyCss) appCssFilename = anyCss
        }
        html = html.replace(/__APP_CSS_FILENAME__/g, appCssFilename)
        writeFileSync(indexPath, html)
      } catch (_) {}
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), staticPagesPlugin(), cssNonBlockingPlugin()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Nom fixe pour l'entrée : les pages statiques (public/*.html) chargent ce fichier en prod
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
