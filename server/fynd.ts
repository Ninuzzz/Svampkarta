/**
 * Rapporterade fynd från GBIF för en kartruta: /fynd/<urval>/<z>/<x>/<y>.
 *
 * <urval> är "svamp", "bar" eller ett art-id. Funktionen frågar GBIF åt
 * besökaren, så att deras webbläsare aldrig kontaktar GBIF, och släpper bara
 * igenom id, position, år och art för varje fynd (se toFind i src/lib/fynd.ts).
 * Svaret delas mellan alla besökare via Cloudflares cache (se cache.ts).
 *
 * Bara giltiga rutor i Sverige på en fast zoomnivå godtas – annars avvisas
 * anropet utan att GBIF kontaktas.
 */
import { FYND_MAX_PAGES, FYND_PAGE, gbifUrl, parseSet, tileBox, toFind, validTile, type Find } from '../src/lib/fynd.ts'

const DIGITS = /^\d{1,7}$/

/** Vad kartan får tillbaka. `complete` är false om rutan har fler fynd än som hämtas. */
export interface FyndResponse {
  finds: Find[]
  complete: boolean
}

export async function fynd(req: Request) {
  const [, , set = '', zs = '', xs = '', ys = ''] = new URL(req.url).pathname.split('/')
  const ids = parseSet(set)
  if (!ids || !DIGITS.test(zs) || !DIGITS.test(xs) || !DIGITS.test(ys) || !validTile(Number(zs), Number(xs), Number(ys)))
    return new Response('Ogiltig förfrågan', { status: 400 })

  const box = tileBox(Number(zs), Number(xs), Number(ys))
  const year = new Date().getUTCFullYear()
  const finds: Find[] = []
  let complete = false
  for (let page = 0; page < FYND_MAX_PAGES; page++) {
    const res = await fetch(gbifUrl(ids, box, page * FYND_PAGE, year), { headers: { 'User-Agent': 'Mycel (svamp- och bärkarta)' } }).catch(() => null)
    const body = res?.ok ? ((await res.json().catch(() => null)) as { results?: unknown; endOfRecords?: unknown } | null) : null
    if (!body || !Array.isArray(body.results)) return new Response('Källan svarade inte', { status: 502, headers: { 'cache-control': 'no-store' } })
    for (const r of body.results) {
      const f = r && typeof r === 'object' ? toFind(r as Record<string, unknown>) : null
      if (f) finds.push(f)
    }
    if (body.endOfRecords === true || body.results.length === 0) {
      complete = true
      break
    }
  }

  const out: FyndResponse = { finds, complete }
  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // webbläsaren: ett dygn (Cloudflares cache sparar en vecka, se funktionen i functions/fynd)
      'cache-control': 'public, max-age=86400',
    },
  })
}
