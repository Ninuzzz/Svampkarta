import L from 'leaflet'
import { CLASSES, colorFor, matches, type ForestFilter } from './nmd'
import { analysis } from '../analysis/client'

const TS = 256

interface CachedTile {
  canvas: HTMLCanvasElement
  codes: Uint8Array
}

/**
 * Skogsområden: NMD-klasser som workern jämnat ut till sammanhängande ytor.
 * Färgas och kantas lokalt efter filtret – ändrade filter kräver inga nya anrop.
 */
export class ForestLayer extends L.GridLayer {
  private filter: ForestFilter
  private lut = new Uint8ClampedArray(256 * 4)
  private visible = new Uint8Array(256)
  private tiles = new Map<string, CachedTile>()

  constructor(filter: ForestFilter, options?: L.GridLayerOptions) {
    super({
      minZoom: 9,
      maxNativeZoom: 14,
      bounds: L.latLngBounds([54.9, 10.4], [69.3, 24.4]),
      updateWhenIdle: true,
      keepBuffer: 2,
      ...options,
    })
    this.filter = filter
    this.buildLut()
    this.on('tileunload', (e) => this.tiles.delete(key((e as unknown as { coords: L.Coords }).coords)))
  }

  setFilter(filter: ForestFilter) {
    this.filter = filter
    this.buildLut()
    for (const t of this.tiles.values()) this.paint(t)
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TS
    analysis
      .forest(coords.z, coords.x, coords.y)
      .then((codes) => {
        const t = { canvas, codes }
        this.tiles.set(key(coords), t)
        this.paint(t)
        done(undefined, canvas)
      })
      .catch((e) => done(e, canvas))
    return canvas
  }

  private buildLut() {
    this.lut.fill(0)
    this.visible.fill(0)
    const alpha = Math.round(this.filter.opacity * 255)
    for (const [code, cls] of CLASSES) {
      if (!matches(cls, this.filter)) continue
      const [r, g, b] = colorFor(cls)
      this.lut.set([r, g, b, alpha], code * 4)
      this.visible[code] = 1
    }
  }

  /** Fyllnad + ljus kantlinje mellan områden, likt ritade polygoner. */
  private paint(t: CachedTile) {
    const ctx = t.canvas.getContext('2d')!
    const out = ctx.createImageData(TS, TS)
    const o = out.data
    const { codes } = t
    const lut = this.lut
    const vis = this.visible
    const edgeA = Math.min(255, Math.round(this.filter.opacity * 255) + 70)
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        const i = y * TS + x
        const c = codes[i]
        const j = i * 4
        if (!vis[c]) continue
        const r = x < TS - 1 ? codes[i + 1] : c
        const b = y < TS - 1 ? codes[i + TS] : c
        const l = x > 0 ? codes[i - 1] : c
        const u = y > 0 ? codes[i - TS] : c
        if (r !== c || b !== c || l !== c || u !== c) {
          o[j] = 255
          o[j + 1] = 251
          o[j + 2] = 235
          o[j + 3] = edgeA
          continue
        }
        const k = c * 4
        o[j] = lut[k]
        o[j + 1] = lut[k + 1]
        o[j + 2] = lut[k + 2]
        o[j + 3] = lut[k + 3]
      }
    ctx.putImageData(out, 0, 0)
  }
}

const key = (c: { x: number; y: number; z: number }) => `${c.z}/${c.x}/${c.y}`
