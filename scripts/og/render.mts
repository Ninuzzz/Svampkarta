/**
 * Delningsbild (Open Graph, 1200 × 630) – visas när länken delas på t.ex.
 * Facebook, Messenger, LinkedIn och i sms. Ritas med appens egna logotyp,
 * typsnitt, foto och artikoner.
 *
 *   node scripts/og/render.mts            → public/og.jpg (vald variant)
 *   node scripts/og/render.mts alla <mapp> → alla varianter som PNG i <mapp>
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { speciesSvg } from '../../src/analysis/icons.ts'
import type { SpeciesId } from '../../src/analysis/species.ts'

const ROOT = new URL('../../', import.meta.url)
const read = (p: string) => fs.readFileSync(new URL(p, ROOT))
const dataUri = (p: string, type: string) => `data:${type};base64,${read(p).toString('base64')}`

const FONT = dataUri('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', 'font/woff2')
const FONT_EXT = dataUri('node_modules/@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2', 'font/woff2')
const PHOTO = dataUri('public/img/hero-2000.webp', 'image/webp')
const LOGO = read('public/favicon.svg').toString().replace('<svg ', '<svg width="100%" height="100%" ')

const W = 1200, H = 630
const base = `
  @font-face { font-family: Figtree; src: url(${FONT}) format('woff2'); font-weight: 300 900; unicode-range: U+0000-00FF, U+2013, U+2014, U+2019, U+201C, U+201D, U+2026; }
  @font-face { font-family: Figtree; src: url(${FONT_EXT}) format('woff2'); font-weight: 300 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: Figtree, sans-serif; -webkit-font-smoothing: antialiased; }
  .logo { width: 72px; height: 72px; border-radius: 18px; box-shadow: 0 14px 30px -14px rgb(10 20 0 / .7); overflow: hidden; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand b { font-size: 44px; font-weight: 800; letter-spacing: -0.02em; }
  .pill { display: inline-flex; align-items: center; gap: 10px; padding: 7px 18px 7px 7px; border-radius: 999px;
          background: rgb(255 251 235 / .92); box-shadow: 0 16px 34px -16px rgb(10 20 0 / .55); font-weight: 800; font-size: 25px; color: #2D4600; }
  .pill i { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 999px; background: #fff; }
  .pill em { font-style: normal; color: #c2410c; }
  .pill small { font-size: 17px; font-weight: 700; color: #5c6b3a; }
`
const pill = (id: SpeciesId, name: string, pct: number) => `<span class="pill"><i>${speciesSvg(id, 34)}</i><small>${name}</small><em>${pct} %</em></span>`
const icons = (ids: SpeciesId[], size: number) =>
  ids.map((id) => `<i style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;background:#FFFBEB;box-shadow:0 0 0 4px #2D4600">${speciesSvg(id, size * 0.7)}</i>`).join('')

const VARIANTS: Record<string, string> = {
  // 1. Skogsfoto med mörk ton åt vänster, rubrik och "chans"-etiketter som på kartan
  foto: `<style>${base}
    body { background: #1b2a00 url(${PHOTO}) center 58% / cover; color: #FFFBEB; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(20 30 0 / .92) 0%, rgb(20 30 0 / .78) 42%, rgb(20 30 0 / .15) 75%, rgb(20 30 0 / 0) 100%); }
    .text { position: absolute; left: 72px; top: 64px; width: 640px; }
    h1 { margin-top: 56px; font-size: 74px; line-height: 1.02; font-weight: 800; letter-spacing: -0.03em; }
    h1 span { color: #F2B124; }
    p { margin-top: 24px; font-size: 27px; line-height: 1.4; color: rgb(255 251 235 / .88); }
    .spots { position: absolute; right: 70px; top: 112px; display: flex; flex-direction: column; align-items: flex-end; gap: 22px; }
    .spots .pill:nth-child(2) { margin-right: 70px; }
    .foot { position: absolute; left: 72px; bottom: 54px; font-size: 22px; font-weight: 700; color: rgb(255 251 235 / .7); letter-spacing: .01em; }
  </style>
  <div class="shade"></div>
  <div class="text">
    <div class="brand"><div class="logo">${LOGO}</div><b>Mycel</b></div>
    <h1>Hitta skogens <span>guldställen</span></h1>
    <p>Kartan visar var chansen är störst att hitta svamp och bär – utifrån skog, mark, terräng och väder.</p>
  </div>
  <div class="spots">${pill('kantarell', 'Kantarell', 64)}${pill('trattkantarell', 'Trattkantarell', 58)}${pill('blabar', 'Blåbär', 47)}</div>
  <div class="foot">Gratis · Inga konton · Fungerar utan täckning</div>`,

  // 2. Ljus och lugn: benvit bakgrund, stiliserad karta med chansfläckar
  karta: `<style>${base}
    body { background: #FFFBEB; color: #1f2b05; }
    .text { position: absolute; left: 72px; top: 72px; width: 560px; }
    .brand b { color: #2D4600; }
    h1 { margin-top: 52px; font-size: 68px; line-height: 1.03; font-weight: 800; letter-spacing: -0.03em; color: #2D4600; }
    h1 span { background: linear-gradient(transparent 62%, #F2B124 62%, #F2B124 88%, transparent 88%); }
    p { margin-top: 24px; font-size: 26px; line-height: 1.42; color: #4b5a2a; }
    .map { position: absolute; right: 56px; top: 56px; width: 470px; height: 518px; border-radius: 36px; overflow: hidden;
           box-shadow: 0 30px 60px -30px rgb(30 45 0 / .55), 0 0 0 1px rgb(45 70 0 / .08); background: #dfe8c8; }
    .map .pill { position: absolute; font-size: 22px; }
    .map .pill i { width: 40px; height: 40px; }
  </style>
  <div class="text">
    <div class="brand"><div class="logo">${LOGO}</div><b>Mycel</b></div>
    <h1>Vet var svampen <span>växer</span> innan du går ut</h1>
    <p>Svamp- och bärkartan som räknar fram chansen – gratis och utan konto.</p>
  </div>
  <div class="map">
    <svg width="470" height="518" viewBox="0 0 470 518">
      <defs><filter id="b"><feGaussianBlur stdDeviation="9"/></filter></defs>
      <rect width="470" height="518" fill="#d9e4bd"/>
      <path d="M0 360 C80 330 120 400 200 380 S330 300 470 330 V518 H0Z" fill="#c8d9a6"/>
      <path d="M-10 120 C90 90 160 170 250 140 S400 60 480 100" fill="none" stroke="#b9cc92" stroke-width="30"/>
      <path d="M300 0 C280 120 360 200 330 300 S260 440 300 520" fill="none" stroke="#8fb3d9" stroke-width="16" stroke-linecap="round"/>
      <path d="M40 230 C120 210 190 260 260 236" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/>
      <g filter="url(#b)">
        <ellipse cx="140" cy="190" rx="90" ry="60" fill="#ffd23d" opacity=".75"/>
        <ellipse cx="150" cy="195" rx="48" ry="32" fill="#ff8a1a" opacity=".85"/>
        <ellipse cx="380" cy="400" rx="70" ry="52" fill="#ffd23d" opacity=".7"/>
        <ellipse cx="385" cy="402" rx="34" ry="24" fill="#f4520a" opacity=".85"/>
        <ellipse cx="90" cy="430" rx="60" ry="40" fill="#ffd23d" opacity=".6"/>
      </g>
    </svg>
    <span class="pill" style="left:58px;top:98px">${'<i>' + speciesSvg('kantarell', 30) + '</i>'}<em>64 %</em></span>
    <span class="pill" style="left:262px;top:322px">${'<i>' + speciesSvg('karljohan', 30) + '</i>'}<em>58 %</em></span>
    <span class="pill" style="left:30px;top:452px">${'<i>' + speciesSvg('blabar', 30) + '</i>'}<em>41 %</em></span>
  </div>`,

  // 3. Grafisk: skogsgrön botten, stor rubrik i bärnsten, rad med artikoner
  grafisk: `<style>${base}
    body { background: radial-gradient(120% 140% at 85% 10%, #4a6b0a 0%, #2D4600 45%, #1d2e00 100%); color: #FFFBEB; }
    .text { position: absolute; left: 72px; top: 70px; width: 760px; }
    h1 { margin-top: 54px; font-size: 84px; line-height: .98; font-weight: 800; letter-spacing: -0.035em; }
    h1 span { color: #F2B124; }
    p { margin-top: 26px; font-size: 27px; line-height: 1.4; color: rgb(255 251 235 / .85); width: 640px; }
    .row { position: absolute; left: 72px; bottom: 62px; display: flex; gap: 14px; }
    .big { position: absolute; right: -40px; top: 60px; width: 470px; height: 470px; opacity: .95; transform: rotate(-8deg); }
    .big svg rect { fill: none; }
  </style>
  <div class="text">
    <div class="brand"><div class="logo">${LOGO}</div><b>Mycel</b></div>
    <h1>Svamp- och<br><span>bärkartan</span></h1>
    <p>Se var chansen är störst – utifrån skog, mark, terräng och väder.</p>
  </div>
  <div class="big">${LOGO.replace('<rect width="64" height="64" rx="16" fill="#2D4600"/>', '')}</div>
  <div class="row">${icons(['kantarell', 'trattkantarell', 'karljohan', 'svarttrumpet', 'blabar', 'lingon', 'hjortron', 'smultron'], 64)}</div>`,
}

const CHOSEN = 'foto'
const [mode, outDir] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await b.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
for (const [name, html] of Object.entries(VARIANTS)) {
  if (mode !== 'alla' && name !== CHOSEN) continue
  await page.setContent(`<!doctype html><html lang="sv"><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const path = mode === 'alla' ? `${outDir}/og-${name}.png` : new URL('public/og.jpg', ROOT).pathname.replace(/^\/([A-Z]:)/, '$1')
  await page.screenshot({ path, type: path.endsWith('.jpg') ? 'jpeg' : 'png', quality: path.endsWith('.jpg') ? 86 : undefined })
  console.log('Sparade', path)
}
await b.close()
