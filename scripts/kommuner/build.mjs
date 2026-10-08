/**
 * Bygger kommungränser till public/kommuner/:
 *   index.json   – namn, id, län, mittpunkt, utbredning och grannkommuner
 *   <id>.json    – detaljerad gräns (OpenStreetMap via Nominatim, förenklad till ~30 m)
 *
 *   node scripts/kommuner/build.mjs
 *
 * Grannar räknas fram ur en lätt GeoJSON (okfse/sweden-geojson). Nominatim
 * anropas högst en gång per sekund enligt deras användarregler.
 */
import fs from 'node:fs'

const OUT = new URL('../../public/kommuner/', import.meta.url)
fs.mkdirSync(OUT, { recursive: true })
const UA = { 'User-Agent': 'Mycel (privat svamp- och bärkarta; engångshämtning av kommungränser)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const light = await (await fetch('https://raw.githubusercontent.com/okfse/sweden-geojson/master/swedish_municipalities.geojson')).json()

const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap((poly) => poly)
const kom = light.features.map((f) => {
  const pts = rings(f.geometry).flat()
  const lats = pts.map((p) => p[1]), lngs = pts.map((p) => p[0])
  return {
    id: f.properties.id,
    name: f.properties.kom_namn,
    lan: f.properties.lan_code,
    center: f.properties.geo_point_2d,
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    pts,
    geometry: f.geometry,
  }
})

// Grannar: kommuner vars gränspunkter ligger inom ~2,5 km från varandra
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111)
for (const a of kom) {
  a.neighbors = kom
    .filter((b) => b !== a && b.bbox[0] < a.bbox[2] + 0.05 && b.bbox[2] > a.bbox[0] - 0.05 && b.bbox[1] < a.bbox[3] + 0.05 && b.bbox[3] > a.bbox[1] - 0.05)
    .filter((b) => a.pts.some((p) => b.pts.some((q) => km(p, q) < 2.5)))
    .map((b) => b.id)
}

/** Douglas–Peucker i grader (tolerans ~30 m) */
function simplify(pts, tol) {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  // en sluten ring börjar och slutar i samma punkt – dela den vid mittpunkten
  const mid = Math.floor(pts.length / 2)
  keep[0] = keep[mid] = keep[pts.length - 1] = 1
  const stack = [
    [0, mid],
    [mid, pts.length - 1],
  ]
  while (stack.length) {
    const [s, e] = stack.pop()
    let best = 0, idx = -1
    const [x1, y1] = pts[s], [x2, y2] = pts[e]
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len
      if (d > best) (best = d), (idx = i)
    }
    if (best > tol && idx > 0) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5])
}

const index = []
for (const k of kom) {
  const file = new URL(`${k.id}.json`, OUT)
  let ok = fs.existsSync(file)
  if (!ok) {
    // OSM-namnet har oftast genitiv-s: "Varbergs kommun", men "Landskrona kommun"
    const SPECIAL = { Falun: 'Falu kommun', Sundbyberg: 'Sundbybergs stad' }
    const names = SPECIAL[k.name]
      ? [SPECIAL[k.name]]
      : /[aeiouyåäös]$/i.test(k.name)
        ? [`${k.name} kommun`, `${k.name}s kommun`]
        : [`${k.name}s kommun`, `${k.name} kommun`]
    try {
      let res = []
      for (const q of names) {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=se&polygon_geojson=1&limit=5&q=${encodeURIComponent(q)}`
        res = await (await fetch(url, { headers: UA })).json()
        if (res.some((r) => r.addresstype === 'municipality' && /Polygon/.test(r.geojson?.type))) break
        await sleep(1100)
      }
      const hit = res.find((r) => r.addresstype === 'municipality' && /Polygon/.test(r.geojson?.type)) ?? res.find((r) => r.type === 'administrative' && /Polygon/.test(r.geojson?.type))
      if (hit) {
        const g = hit.geojson
        const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
          .map((poly) => poly.map((ring) => simplify(ring, 0.0003)).filter((ring) => ring.length >= 4))
          .filter((poly) => poly.length)
        fs.writeFileSync(file, JSON.stringify({ id: k.id, name: k.name, polygons: polys }))
        ok = true
      } else {
        // reserv: den grövre gränsen från den lätta filen
        const g = k.geometry
        fs.writeFileSync(file, JSON.stringify({ id: k.id, name: k.name, polygons: g.type === 'Polygon' ? [g.coordinates] : g.coordinates, coarse: true }))
        ok = true
        console.log('Grov gräns används för:', k.name)
      }
    } catch (e) {
      console.log('Fel för', k.name, e.message)
    }
    await sleep(1100)
  }
  index.push({ id: k.id, name: k.name, lan: k.lan, center: k.center.map((v) => Math.round(v * 1e4) / 1e4), bbox: k.bbox.map((v) => Math.round(v * 1e4) / 1e4), neighbors: k.neighbors, detail: ok })
  if (index.length % 25 === 0) console.log(`${index.length}/${kom.length}`)
}
index.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
fs.writeFileSync(new URL('index.json', OUT), JSON.stringify(index))
console.log('Klart:', index.filter((k) => k.detail).length, 'av', index.length, 'med detaljerad gräns')
