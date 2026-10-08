/**
 * Delad cache för kartbilder från Naturvårdsverket (NMD) och SGU (jordarter).
 *
 * Deras WMS-servrar är långsamma (ofta flera sekunder per bild) och skickar
 * inga cache-huvuden. Kartan begär alltid samma block (zoom 13, 2 × 2 rutor),
 * så svaret sparas i Netlifys CDN: första besökaren hämtar från källan, alla
 * andra får bilden direkt. Källdatan ändras bara när en ny version släpps.
 *
 * Endast GetMap-anrop mot de två kända lagren släpps igenom.
 */

const UPSTREAM: Record<string, { url: string; layer: string }> = {
  nmd: { url: 'https://geodata.naturvardsverket.se/geoserver/wms', layer: 'lc-nmd:LC.LandCoverRaster.Bas.2023.v2.x' },
  sgu: { url: 'https://maps3.sgu.se/geoserver/jord/ows', layer: 'SE.GOV.SGU.JORD.GRUNDLAGER.25K' },
}

const ALLOWED = ['service', 'version', 'request', 'layers', 'styles', 'format', 'transparent', 'srs', 'bbox', 'width', 'height', 'format_options']

export default async (req: Request) => {
  const url = new URL(req.url)
  const src = UPSTREAM[url.pathname.split('/').pop() ?? '']
  const p = url.searchParams
  const size = Math.max(Number(p.get('width')), Number(p.get('height')))
  if (
    !src ||
    p.get('request') !== 'GetMap' ||
    p.get('layers') !== src.layer ||
    !/^-?[\d.]+(,-?[\d.]+){3}$/.test(p.get('bbox') ?? '') ||
    !(size > 0 && size <= 1024)
  )
    return new Response('Ogiltig förfrågan', { status: 400 })

  const q = new URLSearchParams()
  for (const k of ALLOWED) if (p.has(k)) q.set(k, p.get(k)!)
  const res = await fetch(`${src.url}?${q}`, { headers: { 'User-Agent': 'Mycel (svamp- och bärkarta)' } }).catch(() => null)
  const type = res?.headers.get('content-type') ?? ''
  if (!res?.ok || !type.startsWith('image/')) return new Response('Källan svarade inte', { status: 502, headers: { 'cache-control': 'no-store' } })

  return new Response(res.body, {
    headers: {
      'content-type': type,
      'access-control-allow-origin': '*',
      // webbläsaren: en vecka; Netlifys CDN: ett år, delat mellan alla kantnoder
      'cache-control': 'public, max-age=604800',
      'netlify-cdn-cache-control': 'public, durable, s-maxage=31536000, stale-while-revalidate=604800',
    },
  })
}

export const config = { path: '/wms/:src' }
