import { FYND_MAX_PAGES, FYND_PAGE, FYND_ZOOM, gbifUrl, parseSet, tileBox, toFind, type Find } from '../lib/fynd'

/** Fynden i en kartruta. `complete` är false om rutan har fler fynd än som hämtas. */
export interface TileFinds {
  finds: Find[]
  complete: boolean
}

// En hämtning per urval och ruta, delad mellan alla som frågar. Misslyckade tas bort så att de kan göras om.
const loaded = new Map<string, Promise<TileFinds>>()

/**
 * Rapporterade fynd för en ruta (zoom FYND_ZOOM). På den publicerade sajten via
 * appens egen funktion (server/fynd.ts), så att webbläsaren inte kontaktar GBIF.
 * I utvecklingsläge finns ingen funktion; då ställs samma fråga direkt till GBIF,
 * en ruta i taget.
 */
export function loadFinds(set: string, x: number, y: number): Promise<TileFinds> {
  const key = `${set}/${x}/${y}`
  let p = loaded.get(key)
  if (!p) {
    p = (import.meta.env.PROD ? viaServer(set, x, y) : oneAtATime(() => direct(set, x, y))).catch((e: unknown) => {
      loaded.delete(key)
      throw e
    })
    loaded.set(key, p)
  }
  return p
}

async function viaServer(set: string, x: number, y: number): Promise<TileFinds> {
  const res = await fetch(`/fynd/${set}/${FYND_ZOOM}/${x}/${y}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as Partial<TileFinds>
  if (!Array.isArray(j.finds)) throw new Error('Oväntat svar')
  return { finds: j.finds, complete: j.complete === true }
}

// Utvecklingsläge: GBIF svarar "för många anrop" (429) om en hel kartvy hämtas på en gång
let queue: Promise<unknown> = Promise.resolve()

/** Kör jobben ett i taget. Ett jobb som misslyckas stoppar inte kön. */
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job)
  queue = run.catch(() => undefined)
  return run
}

async function direct(set: string, x: number, y: number): Promise<TileFinds> {
  const ids = parseSet(set)
  if (!ids) throw new Error('Okänt urval')
  const box = tileBox(FYND_ZOOM, x, y)
  const year = new Date().getFullYear()
  const finds: Find[] = []
  for (let page = 0; page < FYND_MAX_PAGES; page++) {
    const res = await fetch(gbifUrl(ids, box, page * FYND_PAGE, year))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = (await res.json()) as { results?: Record<string, unknown>[]; endOfRecords?: boolean }
    for (const r of j.results ?? []) {
      const f = toFind(r)
      if (f) finds.push(f)
    }
    if (j.endOfRecords || !j.results?.length) return { finds, complete: true }
  }
  return { finds, complete: false }
}
