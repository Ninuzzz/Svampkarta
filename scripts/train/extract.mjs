/**
 * Steg 2 av 3: läser modellens egenskaper (skog, jordart, terräng, ålder …)
 * i varje fyndpunkt – med samma analysmotor som appen kör.
 *
 *   npx vite --port 5174          (i ett annat fönster)
 *   node scripts/train/extract.mjs [http://localhost:5174] [sökväg till Chrome]
 *
 * Kan avbrytas och startas om – redan lästa punkter sparas löpande.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:5174'
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const IN = new URL('./data/occurrences.json', import.meta.url)
const OUT = new URL('./data/features-window.json', import.meta.url)
const WORKERS = 4

const occ = JSON.parse(fs.readFileSync(IN, 'utf8'))
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
// misslyckade punkter (null) görs om
for (const k of Object.keys(done)) if (!done[k]) delete done[k]

// Alla punkter med en nyckel; sortera på block så att närliggande punkter delar hämtad data
const jobs = []
for (const [id, s] of Object.entries(occ.species)) s.points.forEach((p, i) => jobs.push({ key: `${id}:${i}`, ...p }))
for (const [kind, b] of Object.entries(occ.background)) b.points.forEach((p, i) => jobs.push({ key: `bg-${kind}:${i}`, ...p }))
occ.random?.points.forEach((p, i) => jobs.push({ key: `rnd:${i}`, ...p }))
const block = (p) => {
  const n = 2 ** 14
  const x = Math.floor(((p.lng + 180) / 360) * n / 2)
  const y = Math.floor(((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n / 2)
  return `${y.toString().padStart(6, '0')}:${x}`
}
const todo = jobs.filter((j) => !(j.key in done)).sort((a, b) => block(a).localeCompare(block(b)))
console.log(`${jobs.length} punkter, ${todo.length} kvar`)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
const page = await browser.newPage()
await page.goto(BASE + '/#/guide', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 4000))
await page.goto(BASE + '/#/guide', { waitUntil: 'networkidle2' })

await page.evaluate(async (n) => {
  window.__w = []
  for (let i = 0; i < n; i++) {
    const w = new Worker('/src/analysis/worker.ts', { type: 'module' })
    window.__w.push(w)
  }
  window.__call = (wi, msg) =>
    new Promise((res) => {
      const id = Math.random()
      const w = window.__w[wi]
      const h = (e) => {
        if (e.data.id !== id) return
        w.removeEventListener('message', h)
        res(e.data)
      }
      w.addEventListener('message', h)
      w.postMessage({ ...msg, id })
    })
  await Promise.all(window.__w.map((_, i) => window.__call(i, { type: 'config', training: true })))
}, WORKERS)

let count = 0
let lastSave = Date.now()
const t0 = Date.now()
const save = () => fs.writeFileSync(OUT, JSON.stringify(done))

// Varje worker tar en egen följd av punkter (blockvis), så att dess cache återanvänds
const lanes = Array.from({ length: WORKERS }, () => [])
const groups = new Map()
for (const j of todo) {
  const b = block(j)
  if (!groups.has(b)) groups.set(b, [])
  groups.get(b).push(j)
}
let lane = 0
for (const g of groups.values()) lanes[lane++ % WORKERS].push(...g)

await Promise.all(
  lanes.map(async (list, wi) => {
    for (const j of list) {
      const r = await page.evaluate((wi, lat, lng) => window.__call(wi, { type: 'features', lat, lng, window: true }), wi, j.lat, j.lng).catch((e) => ({ ok: false, error: String(e) }))
      done[j.key] = r.ok ? r.result : null
      count++
      if (count % 50 === 0) {
        const rate = count / ((Date.now() - t0) / 1000)
        console.log(`${count}/${todo.length}  (${rate.toFixed(1)}/s, ~${Math.round((todo.length - count) / rate / 60)} min kvar)`)
      }
      if (Date.now() - lastSave > 15000) {
        save()
        lastSave = Date.now()
      }
    }
  }),
)
save()
const ok = Object.values(done).filter(Boolean).length
console.log(`Klart: ${ok} punkter med egenskaper, ${Object.keys(done).length - ok} misslyckades`)
await browser.close()
