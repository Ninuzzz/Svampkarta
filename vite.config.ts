import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// SLU:s server saknar CORS – skogsålderskartan hämtas via samma domän.
// I produktion gör Netlify samma sak (se public/_redirects).
const sluAge = {
  '/slu-age': {
    target: 'https://gis.slu.se',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/slu-age/, '/data/skogsdatalabbet/SLU_skogsalder_2025/data'),
  },
}

/**
 * Bygger dist/sw.js från src/sw.js med en lista över allt appen behöver
 * offline (js, css, ikoner, artguidens bilder). Versionen är en hash av
 * filerna, så en ny build ersätter den gamla cachen.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'mycel-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    writeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name)
          if (f.isDirectory()) walk(full)
          else files.push('/' + path.relative(outDir, full).split(path.sep).join('/'))
        }
      }
      walk(outDir)
      const precache = files
        .filter((f) => /^\/(assets|guide|icons)\//.test(f) || ['/index.html', '/favicon.svg', '/manifest.webmanifest', '/img/hero-1000.webp'].includes(f))
        .filter((f) => !f.endsWith('.map'))
        .sort()
      const hash = createHash('sha256')
      for (const f of precache) hash.update(f).update(fs.readFileSync(path.join(outDir, f)))
      const sw = fs
        .readFileSync('src/sw.js', 'utf8')
        .replace("const VERSION = '__VERSION__'", `const VERSION = '${hash.digest('hex').slice(0, 12)}'`)
        // Cloudflare Pages skickar /index.html vidare till / – en vidarebefordrad
        // sida får inte användas som svar på en sidladdning, så appen sparas som /
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(precache.map((f) => (f === '/index.html' ? '/' : f)))}`)
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { proxy: sluAge },
  preview: { proxy: sluAge },
})
