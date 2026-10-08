import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: sluAge },
  preview: { proxy: sluAge },
})
