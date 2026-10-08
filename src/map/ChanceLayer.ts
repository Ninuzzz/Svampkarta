import L from 'leaflet'
import { analysis } from '../analysis/client'
import { FIELD_EDGE, FIELD_SIZE, type ChanceOptions, type Hotspot } from '../analysis/protocol'
import { floodArea } from './flood'

const TS = 256
const SWEDEN = L.latLngBounds([54.9, 10.4], [69.3, 24.4])
/**
 * Chansen räknas alltid på zoom 13 (≈ 10 m per pixel, samma som skogskartan).
 * Vid inzoomning ritas samma fält om i skärmens upplösning – inget räknas om,
 * men kanterna blir skarpa och runda i stället för trappsteg.
 */
export const CHANCE_NATIVE_ZOOM = 13
/** Högsta zoom som ritas egna rutor för (kartan förstorar sedan den sista). */
const MAX_DRAW_ZOOM = 18
/** Utzoomning med valt område: tillåt översikt om området är litet nog. */
const AREA_TILE_BUDGET = 260
/** Färdiga fält som sparas när de scrollas ur bild (≈ 200 kB styck): ~14 MB på mobil, ~32 MB på dator. */
const KEEP = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 72 : 160

/** Minsta zoom där chansen visas: lägre för små valda områden, annars 12. */
export function chanceMinZoom(bounds: [[number, number], [number, number]] | null) {
  if (!bounds) return 12
  const z = CHANCE_NATIVE_ZOOM
  const tx = (lng: number) => ((lng + 180) / 360) * 2 ** z
  const ty = (lat: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z
  const tiles = (Math.floor(tx(bounds[1][1])) - Math.floor(tx(bounds[0][1])) + 1) * (Math.floor(ty(bounds[0][0])) - Math.floor(ty(bounds[1][0])) + 1)
  return tiles <= AREA_TILE_BUDGET ? 10 : tiles <= AREA_TILE_BUDGET * 4 ? 11 : 12
}

export interface ChanceProgress {
  done: number
  total: number
}

interface Field {
  field: Uint8Array
  hotspots: Hotspot[]
  complete: boolean
}

interface Tile {
  canvas: HTMLCanvasElement
  coords: L.Coords
  /** fältet (zoom 13) som rutan ritas från */
  parent: string
}

/**
 * Chanskartan: workern räknar fram sannolikhet per pixel för vald art och
 * hittar toppar (hotspots). Varje fält räknas i två steg – först direkt från
 * skogsdatan, sedan med jordart och terräng – så att något syns snabbt.
 */
export class ChanceLayer extends L.GridLayer {
  private opts: ChanceOptions
  private version = 0
  private progress: ChanceProgress = { done: 0, total: 0 }
  onHotspots?: (spots: Hotspot[], progress: ChanceProgress) => void
  private emitTimer = 0
  /** uträknade fält för nuvarande val (även de som scrollats ur bild) */
  private fields = new Map<string, Field>()
  private loading = new Map<string, Promise<void>>()
  /** rutor som syns nu, per rutnyckel */
  private tiles = new Map<string, Tile>()
  /** markerat område (det man klickat i), per fält: 2 = inne, 1 = kantzon */
  private selection = new Map<string, Uint8Array>()
  private selPoint: { lat: number; lng: number } | null = null
  private selTimer = 0
  /** markeringens storlek i hektar, eller null om man klickat utanför områdena */
  onSelection?: (ha: number | null) => void

  constructor(opts: ChanceOptions, options?: L.GridLayerOptions) {
    super({
      minZoom: 12,
      minNativeZoom: CHANCE_NATIVE_ZOOM,
      maxNativeZoom: MAX_DRAW_ZOOM,
      bounds: SWEDEN,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      ...options,
    })
    this.opts = opts
    this.on('tileunload', (e) => {
      this.tiles.delete(key((e as unknown as { coords: L.Coords }).coords))
      this.emit()
    })
  }

  /** Begränsa vilka rutor som laddas till de valda områdena (null = hela Sverige). */
  setArea(bounds: [[number, number], [number, number]] | null, opts: ChanceOptions) {
    this.opts = opts
    const o = this.options as L.GridLayerOptions
    o.bounds = bounds ? L.latLngBounds(bounds) : SWEDEN
    o.minZoom = chanceMinZoom(bounds)
    this.reset()
    this.redraw()
  }

  /** Ett borttaget lager får inte skicka fler (tomma) uppdateringar. */
  onRemove(map: L.Map) {
    window.clearTimeout(this.emitTimer)
    window.clearTimeout(this.selTimer)
    this.onHotspots = undefined
    this.onSelection = undefined
    this.version++
    return super.onRemove(map)
  }

  /** Nya analysval: räkna om fälten för synliga rutor på plats (ingen blinkning). */
  setOptions(opts: ChanceOptions) {
    this.opts = opts
    this.reset()
    for (const p of new Set([...this.tiles.values()].map((t) => t.parent))) this.load(p).catch(() => {})
    this.emit()
  }

  private reset() {
    this.version++
    this.fields.clear()
    this.loading.clear()
    this.selection.clear()
    this.progress = { done: 0, total: 0 }
  }

  /**
   * Markera det sammanhängande området som punkten ligger i (null = ingen
   * markering). Räknas om när fälten blir klara eller valen ändras.
   */
  select(point: { lat: number; lng: number } | null) {
    this.selPoint = point
    this.reselect()
  }

  private reselect() {
    window.clearTimeout(this.selTimer)
    const before = new Set(this.selection.keys())
    const { mask, ha } = this.selPoint ? floodArea(this.fields, this.selPoint) : { mask: new Map<string, Uint8Array>(), ha: null }
    this.selection = mask
    for (const t of this.tiles.values()) {
      if (!before.has(t.parent) && !mask.has(t.parent)) continue
      const f = this.fields.get(t.parent)
      if (f) draw(t, f.field, mask.get(t.parent))
    }
    this.onSelection?.(ha)
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas')
    // inzoomat: rita i skärmens upplösning, annars räcker en pixel per fältpunkt
    const res = coords.z > CHANCE_NATIVE_ZOOM ? Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1))) : 1
    canvas.width = canvas.height = TS * res
    const parent = parentKey(coords)
    const tile = { canvas, coords, parent }
    this.tiles.set(key(coords), tile)

    const hit = this.fields.get(parent)
    if (hit) {
      draw(tile, hit.field, this.selection.get(parent))
      this.emit()
      queueMicrotask(() => done(undefined, canvas))
    } else {
      this.load(parent).then(
        () => done(undefined, canvas),
        (e) => done(e, canvas),
      )
    }
    return canvas
  }

  /** Räkna fram ett fält (snabbt först, sedan komplett) och rita alla rutor som använder det. */
  private load(parent: string) {
    const running = this.loading.get(parent)
    if (running) return running
    const v = this.version
    const [z, x, y] = parent.split('/').map(Number)
    this.progress.total++
    this.emit()

    const apply = (r: Field) => {
      if (v !== this.version) return
      this.fields.delete(parent)
      this.fields.set(parent, r)
      if (this.fields.size > KEEP) this.fields.delete(this.fields.keys().next().value!)
      for (const t of this.tiles.values()) if (t.parent === parent) draw(t, r.field, this.selection.get(parent))
      // nya data kan ändra (eller fullborda) det markerade området
      if (this.selPoint) {
        window.clearTimeout(this.selTimer)
        this.selTimer = window.setTimeout(() => this.reselect(), 80)
      }
      this.emit()
    }

    let first!: () => void
    const firstPaint = new Promise<void>((resolve) => (first = resolve))
    const all = analysis
      .chance(z, x, y, this.opts, true)
      .then(async (quick) => {
        apply(quick)
        first()
        if (quick.complete || v !== this.version) return
        apply(await analysis.chance(z, x, y, this.opts))
      })
      .finally(() => {
        if (v !== this.version) return
        this.loading.delete(parent)
        this.progress.done = Math.min(this.progress.total, this.progress.done + 1)
        if (this.progress.done >= this.progress.total) this.progress = { done: 0, total: 0 }
        this.emit()
      })
    // rutan räknas som klar så fort något syns; misslyckas redan första steget når felet Leaflet
    const ready = Promise.race([firstPaint, all])
    this.loading.set(parent, ready)
    return ready
  }

  private emit() {
    window.clearTimeout(this.emitTimer)
    this.emitTimer = window.setTimeout(() => {
      const shown = new Set([...this.tiles.values()].map((t) => t.parent))
      const spots: Hotspot[] = []
      for (const p of shown) spots.push(...(this.fields.get(p)?.hotspots ?? []))
      this.onHotspots?.(spots, { ...this.progress })
    }, 120)
  }
}

