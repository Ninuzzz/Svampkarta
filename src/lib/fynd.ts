/*
 * Rapporterade fynd från GBIF (mest Artportalen). Ren kod utan beroenden: den
 * används både av serverfunktionen (server/fynd.ts), av kartan i utvecklingsläge
 * och av testerna.
 *
 * Urval: fynd i Sverige med känd position (osäkerhet högst 100 m), från 1990 och
 * framåt, med fri licens (CC0 eller CC BY). Från varje post behålls bara id,
 * position, år och art – aldrig rapportörens namn eller fritext om platsen.
 */

/** GBIF:s artnycklar för appens arter. Kontrollerade mot GBIF 2026-10-10. */
export const TAXA: Record<string, { key: number; kind: 'svamp' | 'bar' }> = {
  kantarell: { key: 5249504, kind: 'svamp' },
  trattkantarell: { key: 2554536, kind: 'svamp' },
  svarttrumpet: { key: 2554662, kind: 'svamp' },
  karljohan: { key: 5954958, kind: 'svamp' },
  taggsvamp: { key: 2554716, kind: 'svamp' },
  farticka: { key: 2551823, kind: 'svamp' },
  smorsopp: { key: 7777157, kind: 'svamp' },
  champinjon: { key: 5243458, kind: 'svamp' },
  blabar: { key: 2882833, kind: 'bar' },
  lingon: { key: 2882835, kind: 'bar' },
  hjortron: { key: 2998290, kind: 'bar' },
  hallon: { key: 2993094, kind: 'bar' },
  tranbar: { key: 2882940, kind: 'bar' },
  smultron: { key: 3029817, kind: 'bar' },
}

const BY_KEY = new Map<number, string>(Object.entries(TAXA).map(([id, t]) => [t.key, id]))

/** Fynden hämtas alltid i rutor på den här zoomnivån (ca 22 × 22 km i Skåne). */
export const FYND_ZOOM = 10
/** Äldsta år som tas med. Äldre fynd ritas svagare än de senaste tio åren. */
export const FYND_FROM_YEAR = 1990
/** GBIF ger högst 300 poster per sida; fler sidor än så här hämtas inte per ruta. */
export const FYND_PAGE = 300
export const FYND_MAX_PAGES = 3

/** Sveriges utbredning (samma ruta som chanskartan använder). */
const SWEDEN = { south: 54.9, west: 10.4, north: 69.3, east: 24.4 }

/** Ett fynd så som appen får det: inget annat lämnar servern. */
export interface Find {
  /** GBIF:s id för posten (https://www.gbif.org/occurrence/<id>) */
  id: number
  lat: number
  lng: number
  year: number
  /** appens art-id, t.ex. "kantarell" */
  sp: string
}

/** "svamp", "bar" eller ett art-id → art-id:n som ingår, eller null om urvalet är okänt. */
export function parseSet(set: string): string[] | null {
  if (set === 'svamp' || set === 'bar') return Object.keys(TAXA).filter((id) => TAXA[id].kind === set)
  return Object.prototype.hasOwnProperty.call(TAXA, set) ? [set] : null
}

/** Kartrutan (x, y) som en punkt ligger i på zoom z. */
export function tileAt(lat: number, lng: number, z: number) {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  }
}

/** Rutans hörn i grader. */
export function tileBox(z: number, x: number, y: number) {
  const n = 2 ** z
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  return { south: lat(y + 1), west: (x / n) * 360 - 180, north: lat(y), east: ((x + 1) / n) * 360 - 180 }
}

/**
 * Bara rutor på rätt zoom som rör Sverige godtas. Annars kunde funktionen
 * användas som en öppen dörr till GBIF för vilket område som helst.
 */
export function validTile(z: number, x: number, y: number) {
  if (z !== FYND_ZOOM || !Number.isInteger(x) || !Number.isInteger(y)) return false
  const nw = tileAt(SWEDEN.north, SWEDEN.west, z)
  const se = tileAt(SWEDEN.south, SWEDEN.east, z)
  return x >= nw.x && x <= se.x && y >= nw.y && y <= se.y
}

/** Rutorna som täcker en kartvy, högst `max` stycken (annars tom lista: zooma in). */
export function tilesFor(b: { south: number; west: number; north: number; east: number }, max = 12) {
  const nw = tileAt(Math.min(b.north, SWEDEN.north), Math.max(b.west, SWEDEN.west), FYND_ZOOM)
  const se = tileAt(Math.max(b.south, SWEDEN.south), Math.min(b.east, SWEDEN.east), FYND_ZOOM)
  const out: { x: number; y: number }[] = []
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) if (validTile(FYND_ZOOM, x, y)) out.push({ x, y })
  return out.length > max ? [] : out
}

/** Frågan till GBIF för några arter i en ruta. `year` = innevarande år (övre gräns). */
export function gbifUrl(ids: string[], box: { south: number; west: number; north: number; east: number }, offset: number, year: number) {
  const q = new URLSearchParams()
  q.set('country', 'SE')
  q.set('hasCoordinate', 'true')
  q.set('hasGeospatialIssue', 'false')
  q.set('occurrenceStatus', 'PRESENT')
  q.set('coordinateUncertaintyInMeters', '0,100')
  q.set('year', `${FYND_FROM_YEAR},${year}`)
  q.append('license', 'CC0_1_0')
  q.append('license', 'CC_BY_4_0')
  for (const id of ids) q.append('taxonKey', String(TAXA[id].key))
  q.set('decimalLatitude', `${box.south.toFixed(5)},${box.north.toFixed(5)}`)
  q.set('decimalLongitude', `${box.west.toFixed(5)},${box.east.toFixed(5)}`)
  q.set('limit', String(FYND_PAGE))
  q.set('offset', String(offset))
  return `https://api.gbif.org/v1/occurrence/search?${q}`
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round5 = (v: number) => Math.round(v * 1e5) / 1e5

/**
 * En GBIF-post → ett fynd, eller null om något saknas. Bara de fem fälten i
 * `Find` plockas ut; allt annat i posten (namn, lokalbeskrivning m.m.) lämnas.
 */
export function toFind(rec: Record<string, unknown>): Find | null {
  const id = num(rec.key)
  const lat = num(rec.decimalLatitude)
  const lng = num(rec.decimalLongitude)
  const year = num(rec.year)
  const sp = BY_KEY.get(num(rec.speciesKey) ?? -1) ?? BY_KEY.get(num(rec.acceptedTaxonKey) ?? -1) ?? BY_KEY.get(num(rec.taxonKey) ?? -1)
  if (id === null || lat === null || lng === null || year === null || !sp) return null
  return { id, lat: round5(lat), lng: round5(lng), year, sp }
}
