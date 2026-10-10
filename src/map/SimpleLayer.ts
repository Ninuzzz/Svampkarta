/**
 * Enkel karta: marktäcke (NMD), vägar, stigar, vattendrag och ortnamn (OpenStreetMap via
 * OpenFreeMap), ritad i webbläsaren i appens egna färger.
 *
 * Allt den behöver hämtas redan av analysen – samma marktäcke på zoom 13 och samma vektorrutor på
 * zoom 14 som "nära stig" använder. Ett område som sparats för offline har därför en bakgrundskarta
 * även där flygfotot saknas, utan att en enda kartbild laddas ner i förväg (det tillåter inte
 * kartleverantörerna).
 */
import L from 'leaflet'
import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
import { analysis } from '../analysis/client'
import { CODE_INFO } from '../analysis/nmdcodes'
import { tileUrl } from '../analysis/paths'

const TS = 256
/** Marktäcket hämtas alltid på analysens zoom (det som finns sparat), vektorrutorna på zoom 14. */
const LAND_ZOOM = 13
const VECTOR_ZOOM = 14
/** Rutor ritas i dubbel upplösning, så att linjer och text är skarpa även uppförstorade. */
const SCALE = 2

/* ---------------------------- Marktäcke ---------------------------- */

function landColor(code: number): [number, number, number] | null {
  const c = CODE_INFO[code]
  if (!c) return null
  if (c.water) return [169, 203, 224]
  if (c.mire) return [214, 216, 178]
  if (c.forest) {
    if (c.young) return [224, 228, 186]
    if (c.wet) return [184, 208, 172]
    if (c.conifer) return [190, 208, 160]
    if ((c.leaf ?? 0) >= 80) return [212, 226, 176]
    return [201, 217, 168]
  }
  if (code === 51) return [208, 197, 176]
  if (c.built || c.road) return [232, 224, 206]
  if (code === 3) return [243, 235, 204]
  return [240, 234, 214]
}

const LAND_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let code = 0; code < 256; code++) {
    const rgb = landColor(code)
    if (rgb) lut.set([...rgb, 255], code * 4)
  }
  return lut
})()

/* ---------------------------- Vektorrutor ---------------------------- */

type Style = 'major' | 'minor' | 'track' | 'path' | 'rail' | 'stream'
const ROAD: Record<string, Style> = {
  motorway: 'major',
  trunk: 'major',
  primary: 'major',
  secondary: 'major',
  tertiary: 'major',
  minor: 'minor',
  service: 'minor',
  track: 'track',
  path: 'path',
  rail: 'rail',
}
/** Ortnamn: lägsta rutzoom där de ritas, och textstorlek. */
const PLACE: Record<string, { min: number; size: number }> = {
  city: { min: 13, size: 15 },
  town: { min: 13, size: 14 },
  village: { min: 13, size: 12.5 },
  suburb: { min: 14, size: 11.5 },
  hamlet: { min: 14, size: 11.5 },
  neighbourhood: { min: 15, size: 11 },
  isolated_dwelling: { min: 15, size: 11 },
}

interface Label {
  x: number
  y: number
  text: string
  size: number
  min: number
  water: boolean
}
interface Vector {
  /** linjer per stil, i rutans egna 0–256-koordinater */
  lines: Record<Style, number[][]>
  labels: Label[]
}

const EMPTY: Vector = { lines: { major: [], minor: [], track: [], path: [], rail: [], stream: [] }, labels: [] }
const vectors = new Map<string, Promise<Vector>>()

function vector(x: number, y: number): Promise<Vector> {
  const key = `${x}/${y}`
  let p = vectors.get(key)
  if (!p) {
    p = (async () => {
      const url = (await tileUrl()).replace('{z}', String(VECTOR_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y))
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())))
      const out: Vector = { lines: { major: [], minor: [], track: [], path: [], rail: [], stream: [] }, labels: [] }
      const lines = (name: string, style: (cls: string) => Style | undefined) => {
        const layer = vt.layers[name]
        for (let i = 0; layer && i < layer.length; i++) {
          const f = layer.feature(i)
          const s = f.type === 2 ? style(String(f.properties.class)) : undefined
          if (!s) continue
          const k = TS / f.extent
          for (const ring of f.loadGeometry()) out.lines[s].push(ring.flatMap((pt) => [pt.x * k, pt.y * k]))
        }
      }
      lines('transportation', (cls) => ROAD[cls])
      lines('waterway', () => 'stream')
      const names = (name: string, water: boolean) => {
        const layer = vt.layers[name]
        for (let i = 0; layer && i < layer.length; i++) {
          const f = layer.feature(i)
          const text = f.properties.name
          const rule = water ? { min: 14, size: 11.5 } : PLACE[String(f.properties.class)]
          if (f.type !== 1 || typeof text !== 'string' || !text || !rule) continue
          const pt = f.loadGeometry()[0]?.[0]
          if (pt) out.labels.push({ x: (pt.x * TS) / f.extent, y: (pt.y * TS) / f.extent, text, water, ...rule })
        }
      }
      names('place', false)
      names('water_name', true)
      return out
    })()
    // en ruta som inte gick att hämta (utan nät, utanför det sparade) ritas tom men försöks igen senare
    p.catch(() => vectors.delete(key))
    vectors.set(key, p)
    if (vectors.size > 240) vectors.delete(vectors.keys().next().value!)
  }
  return p
}