/* ------------------------------------------------------------------ */
/*  Ritning                                                            */
/* ------------------------------------------------------------------ */

/**
 * Färgskala: ljus lavendel → orkidé → djup magenta. Färger som inte finns i
 * skog, åker eller raps, så att områdena syns mot både flygfoto och karta.
 * Fyllningen är halvgenomskinlig så att stigar och gläntor syns igenom.
 */
const RAMP: [number, [number, number, number, number]][] = [
  [0, [178, 136, 255, 0.3]],
  [0.5, [205, 78, 232, 0.42]],
  [1, [232, 28, 140, 0.56]],
]
/** ytterkant */
const EDGE_RGB = [214, 40, 160] as const
/** det markerade området: vit, bredare kant och lite starkare fyllning */
const SEL_RGB = [255, 255, 255] as const
const SEL_W = 2.6
const SEL_BOOST = 0.12
/** kantens bredd i skärmpixlar */
const EDGE_W = 1.6
/** hur mycket kärnan dras mot skalans starkaste färg */
const CORE_TINT = 0.55
const HI = [...RAMP[RAMP.length - 1][1].slice(0, 3), RAMP[RAMP.length - 1][1][3] + 0.08] as const
/** täckningens lutning: 1-2-1-kärnan går från 64 till 191 över en fältpunkt */
const SLOPE = 127

