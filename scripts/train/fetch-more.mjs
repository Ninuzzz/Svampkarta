/**
 * Fyller på occurrences.json med fler GBIF-fynd för valda arter (och bakgrund),
 * utan att röra befintliga punkter: nya läggs sist, så att redan avlästa
 * egenskaper i features-window.json behåller sina nycklar.
 *
 *   node scripts/train/fetch-more.mjs blabar,lingon,hallon,smultron,hjortron,tranbar 1500 bar 4500
 *
 * (arter, antal per art totalt, bakgrundsgrupp, antal i bakgrunden totalt)
 */
import fs from 'node:fs'

const FILE = new URL('./data/occurrences.json', import.meta.url)
const [ids, perSpecies, bgKind, bgTotal] = process.argv.slice(2)
const occ = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const FILTER = occ.filter

const get = async (url) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mycel (privat svamp- och bärkarta, träning av habitatmodell)' } }).catch(() => null)
    if (r?.ok) return r.json()
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)))
  }
  throw new Error('GBIF svarar inte: ' + url)
}
const keyOf = (p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`

/** Slumpade sidor i hela träffmängden; hoppar över platser (~100 m) som redan finns. */
async function more(taxonKeys, list, n) {
  const q = taxonKeys.map((k) => `taxonKey=${k}`).join('&')
  const total = (await get(`https://api.gbif.org/v1/occurrence/search?${q}&${FILTER}&limit=0`)).count
  const max = Math.min(total, 99000)
  const seen = new Set(list.map(keyOf))
  let added = 0, tries = 0
  while (list.length < n && tries < 120) {
    tries++
    const offset = Math.floor(Math.random() * Math.max(1, max - 300))
    const page = await get(`https://api.gbif.org/v1/occurrence/search?${q}&${FILTER}&limit=300&offset=${offset}`)
    for (const r of page.results) {
      const p = { lat: r.decimalLatitude, lng: r.decimalLongitude, year: r.year, unc: r.coordinateUncertaintyInMeters ?? null }
      if (seen.has(keyOf(p))) continue
      seen.add(keyOf(p))
      list.push(p)
      added++
      if (list.length >= n) break
    }
    if (total <= 300) break
  }
  return added
}

for (const id of ids.split(',')) {
  const s = occ.species[id]
  const added = await more([s.taxonKey], s.points, Number(perSpecies))
  console.log(`${id.padEnd(15)} +${added} → ${s.points.length}`)
}
if (bgKind) {
  const b = occ.background[bgKind]
  const keys = []
  for (const name of b.taxa) keys.push((await get(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)).usageKey)
  const added = await more(keys, b.points, Number(bgTotal))
  console.log(`bakgrund ${bgKind} +${added} → ${b.points.length}`)
}
occ.updated = new Date().toISOString()
fs.writeFileSync(FILE, JSON.stringify(occ))
console.log('Sparat')