/* ---------------------------- Lagret ---------------------------- */

const STROKES: { style: Style; color: string; width: number; dash?: number[] }[] = [
  { style: 'stream', color: '#8fbad3', width: 1.2 },
  { style: 'track', color: '#8c7a4f', width: 1.1, dash: [5, 2.5] },
  { style: 'path', color: '#5d4a1f', width: 1.1, dash: [1.5, 2.5] },
  { style: 'rail', color: '#8a8577', width: 1, dash: [4, 3] },
  { style: 'minor', color: '#c2b38a', width: 2.6 },
  { style: 'major', color: '#b3a172', width: 4 },
  { style: 'minor', color: '#fffdf5', width: 1.5 },
  { style: 'major', color: '#fffdf5', width: 2.6 },
]

export class SimpleLayer extends L.GridLayer {
  constructor(options?: L.GridLayerOptions) {
    super({
      minZoom: 12,
      minNativeZoom: LAND_ZOOM,
      maxNativeZoom: 15,
      bounds: L.latLngBounds([54.9, 10.4], [69.3, 24.4]),
      updateWhenIdle: true,
      keepBuffer: 1,
      ...options,
    })
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TS * SCALE
    this.draw(canvas, coords).then(
      () => done(undefined, canvas),
      (e) => done(e as Error, canvas),
    )
    return canvas
  }

  private async draw(canvas: HTMLCanvasElement, { z, x, y }: L.Coords) {
    const ctx = canvas.getContext('2d')!
    ctx.scale(SCALE, SCALE)

    // Marktäcket: den del av zoom 13-rutan som den här rutan täcker, mjukt uppförstorad
    const up = 2 ** (z - LAND_ZOOM)
    const land = analysis.forest(LAND_ZOOM, Math.floor(x / up), Math.floor(y / up)).catch(() => null)
    // Vektorrutorna som rutan täcker, plus en ruta runt om: namn och linjer som sticker in över kanten ritas då också
    const k = 2 ** (z - VECTOR_ZOOM) // rutans pixlar per vektorrutepixel
    const v0x = Math.floor(x / k), v0y = Math.floor(y / k)
    const v1x = Math.floor((x + 1) / k - 1e-9), v1y = Math.floor((y + 1) / k - 1e-9)
    const jobs: Promise<{ vx: number; vy: number; v: Vector }>[] = []
    for (let vy = v0y - 1; vy <= v1y + 1; vy++)
      for (let vx = v0x - 1; vx <= v1x + 1; vx++)
        jobs.push(
          vector(vx, vy).then(
            (v) => ({ vx, vy, v }),
            () => ({ vx, vy, v: EMPTY }),
          ),
        )

    const codes = await land
    if (codes) {
      const src = document.createElement('canvas')
      src.width = src.height = TS
      const sctx = src.getContext('2d')!
      const img = sctx.createImageData(TS, TS)
      for (let i = 0; i < TS * TS; i++) {
        const c = codes[i] * 4
        img.data[i * 4] = LAND_LUT[c]
        img.data[i * 4 + 1] = LAND_LUT[c + 1]
        img.data[i * 4 + 2] = LAND_LUT[c + 2]
        img.data[i * 4 + 3] = LAND_LUT[c + 3]
      }
      sctx.putImageData(img, 0, 0)
      const part = TS / up
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(src, (x % up) * part, (y % up) * part, part, part, 0, 0, TS, TS)
    }

    const tiles = await Promise.all(jobs)
    if (!codes && tiles.every((t) => t.v === EMPTY)) throw new Error('Ingen sparad kartdata här')
    /** vektorrutans hörn i den här rutans koordinater */
    const origin = (vx: number, vy: number) => [vx * TS * k - x * TS, vy * TS * k - y * TS] as const

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of STROKES) {
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.setLineDash(s.dash ?? [])
      ctx.beginPath()
      for (const t of tiles) {
        const [ox, oy] = origin(t.vx, t.vy)
        for (const line of t.v.lines[s.style]) {
          for (let i = 0; i < line.length; i += 2) {
            const px = ox + line[i] * k, py = oy + line[i + 1] * k
            if (i) ctx.lineTo(px, py)
            else ctx.moveTo(px, py)
          }
        }
      }
      ctx.stroke()
    }

    ctx.setLineDash([])
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 251, 235, 0.92)'
    for (const t of tiles) {
      const [ox, oy] = origin(t.vx, t.vy)
      for (const l of t.v.labels) {
        if (z < l.min) continue
        const px = ox + l.x * k, py = oy + l.y * k
        // långt utanför rutan: når inte in
        if (px < -140 || px > TS + 140 || py < -20 || py > TS + 20) continue
        ctx.font = `${l.water ? 'italic 500' : '650'} ${l.size}px 'Figtree Variable', ui-sans-serif, system-ui, sans-serif`
        ctx.fillStyle = l.water ? '#3f6f8f' : '#2d4600'
        ctx.strokeText(l.text, px, py)
        ctx.fillText(l.text, px, py)
      }
    }
  }
}
