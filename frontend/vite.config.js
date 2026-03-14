import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Rendre le CSS des chunks non bloquant après build (LCP). Le CSS principal reste bloquant pour que polices et boutons soient corrects en prod. */
function cssNonBlockingPlugin() {
  let outDir = 'dist'
  return {
    name: 'css-non-blocking',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const indexPath = join(process.cwd(), outDir, 'index.html')
      try {
        let html = readFileSync(indexPath, 'utf-8')
        html = html.replace(
          /<link([^>]*rel="stylesheet"[^>]*)href="([^"]+\.css)"([^>]*)>/gi,
          (match, before, href, after) => {
            if (match.includes('media=') || match.includes('fonts.googleapis')) return match
            // Ne pas différer le CSS principal (index-*.css) : boutons + police doivent être appliqués au premier paint
            if (/\/index-[^/]+\.css$/i.test(href)) return match
            return `<link${before}href="${href}" media="print" onload="this.media='all'"${after}>`
          }
        )
        writeFileSync(indexPath, html)
      } catch (_) {}
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cssNonBlockingPlugin()],
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
