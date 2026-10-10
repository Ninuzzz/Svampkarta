/**
 * Stigar och skogsbilvägar från OpenStreetMap via OpenFreeMap (gratis
 * vektorrutor, ingen nyckel). Används för "nära stig" – kantareller trivs
 * gärna i stigkanter, och nära stig betyder att stället går att nå.
 */
import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'

const VZ = 14 // vektorrutornas högsta zoom med full data
const CLASSES: Record<string, number> = { path: 1, track: 2 } // 1 = stig, 2 = skogsbilväg/traktorväg

let urlP: Promise<string> | null = null
/** Adressmallen för vektorrutorna (pekar på aktuell version av datan). */
export const tileUrl = () =>
  (urlP ??= fetch('https://tiles.openfreemap.org/planet')
    .then((r) => r.json())
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => {
      urlP = null
      throw e
    }))

type Line = { cls: number; pts: [number, number][] }
const vtCache = new Map<string, Promise<Line[]>>()

function vectorTile(x: number, y: number) {
  const key = `${x}/${y}`
  let p = vtCache.get(key)
  if (!p) {
    p = (async () => {
      const url = (await tileUrl()).replace('{z}', String(VZ)).replace('{x}', String(x)).replace('{y}', String(y))
      const res = await fetch(url)
      if (!res.ok) return []
      const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())))
      const layer = vt.layers.transportation
      if (!layer) return []
      const lines: Line[] = []
      for (let i = 0; i < layer.length; i++) {
        const feat = layer.feature(i)
        const cls = CLASSES[String(feat.properties.class)]
        if (!cls || feat.type !== 2) continue
        const scale = 256 / feat.extent
        for (const ring of feat.loadGeometry()) lines.push({ cls, pts: ring.map((pt) => [(x * 256 + pt.x * scale), (y * 256 + pt.y * scale)]) })
      }
      return lines
    })()
    p.catch(() => vtCache.delete(key))
    vtCache.set(key, p)
    if (vtCache.size > 300) vtCache.delete(vtCache.keys().next().value!)
  }
  return p
}

/**
 * Rastrerar stigar till ett N×N-rutnät för analysrutan (z, x, y) med
 * marginal M. Värde 1 = stig, 2 = skogsbilväg, 0 = ingen.
 */
export async function pathGrid(z: number, x: number, y: number, n: number, margin: number, ts: number): Promise<Uint8Array> {
  const s = 2 ** (VZ - z) // pixlar på zoom 14 per pixel på analyszoom
  const gx0 = x * ts - margin // rutnätets vänsterkant i analyszoomens pixlar
  const gy0 = y * ts - margin
  const vx0 = Math.floor((gx0 * s) / 256), vx1 = Math.floor(((gx0 + n) * s) / 256)
  const vy0 = Math.floor((gy0 * s) / 256), vy1 = Math.floor(((gy0 + n) * s) / 256)
  const jobs: Promise<Line[]>[] = []
  for (let vy = vy0; vy <= vy1; vy++) for (let vx = vx0; vx <= vx1; vx++) jobs.push(vectorTile(vx, vy))
  const all = (await Promise.all(jobs)).flat()

  const canvas = new OffscreenCanvas(n, n)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // skogsbilvägar först, stigar ovanpå (rött = stig, grönt = väg i kanalerna)
  for (const cls of [2, 1]) {
    ctx.strokeStyle = cls === 1 ? '#ff0000' : '#00ff00'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (const l of all) {
      if (l.cls !== cls) continue
      l.pts.forEach(([px, py], i) => {
        const gx = px / s - gx0
        const gy = py / s - gy0
        if (i) ctx.lineTo(gx, gy)
        else ctx.moveTo(gx, gy)
      })
    }
    ctx.stroke()
  }
  const d = ctx.getImageData(0, 0, n, n).data
  const out = new Uint8Array(n * n)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    if (d[j + 3] < 60) continue
    out[i] = d[j] > d[j + 1] ? 1 : 2
  }
  return out
}
