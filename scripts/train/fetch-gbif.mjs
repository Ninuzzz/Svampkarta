/**
 * Steg 1 av 3: hämtar fynd från GBIF (öppen data, bl.a. Artportalen).
 *
 *   node scripts/train/fetch-gbif.mjs
 *
 * Per art hämtas ett slumpmässigt urval av fynd med god lägesnoggrannhet
 * (≤ 50 m, 2016–2025). Som jämförelse hämtas en "bakgrund" av alla fynd
 * inom samma organismgrupp (svampar resp. ris och bär). Eftersom samma
 * människor rapporterar båda jämnas skevheten ut – fynd hamnar ofta nära
 * vägar och stigar oavsett art.
 */
import fs from 'node:fs'

const OUT = new URL('./data/occurrences.json', import.meta.url)
const PER_SPECIES = 300
const BACKGROUND = 1500
const RANDOM = 2500

const SPECIES = {
  kantarell: 'Cantharellus cibarius',
  trattkantarell: 'Craterellus tubaeformis',
  svarttrumpet: 'Craterellus cornucopioides',
  karljohan: 'Boletus edulis',
  taggsvamp: 'Hydnum repandum',
  farticka: 'Albatrellus ovinus',
  smorsopp: 'Suillus luteus',
  blabar: 'Vaccinium myrtillus',
  lingon: 'Vaccinium vitis-idaea',
  hjortron: 'Rubus chamaemorus',
  hallon: 'Rubus idaeus',
  tranbar: 'Vaccinium oxycoccos',
  smultron: 'Fragaria vesca',
}
const KIND = { kantarell: 'svamp', trattkantarell: 'svamp', svarttrumpet: 'svamp', karljohan: 'svamp', taggsvamp: 'svamp', farticka: 'svamp', smorsopp: 'svamp' }
// Bakgrund: storsvampar resp. ljung- och rosväxter (samma rapportörer och miljöer)
const BACKGROUND_TAXA = { svamp: ['Agaricomycetes'], bar: ['Ericaceae', 'Rosaceae'] }

const FILTER = 'country=SE&hasCoordinate=true&hasGeospatialIssue=false&coordinateUncertaintyInMeters=0,50&year=2016,2025&occurrenceStatus=PRESENT'

const get = async (url) => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mycel (privat svamp- och bärkarta, träning av habitatmodell)' } })
    if (r.ok) return r.json()
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)))
  }
  throw new Error('GBIF svarar inte: ' + url)
}

async function key(name, rank) {
  const j = await get(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}${rank ? '&rank=' + rank : ''}`)
  return j.usageKey
}

/** Slumpmässigt urval: slumpade sidor (offset) i hela träffmängden, utan dubbletter inom ~50 m. */
async function sample(taxonKeys, n) {
  const q = taxonKeys.map((k) => `taxonKey=${k}`).join('&')
  const total = (await get(`https://api.gbif.org/v1/occurrence/search?${q}&${FILTER}&limit=0`)).count
  const max = Math.min(total, 99000)
  const seen = new Set()
  const out = []
  let tries = 0
  while (out.length < n && tries < 60) {
    tries++
    const offset = Math.floor(Math.random() * Math.max(1, max - 300))
    const page = await get(`https://api.gbif.org/v1/occurrence/search?${q}&${FILTER}&limit=300&offset=${offset}`)
    for (const r of page.results) {
      const k = `${r.decimalLatitude.toFixed(3)},${r.decimalLongitude.toFixed(3)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ lat: r.decimalLatitude, lng: r.decimalLongitude, year: r.year, unc: r.coordinateUncertaintyInMeters ?? null })
      if (out.length >= n) break
    }
    if (total <= 300) break
  }
  return { total, points: out }
}

const result = { fetched: new Date().toISOString(), filter: FILTER, species: {}, background: {} }
for (const [id, name] of Object.entries(SPECIES)) {
  const k = await key(name)
  const s = await sample([k], PER_SPECIES)
  result.species[id] = { name, taxonKey: k, kind: KIND[id] ?? 'bar', total: s.total, points: s.points }
  console.log(`${id.padEnd(15)} ${String(s.points.length).padStart(4)} av ${s.total}`)
}
for (const [kind, names] of Object.entries(BACKGROUND_TAXA)) {
  const keys = []
  for (const n of names) keys.push(await key(n))
  const s = await sample(keys, BACKGROUND)
  result.background[kind] = { taxa: names, total: s.total, points: s.points }
  console.log(`bakgrund ${kind.padEnd(6)} ${s.points.length} av ${s.total}`)
}
// Slumpvisa punkter i landskapet (Sveriges utbredning) – för måttet "bättre än slumpen på kartan".
// Punkter utanför land (hav, utomlands) sorteras bort efter avläsningen.
const rnd = []
for (let i = 0; i < RANDOM; i++) rnd.push({ lat: 55.3 + Math.random() * (69.0 - 55.3), lng: 11.0 + Math.random() * (24.0 - 11.0) })
result.random = { points: rnd }
console.log(`slumpvisa punkter ${rnd.length}`)
fs.mkdirSync(new URL('./data/', import.meta.url), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(result))
console.log('Sparat:', OUT.pathname)
