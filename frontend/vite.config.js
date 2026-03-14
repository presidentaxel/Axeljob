import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Rendre le CSS principal non bloquant après build (closeBundle) pour améliorer le LCP. */
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
