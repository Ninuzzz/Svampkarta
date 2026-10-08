/**
 * Steg 1b: slumpar markpunkter i samma trakter som bärfynden (inom 30 km från
 * ett slumpvis valt fynd, och bara på svensk mark enligt kommungränserna).
 *
 *   node scripts/train/add-local-random.mjs [antal=3000]
 *
 * De vanliga slumpade punkterna (occ.random) täcker hela Sverige, och bara
 * några hundra hamnar på mark där bären rapporteras. De nya punkterna
 * (occ.randomLocal, nycklar rnd-lokal:i) gör jämförelsen med marken i samma
 * trakt stabilare. Kör sedan extract.mjs (läser bara de nya punkterna) och fit.ts.
 */
import fs from 'node:fs'

const N = Number(process.argv[2] ?? 3000)
const RADIUS_KM = 30
const FILE = new URL('./data/occurrences.json', import.meta.url)
const KOMMUNER = new URL('../../public/kommuner/', import.meta.url)
const BERRIES = ['blabar', 'lingon', 'hjortron', 'hallon', 'tranbar', 'smultron']

const occ = JSON.parse(fs.readFileSync(FILE, 'utf8'))

// Kommunpolygoner med omslutande ruta, för snabb punkt-i-polygon
const shapes = []
for (const f of fs.readdirSync(KOMMUNER)) {
  if (!/^\d{4}\.json$/.test(f)) continue
  const k = JSON.parse(fs.readFileSync(new URL(f, KOMMUNER), 'utf8'))
  for (const poly of k.polygons) {
    let minX = 180, minY = 90, maxX = -180, maxY = -90
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    shapes.push({ poly, minX, minY, maxX, maxY })
  }
}
const inRing = (ring, x, y) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// jämn-udda över alla ringar, så att hål (sjöar) räknas bort
const onLand = (lng, lat) =>
  shapes.some((s) => lng >= s.minX && lng <= s.maxX && lat >= s.minY && lat <= s.maxY && s.poly.filter((r) => inRing(r, lng, lat)).length % 2 === 1)

// fast slumpfrö, så att samma punkter kommer tillbaka vid omkörning
let seed = 20261008
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const finds = BERRIES.flatMap((id) => (occ.species[id]?.points ?? []).filter((p) => !p.src))
const points = []
for (let tries = 0; points.length < N && tries < N * 20; tries++) {
  const f = finds[Math.floor(rand() * finds.length)]
  const r = RADIUS_KM * Math.sqrt(rand()), a = rand() * 2 * Math.PI
  const lat = f.lat + (r / 111.32) * Math.sin(a)
  const lng = f.lng + (r / (111.32 * Math.cos((f.lat * Math.PI) / 180))) * Math.cos(a)
  if (onLand(lng, lat)) points.push({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })
}
occ.randomLocal = { points, radiusKm: RADIUS_KM, near: BERRIES }
fs.writeFileSync(FILE, JSON.stringify(occ))
console.log(`${points.length} markpunkter nära ${finds.length} bärfynd skrivna till occurrences.json`)
