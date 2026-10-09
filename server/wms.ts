/**
 * Delad cache för kartbilder från Naturvårdsverket (NMD) och SGU (jordarter).
 *
 * Deras WMS-servrar är långsamma (ofta flera sekunder per bild) och skickar
 * inga cache-huvuden. Kartan begär alltid samma block (zoom 13, 2 × 2 rutor),
 * så svaret sparas i Cloudflares cache (se cache.ts): första besökaren hämtar
 * från källan, alla andra får bilden direkt. Källdatan ändras bara när en ny
 * version släpps.
 *
 * Endast GetMap-anrop mot de två kända lagren släpps igenom.
 */

const UPSTREAM: Record<string, { url: string; layer: string }> = {
  nmd: { url: 'https://geodata.naturvardsverket.se/geoserver/wms', layer: 'lc-nmd:LC.LandCoverRaster.Bas.2023.v2.x' },
  sgu: { url: 'https://maps3.sgu.se/geoserver/jord/ows', layer: 'SE.GOV.SGU.JORD.GRUNDLAGER.25K' },
}

const HALF = 20037508.342789244
const BN = 576 // kartans block: 2 × 2 rutor à 256 px + 32 px marginal runt om
const M = 32

/**
 * Bara exakt de bilder kartan själv begär: ett helt block i rutnätet (zoom 10–16),
 * 576 × 576 px, EPSG:3857, PNG. Allt annat (godtyckliga utsnitt) avvisas – annars
 * kan vem som helst skapa oändligt många unika adresser och tömma funktionskvoten.
 * Appen hämtar då direkt från källan i stället, så inget går sönder.
 */
function isGridBlock(p: URLSearchParams, src: string) {
  const fixed: Record<string, string> = { service: 'WMS', version: '1.1.1', request: 'GetMap', styles: '', format: 'image/png', transparent: 'true', srs: 'EPSG:3857' }
  for (const [k, v] of Object.entries(fixed)) if (p.get(k) !== v) return false
  const fo = p.get('format_options')
  if (fo !== null && !(src === 'sgu' && fo === 'antialias:none')) return false
  if (p.get('width') !== String(BN) || p.get('height') !== String(BN)) return false
  const b = (p.get('bbox') ?? '').split(',').map(Number)
  if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) return false
  const [minx, miny, maxx, maxy] = b
  const mpp = (maxx - minx) / BN
  if (!(mpp > 0) || Math.abs((maxy - miny) / BN - mpp) > mpp * 1e-6) return false
  const z = Math.log2((2 * HALF) / (256 * mpp))
  if (Math.abs(z - Math.round(z)) > 1e-6 || z < 9.5 || z > 16.5) return false
  const span = (2 * HALF) / 2 ** Math.round(z)
  const bx = (minx + HALF + M * mpp) / (2 * span)
  const by = (HALF + M * mpp - maxy) / (2 * span)
  return Math.abs(bx - Math.round(bx)) < 1e-6 && Math.abs(by - Math.round(by)) < 1e-6
}

export const ALLOWED = ['service', 'version', 'request', 'layers', 'styles', 'format', 'transparent', 'srs', 'bbox', 'width', 'height', 'format_options']

export async function wms(req: Request) {
  const url = new URL(req.url)
  const name = url.pathname.split('/').pop() ?? ''
  const src = UPSTREAM[name]
  const p = url.searchParams
  if (!src || p.get('layers') !== src.layer || !isGridBlock(p, name)) return new Response('Ogiltig förfrågan', { status: 400 })

  const q = new URLSearchParams()
  for (const k of ALLOWED) if (p.has(k)) q.set(k, p.get(k)!)
  const res = await fetch(`${src.url}?${q}`, { headers: { 'User-Agent': 'Mycel (svamp- och bärkarta)' } }).catch(() => null)
  const type = res?.headers.get('content-type') ?? ''
  if (!res?.ok || !type.startsWith('image/')) return new Response('Källan svarade inte', { status: 502, headers: { 'cache-control': 'no-store' } })

  return new Response(res.body, {
    headers: {
      'content-type': type,
      // webbläsaren: en vecka (Cloudflares cache sparar ett år, se cache.ts)
      'cache-control': 'public, max-age=604800',
    },
  })
}
