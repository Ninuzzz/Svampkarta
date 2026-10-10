// Rapporterade fynd: urval, rutor och att inget utöver fem fält släpps igenom.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FYND_ZOOM, TAXA, gbifUrl, isRecent, mergeFinds, parseSet, tileAt, tileBox, tilesFor, toFind, validTile } from '../src/lib/fynd.ts'
import { EXPERT_MODELS } from '../src/analysis/species.ts'

// en post så som GBIF skickar den (förkortad), med fält som inte får följa med
const record = {
  key: 5229614895,
  speciesKey: 5249504,
  taxonKey: 5249504,
  decimalLatitude: 56.101394,
  decimalLongitude: 12.638614,
  coordinateUncertaintyInMeters: 25,
  year: 2025,
  recordedBy: 'Namn Namnsson',
  rightsHolder: 'Namn Namnsson',
  locality: 'Bakom ladan',
  license: 'http://creativecommons.org/publicdomain/zero/1.0/legalcode',
}

test('varje art i appen har en artnyckel, och inga andra', () => {
  assert.deepEqual(Object.keys(TAXA).sort(), EXPERT_MODELS.map((s) => s.id).sort())
  for (const s of EXPERT_MODELS) assert.equal(TAXA[s.id].kind, s.kind, s.id)
  assert.equal(new Set(Object.values(TAXA).map((t) => t.key)).size, Object.keys(TAXA).length, 'nycklarna är unika')
})

test('bara id, position, år och art lämnar en post', () => {
  const f = toFind(record)
  assert.deepEqual(f, { id: 5229614895, lat: 56.10139, lng: 12.63861, year: 2025, sp: 'kantarell' })
  assert.deepEqual(Object.keys(f!).sort(), ['id', 'lat', 'lng', 'sp', 'year'])
  assert.ok(!JSON.stringify(f).includes('Namnsson'))
})

test('poster utan position, år eller känd art avvisas', () => {
  assert.equal(toFind({ ...record, decimalLatitude: undefined }), null)
  assert.equal(toFind({ ...record, year: null }), null)
  assert.equal(toFind({ ...record, speciesKey: 1, taxonKey: 1 }), null)
  assert.equal(toFind({ ...record, key: '5229614895' }), null)
})

test('synonym: arten hämtas från speciesKey även om taxonKey är en annan', () => {
  assert.equal(toFind({ ...record, taxonKey: 999, speciesKey: 5249504 })?.sp, 'kantarell')
})

test('urval: grupper och enskilda arter, okända avvisas', () => {
  assert.ok(parseSet('svamp')!.includes('kantarell'))
  assert.ok(!parseSet('svamp')!.includes('blabar'))
  assert.deepEqual(parseSet('lingon'), ['lingon'])
  assert.equal(parseSet('toString'), null)
  assert.equal(parseSet('../x'), null)
  assert.equal(parseSet(''), null)
})

test('rutan som en punkt ligger i innehåller punkten', () => {
  const lat = 55.87, lng = 12.83 // Landskrona
  const { x, y } = tileAt(lat, lng, FYND_ZOOM)
  const b = tileBox(FYND_ZOOM, x, y)
  assert.ok(b.south <= lat && lat < b.north && b.west <= lng && lng < b.east)
  // en ruta på zoom 10 är exakt 360/1024 grader bred
  assert.ok(Math.abs(b.east - b.west - 360 / 1024) < 1e-9)
  assert.ok(validTile(FYND_ZOOM, x, y))
})

test('bara rutor på rätt zoom och i Sverige godtas', () => {
  const { x, y } = tileAt(55.87, 12.83, FYND_ZOOM)
  assert.ok(!validTile(9, x >> 1, y >> 1), 'fel zoom')
  assert.ok(!validTile(FYND_ZOOM, x + 0.5, y), 'inte heltal')
  assert.ok(!validTile(FYND_ZOOM, Number.NaN, y))
  const paris = tileAt(48.86, 2.35, FYND_ZOOM)
  assert.ok(!validTile(FYND_ZOOM, paris.x, paris.y), 'utanför Sverige')
})

test('en kartvy över trakten ger några få rutor, hela landet ger inga', () => {
  const near = tilesFor({ south: 55.6, west: 12.37, north: 56.14, east: 13.33 })
  assert.ok(near.length >= 4 && near.length <= 12, String(near.length))
  assert.ok(near.every((t) => validTile(FYND_ZOOM, t.x, t.y)))
  assert.deepEqual(tilesFor({ south: 55, west: 11, north: 69, east: 24 }), [])
})

test('frågan till GBIF har filtren för licens, position och år samt rätt arter', () => {
  const u = new URL(gbifUrl(parseSet('svamp')!, { south: 55.6, west: 12.37, north: 56.14, east: 13.33 }, 300, 2026))
  assert.equal(u.origin + u.pathname, 'https://api.gbif.org/v1/occurrence/search')
  const p = u.searchParams
  assert.deepEqual(p.getAll('license'), ['CC0_1_0', 'CC_BY_4_0'])
  assert.equal(p.get('coordinateUncertaintyInMeters'), '0,100')
  assert.equal(p.get('year'), '1990,2026')
  assert.equal(p.get('country'), 'SE')
  assert.equal(p.get('offset'), '300')
  assert.equal(p.get('limit'), '300')
  assert.deepEqual(p.getAll('taxonKey').map(Number).sort(), parseSet('svamp')!.map((id) => TAXA[id].key).sort())
  assert.equal(p.get('decimalLatitude'), '55.60000,56.14000')
})

test('fynd från flera rutor slås ihop utan dubbletter, nyast först, med tak', () => {
  const f = (id: number, year: number) => ({ id, lat: 56, lng: 13, year, sp: 'kantarell' })
  const r = mergeFinds([[f(1, 2001), f(2, 2024)], [f(2, 2024), f(3, 2015)]], 2)
  assert.equal(r.total, 3)
  assert.deepEqual(r.finds.map((x) => x.id), [2, 3])
  assert.deepEqual(mergeFinds([], 10), { finds: [], total: 0 })
})

test('nytt fynd = högst tio år gammalt', () => {
  assert.ok(isRecent(2026, 2026))
  assert.ok(isRecent(2016, 2026))
  assert.ok(!isRecent(2015, 2026))
})

