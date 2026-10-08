/**
 * Delad cache för SLU:s skogsålderskarta (CC BY 4.0).
 *
 * Kartan är en stor GeoTIFF som läses med HTTP-range. Ett range-anrop kan inte
 * cachas av CDN:en, så klienten begär i stället fasta byte-spann som en del av
 * adressen (/age-range/pine/<start>-<end>). Spannen är alltid desamma för samma
 * del av kartan, så svaren delas mellan alla besökare.
 */

const FILES: Record<string, string> = {
  pine: 'https://gis.slu.se/data/skogsdatalabbet/SLU_skogsalder_2025/data/PINE_AGE_2025.tif',
  spruce: 'https://gis.slu.se/data/skogsdatalabbet/SLU_skogsalder_2025/data/SPRUCE_AGE_2025.tif',
}
const MAX = 4 * 1024 * 1024

export default async (req: Request) => {
  const [, , file, range] = new URL(req.url).pathname.split('/')
  const m = /^(\d+)-(\d+)$/.exec(range ?? '')
  const url = FILES[file ?? '']
  const start = Number(m?.[1]), end = Number(m?.[2])
  if (!url || !m || end < start || end - start + 1 > MAX) return new Response('Ogiltig förfrågan', { status: 400 })

  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mycel (svamp- och bärkarta)' } }).catch(() => null)
  if (!res || res.status !== 206) return new Response('Källan svarade inte', { status: 502, headers: { 'cache-control': 'no-store' } })
  const body = await res.arrayBuffer()
  if (body.byteLength !== end - start + 1) return new Response('Fel längd från källan', { status: 502, headers: { 'cache-control': 'no-store' } })

  return new Response(body, {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'public, max-age=604800',
      'netlify-cdn-cache-control': 'public, durable, s-maxage=31536000, stale-while-revalidate=604800',
    },
  })
}

export const config = { path: '/age-range/:file/:range' }