const LUT = new Float32Array(256 * 4)
for (let k = 0; k < 256; k++) {
  const t = k / 255
  let a = RAMP[0], b = RAMP[RAMP.length - 1]
  for (let j = 0; j < RAMP.length - 1; j++)
    if (t >= RAMP[j][0] && t <= RAMP[j + 1][0]) {
      a = RAMP[j]
      b = RAMP[j + 1]
      break
    }
  const u = (t - a[0]) / (b[0] - a[0] || 1)
  for (let c = 0; c < 4; c++) LUT[k * 4 + c] = a[1][c] + (b[1][c] - a[1][c]) * u
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Rita en kartruta från sitt fält (zoom 13), förstorat med bilinjär interpolation. */
function draw(tile: Tile, field: Uint8Array, sel?: Uint8Array) {
  const { canvas, coords } = tile
  const W = canvas.width
  const scale = 2 ** (coords.z - CHANCE_NATIVE_ZOOM)
  // var rutan börjar i fältets rutnät (pixlar på zoom 13)
  const ox = ((coords.x % scale) * TS) / scale
  const oy = ((coords.y % scale) * TS) / scale
  // skärmpixlar per fältpunkt
  const S = (W / TS) * scale
  const step = 1 / S
  // utzoomat (en skärmpixel per fältpunkt) blir en full kant för dominerande i små fläckar
  const edgeW = Math.min(EDGE_W, 0.5 + 0.55 * S)
  const edgeA = S < 2 ? 0.7 : 0.95
  const F = FIELD_SIZE
  const img = new ImageData(W, W)
  const out = img.data

  for (let py = 0; py < W; py++) {
    // fältindex: rutpixel j har sin mittpunkt på j + 0,5 och ligger på index j + 1
    const fy = oy + (py + 0.5) * step + 0.5
    const y0 = Math.min(F - 2, Math.max(0, Math.floor(fy)))
    const ty = fy - y0
    for (let px = 0; px < W; px++) {
      const fx = ox + (px + 0.5) * step + 0.5
      const x0 = Math.min(F - 2, Math.max(0, Math.floor(fx)))
      const tx = fx - x0
      const i00 = (y0 * F + x0) * 3
      const i10 = i00 + 3
      const i01 = i00 + F * 3
      const i11 = i01 + 3
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty
      const cov = field[i00] * w00 + field[i10] * w10 + field[i01] * w01 + field[i11] * w11
      // avstånd till ytterkanten i skärmpixlar (positivt inåt)
      const d = ((cov - FIELD_EDGE) * S) / SLOPE
      if (d < -0.5) continue
      const inside = clamp01(d + 0.5)
      const val = field[i00 + 1] * w00 + field[i10 + 1] * w10 + field[i01 + 1] * w01 + field[i11 + 1] * w11
      const core = field[i00 + 2] * w00 + field[i10 + 2] * w10 + field[i01 + 2] * w01 + field[i11 + 2] * w11

      // markerat? närmaste fältpunkt (index j ↔ rutpixel j − 1)
      const picked = !!sel && sel[(Math.min(TS - 1, Math.max(0, Math.round(fy) - 1)) << 8) | Math.min(TS - 1, Math.max(0, Math.round(fx) - 1))] > 0

      const k = Math.round(val) * 4
      let r = LUT[k], g = LUT[k + 1], b = LUT[k + 2], a = (LUT[k + 3] + (picked ? SEL_BOOST : 0)) * inside
      // kärnan (där chansen är som högst) får en starkare rosa ton, mjukt intonad
      const cin = clamp01((core - 40) / 180) * CORE_TINT
      r += (HI[0] - r) * cin
      g += (HI[1] - g) * cin
      b += (HI[2] - b) * cin
      a += (HI[3] - a) * cin * inside
      // ytterkant innanför gränsen (vit och bredare runt det markerade området)
      const ec = picked ? SEL_RGB : EDGE_RGB
      const ae = Math.min(inside, clamp01((picked ? SEL_W : edgeW) + 0.5 - d)) * (picked ? 0.95 : edgeA)
      if (ae > 0) {
        const ao = ae + a * (1 - ae)
        r = (ec[0] * ae + r * a * (1 - ae)) / ao
        g = (ec[1] * ae + g * a * (1 - ae)) / ao
        b = (ec[2] * ae + b * a * (1 - ae)) / ao
        a = ao
      }
      const o = (py * W + px) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a * 255
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0)
}

const key = (c: { x: number; y: number; z: number }) => `${c.z}/${c.x}/${c.y}`

function parentKey(c: L.Coords) {
  const s = 2 ** (c.z - CHANCE_NATIVE_ZOOM)
  return `${CHANCE_NATIVE_ZOOM}/${Math.floor(c.x / s)}/${Math.floor(c.y / s)}`
}
