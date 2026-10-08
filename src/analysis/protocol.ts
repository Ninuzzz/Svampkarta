import type { SpeciesId, Target, TreeKey } from './species'

export type ChanceMode = 'nu' | 'potential'

export interface Find {
  /** webbmercator-koordinater */
  mx: number
  my: number
  sp: SpeciesId
}

/** "Hittade inget" – sänker chansen i närheten, avtar med tiden (w 0–1). */
export interface Miss {
  mx: number
  my: number
  sp: SpeciesId
  w: number
}

export interface Signature {
  n: number
  tree: Partial<Record<TreeKey, number>>
  /** antal per jordartsgrupp, index 0–5 */
  soil: number[]
}

export interface ChanceOptions {
  target: Target
  mode: ChanceMode
  doy: number
  /** väderfaktor 0–1 per art (beräknad i huvudtråden från Open-Meteo) */
  weather: Partial<Record<SpeciesId, number>>
  finds: Find[]
  misses: Miss[]
  sigs: Partial<Record<SpeciesId, Signature>>
  /** visa bara områden och toppar med minst denna chans (0–1) */
  minChance: number
  /** dölj sammanhängande områden mindre än detta (hektar) */
  minAreaHa: number
  /** analysera bara inom dessa kommuner (id), tom = hela kartvyn */
  areas: string[]
}

export interface Hotspot {
  lat: number
  lng: number
  score: number
  species: SpeciesId
  areaHa: number
}

export interface FactorBreakdown {
  habitat: number
  soil: number
  terrain: number
  edges: number
  age: number
  path: number
  continuity: number
  season: number
  weather: number
  range: number
  learning: number
}

export interface SpeciesResult {
  id: SpeciesId
  /** chans i punkten 0–1 */
  chance: number
  /** genomsnittlig chans i hela området 0–1 */
  standChance: number
  factors: FactorBreakdown
}

export interface InspectResult {
  code: number
  label: string
  soilGroup: number
  soilName: string
  elevation: number | null
  /** relativ höjd mot omgivningen (m), + = krön, − = svacka */
  tpi: number | null
  slope: number | null
  aspect: string | null
  roadDistance: number | null
  waterDistance: number | null
  /** skogsålder (år) enligt SLU skogsålder 2025, om känd */
  forestAge: number | null
  /** avstånd till närmaste stig resp. skogsbilväg (m) */
  pathDistance: number | null
  trackDistance: number | null
  standHa: number
  stand: { mask: Uint8Array; w: number; h: number; west: number; north: number; east: number; south: number } | null
  species: SpeciesResult[]
}

export type WorkerRequest =
  | { id: number; type: 'forest'; z: number; x: number; y: number }
  | { id: number; type: 'chance'; z: number; x: number; y: number; opts: ChanceOptions; quick?: boolean }
  | { id: number; type: 'inspect'; lat: number; lng: number; opts: ChanceOptions }
  | { id: number; type: 'signature'; lat: number; lng: number }
  | { id: number; type: 'features'; lat: number; lng: number; window?: boolean }
  | { id: number; type: 'config'; training: boolean }

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
