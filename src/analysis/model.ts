/**
 * Modellens formel per pixel. Ren TypeScript utan DOM – används av både
 * analys-workern (kartan) och träningsskriptet (scripts/train), så att det
 * som tränas är exakt det som körs i appen.
 */
import type { SpeciesModel, TreeKey } from './species'

// Ordningen får inte ändras (index sparas i träningsdatan) – nya typer läggs sist
export const TREE_KEYS: (TreeKey | null)[] = [null, 'tall', 'gran', 'barrbland', 'lovbarr', 'triv', 'adel', 'fjall', 'hygge', 'mire', 'oppen']
export const SOIL_GROUPS = [null, 'sand', 'moran', 'lera', 'torv', 'berg'] as const

/** Artoberoende egenskaper i en punkt. */
export interface PixelFeatures {
  /** index i TREE_KEYS (0 = ingen skog/myr) */
  tree: number
  /** 0 fastmark, 1 våtmark, 2 myr */
  wet: number
  /** jordartsgrupp 0–5 (0 = okänd) */
  soil: number
  /** relativ höjd −1…1, null om höjddata saknas */
  tpi: number | null
  /** sydläge −1…1 viktat med lutning */
  south: number
  /** kant mot öppen mark 0–1 */
  edge: number
  /** andel våtmark/vatten i närheten 0–1 */
  wetNb: number
  /** bebyggelsefaktor 0,1–1 */
  urban: number
  /** ädellövsfaktor 0,25–1 */
  noble: number
  /** skogsrik omgivning 0–1 */
  forest: number
  /** skogsålder (år), 0 = okänd */
  age: number
  /** andel stig inom ~30 m, null om stigdata saknas */
  path: number | null
}

export interface Parts {
  habitat: number
  soil: number
  terrain: number
  edges: number
  age: number
  path: number
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/** Skogsålderns inverkan (0,35–1). Okänd ålder eller art utan krav → 1. */
export function ageFactor(pref: SpeciesModel['age'], age: number) {
  if (!pref || !age) return 1
  const [a, b, c, d, old] = pref
  if (age < a) return 0.35
  if (age < b) return 0.35 + (0.65 * (age - a)) / (b - a)
  if (age <= c) return 1
  if (age < d) return 1 - ((1 - old) * (age - c)) / (d - c)
  return old
}

/** Uppslagstabeller per art – så att pixelslingan bara gör aritmetik. */
export interface SpeciesLut {
  tree: Float32Array
  soil: Float32Array
}

const luts = new WeakMap<SpeciesModel, SpeciesLut>()
export function lut(sp: SpeciesModel): SpeciesLut {
  let l = luts.get(sp)
  if (!l) {
    l = {
      tree: Float32Array.from(TREE_KEYS, (k) => (k ? sp.tree[k] ?? 0 : 0)),
      soil: Float32Array.from(SOIL_GROUPS, (k) => (k ? Math.pow(sp.soil[k], 0.8) : 0.85)),
    }
    luts.set(sp, l)
  }
  return l
}

/**
 * Modellens delar i en punkt. Fyller `out` och returnerar produkten
 * (0 = arten växer inte här).
 */
const OPEN = TREE_KEYS.indexOf('oppen')

export function score(sp: SpeciesModel, L: SpeciesLut, fv: PixelFeatures, out: Parts): number {
  let tw = L.tree[fv.tree]
  if (!tw) return 0
  // Öppen naturmark räknas bara i skogsbygd (hällmark, glänta, hed) – inte betes- och gräsmark bland åkrarna
  if (fv.tree === OPEN) tw *= fv.forest * fv.forest
  const ww = fv.wet === 2 ? 1 : fv.wet === 1 ? sp.wet.wet : sp.wet.dry
  if (!ww) return 0
  const sw = L.soil[fv.soil]
  const terrain = fv.tpi === null ? 1 : clamp(1 + sp.tpi * 1.2 * fv.tpi + sp.south * 1.5 * fv.south, 0.55, 1.35)
  let edges = (1 + sp.openEdge * fv.edge + sp.wetEdge * fv.wetNb) * fv.urban
  if (sp.needsNoble) edges *= fv.noble
  if (fv.wet !== 2) edges *= 1 - sp.continuity * (1 - fv.forest)
  const age = ageFactor(sp.age, fv.age)
  const path = fv.path !== null && sp.pathEdge ? 1 + sp.pathEdge * Math.min(1, fv.path * 8) : 1
  out.habitat = tw * ww
  out.soil = sw
  out.terrain = terrain
  out.edges = edges
  out.age = age
  out.path = path
  return tw * ww * sw * terrain * edges * age * path
}

export const product = (p: Parts) => p.habitat * p.soil * p.terrain * p.edges * p.age * p.path
