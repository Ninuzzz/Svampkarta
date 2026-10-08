import L from 'leaflet'
import { analysis } from '../analysis/client'
import type { ChanceOptions, Hotspot } from '../analysis/protocol'

const TS = 256
const SWEDEN = L.latLngBounds([54.9, 10.4], [69.3, 24.4])
/**
 * Chansen räknas alltid på zoom 13 (≈ 10 m per pixel, samma som skogskartan).
 * Andra zoomnivåer skalar samma rutor – inget räknas om och inget blinkar
 * bort när man zoomar.
 */
export const CHANCE_NATIVE_ZOOM = 13
/** Utzoomning med valt område: tillåt översikt om området är litet nog. */
const AREA_TILE_BUDGET = 260
/** Färdiga rutor som sparas när de scrollas ur bild (≈ 256 kB styck): ~18 MB på mobil, ~40 MB på dator. */
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

interface LeafletTile {
  el: HTMLCanvasElement
  coords: L.Coords
}

/**
 * Chanskartan: workern räknar fram sannolikhet per pixel för vald art och
 * hittar toppar (hotspots). Varje ruta ritas i två steg – först direkt från
 * skogsdatan, sedan med jordart och terräng – så att något syns snabbt.
 */
export class ChanceLayer extends L.GridLayer {
  private opts: ChanceOptions
  private version = 0
  private spots = new Map<string, Hotspot[]>()
  private live = new Set<string>()
  private progress: ChanceProgress = { done: 0, total: 0 }
  onHotspots?: (spots: Hotspot[], progress: ChanceProgress) => void
  private emitTimer = 0
  /** färdigräknade rutor (även de som scrollats ur bild) för nuvarande val */
  private done = new Map<string, { canvas: HTMLCanvasElement; hotspots: Hotspot[] }>()

  constructor(opts: ChanceOptions, options?: L.GridLayerOptions) {
    super({
      minZoom: 12,
      minNativeZoom: CHANCE_NATIVE_ZOOM,
      maxNativeZoom: CHANCE_NATIVE_ZOOM,
      bounds: SWEDEN,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      ...options,
    })
    this.opts = opts
    this.on('tileunload', (e) => {
      const k = key((e as unknown as { coords: L.Coords }).coords)
      this.live.delete(k)
      this.spots.delete(k)
      this.emit()
    })
  }

  /** Begränsa vilka rutor som laddas till de valda områdena (null = hela Sverige). */
  setArea(bounds: [[number, number], [number, number]] | null, opts: ChanceOptions) {
    this.opts = opts
    const o = this.options as L.GridLayerOptions
    o.bounds = bounds ? L.latLngBounds(bounds) : SWEDEN
    o.minZoom = chanceMinZoom(bounds)
    this.version++
    this.done.clear()
    this.spots.clear()
    this.progress = { done: 0, total: 0 }
    this.redraw()
  }

  /** Ett borttaget lager får inte skicka fler (tomma) uppdateringar. */
  onRemove(map: L.Map) {
    window.clearTimeout(this.emitTimer)
    this.onHotspots = undefined
    this.version++
    return super.onRemove(map)
  }

  /** Nya analysval: räkna om befintliga rutor på plats (ingen blinkning). */
  setOptions(opts: ChanceOptions) {
    this.opts = opts
    const v = ++this.version
    this.done.clear()
    const tiles = Object.values((this as unknown as { _tiles: Record<string, LeafletTile> })._tiles ?? {})
    this.progress = { done: 0, total: tiles.length }
    this.emit()
    for (const t of tiles) {
      const k = key(t.coords)
      analysis
        .chance(t.coords.z, t.coords.x, t.coords.y, opts)
        .then((r) => {
          if (v !== this.version || !this.live.has(k)) return
          paint(t.el, r.rgba)
          this.spots.set(k, r.hotspots)
          this.remember(k, t.el, r.hotspots)
        })
        .catch(() => {})
        .finally(() => this.tick(v))
    }
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const v = this.version
    const k = key(coords)
    this.live.add(k)

    // redan uträknad (scrollad ur bild och tillbaka): visa direkt
    const hit = this.done.get(k)
    if (hit) {
      this.spots.set(k, hit.hotspots)
      this.emit()
      queueMicrotask(() => done(undefined, hit.canvas))
      return hit.canvas
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TS
    this.progress.total++
    this.emit()

    const apply = (r: { rgba: Uint8ClampedArray; hotspots: Hotspot[] }) => {
      if (v !== this.version || !this.live.has(k)) return false
      paint(canvas, r.rgba)
      this.spots.set(k, r.hotspots)
      this.emit()
      return true
    }

    analysis
      .chance(coords.z, coords.x, coords.y, this.opts, true)
      .then(async (quick) => {
        apply(quick)
        done(undefined, canvas)
        if (quick.complete) {
          if (v === this.version) this.remember(k, canvas, quick.hotspots)
          return
        }
        if (v !== this.version) return
        const r = await analysis.chance(coords.z, coords.x, coords.y, this.opts)
        if (apply(r)) this.remember(k, canvas, r.hotspots)
      })
      .catch((e) => done(e, canvas))
      .finally(() => this.tick(v))
    return canvas
  }

  private remember(k: string, canvas: HTMLCanvasElement, hotspots: Hotspot[]) {
    this.done.delete(k)
    this.done.set(k, { canvas, hotspots })
    if (this.done.size > KEEP) this.done.delete(this.done.keys().next().value!)
  }

  private tick(v: number) {
    if (v !== this.version) return
    this.progress.done = Math.min(this.progress.total, this.progress.done + 1)
    if (this.progress.done >= this.progress.total) this.progress = { done: 0, total: 0 }
    this.emit()
  }

  private emit() {
    window.clearTimeout(this.emitTimer)
    this.emitTimer = window.setTimeout(() => {
      this.onHotspots?.([...this.spots.values()].flat(), { ...this.progress })
    }, 120)
  }
}

function paint(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray) {
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), TS, TS), 0, 0)
}

const key = (c: { x: number; y: number; z: number }) => `${c.z}/${c.x}/${c.y}`
