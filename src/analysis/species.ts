/**
 * Artmodeller för chanskartan.
 *
 * Varje art beskrivs med expertbedömda vikter (0–1) för hur väl den trivs med
 * olika trädslag, fuktighet, jordarter, terrängläge och kanteffekter, samt en
 * fenologi (säsongskurva) och väderkänslighet. Vikterna bygger på allmän
 * svensk svamp- och bärkunskap – de är tänkta att justeras efterhand och
 * kompletteras av dina egna fynd (se `learning` i modellen).
 *
 * Filen delas mellan huvudtråden och analys-workern och får därför inte
 * importera React eller DOM-saker.
 */

import { TRAINED } from './trained.ts'

/** 'oppen' = öppen naturmark (hällmark, ljunghed, glänta) – inte åker eller bebyggelse */
export type TreeKey = 'tall' | 'gran' | 'barrbland' | 'lovbarr' | 'triv' | 'adel' | 'fjall' | 'hygge' | 'mire' | 'oppen'
export type SoilKey = 'sand' | 'moran' | 'lera' | 'torv' | 'berg'
export type SpeciesId =
  | 'kantarell'
  | 'trattkantarell'
  | 'svarttrumpet'
  | 'karljohan'
  | 'taggsvamp'
  | 'farticka'
  | 'smorsopp'
  | 'blabar'
  | 'lingon'
  | 'hjortron'
  | 'hallon'
  | 'tranbar'
  | 'smultron'

export interface SpeciesModel {
  id: SpeciesId
  name: string
  kind: 'svamp' | 'bar'
  /** kort beskrivning av var arten trivs */
  habitat: string
  tree: Partial<Record<TreeKey, number>>
  /** vikt för skog på fastmark resp. våtmark */
  wet: { dry: number; wet: number }
  soil: Record<SoilKey, number>
  /** +: gillar höjder/torrt läge, −: gillar svackor/fuktigt läge (−0.3…0.3) */
  tpi: number
  /** +: gillar sydsluttningar (sol), −: gillar skuggiga nordsluttningar */
  south: number
  /** bonus för kanter mot öppen mark/hygge (0–0.5) */
  openEdge: number
  /** bonus för närhet till våtmark/vatten (0–0.4) */
  wetEdge: number
  /** behöver ädellövträd (ek/bok) i närheten */
  needsNoble?: boolean
  /** hur mycket arten kräver sammanhängande lämplig skog (0–0.6) */
  continuity: number
  /** säsongstopp som dag på året vid 56°N, bredd i dagar, förskjutning dagar per breddgrad norrut */
  peak: number
  spread: number
  latShift: number
  /** optimal medeltemperatur senaste 10 dygnen (svampar) */
  tempOpt: number
  /** hur mycket nederbörd/markfukt styr fruktkroppsbildningen (0–1) */
  rainSens: number
  /** tål frost bättre än de flesta */
  frostHardy?: boolean
  /** artens utbredning: faktor som funktion av breddgrad */
  range?: (lat: number) => number
  /** hur eftertraktad arten är (0–1) – används när flera arter visas samtidigt */
  value: number
  /**
   * Skogsålder (år, SLU skogsålder 2025): [börjar, bra från, bra till, avtar till, faktor därefter].
   * Under "börjar" ges 0,35. Utelämnas för arter där åldern inte spelar roll.
   */
  age?: [number, number, number, number, number]
  /** bonus nära stigar och skogsbilvägar (0–0,3) */
  pathEdge?: number
  color: string
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Expertbedömda vikter (utgångsläge för träningen). */
export const EXPERT_MODELS: SpeciesModel[] = [
  {
    id: 'kantarell',
    name: 'Kantarell',
    kind: 'svamp',
    habitat: 'Mossig barr- och blandskog på morän, gärna nära stigar',
    tree: { tall: 0.85, gran: 0.9, barrbland: 1, lovbarr: 0.9, triv: 0.55, adel: 0.45, fjall: 0.3, hygge: 0.04 },
    wet: { dry: 1, wet: 0.55 },
    soil: { sand: 0.8, moran: 1, lera: 0.5, torv: 0.3, berg: 0.75 },
    tpi: 0,
    south: 0,
    openEdge: 0.12,
    wetEdge: 0.08,
    continuity: 0.35,
    peak: 236,
    spread: 38,
    latShift: 2.5,
    tempOpt: 16,
    rainSens: 0.9,
    value: 1,
    age: [12, 30, 120, 200, 0.9],
    pathEdge: 0.15,
    color: '#e9a92a',
  },
  {
    id: 'trattkantarell',
    name: 'Trattkantarell',
    kind: 'svamp',
    habitat: 'Fuktig, mossig granskog – gärna i svackor och nära myrkanter',
    tree: { tall: 0.6, gran: 1, barrbland: 0.95, lovbarr: 0.75, triv: 0.4, adel: 0.25, fjall: 0.2, hygge: 0.02, mire: 0.05 },
    wet: { dry: 0.6, wet: 1 },
    soil: { sand: 0.45, moran: 1, lera: 0.6, torv: 0.85, berg: 0.4 },
    tpi: -0.25,
    south: -0.05,
    openEdge: 0,
    wetEdge: 0.3,
    continuity: 0.45,
    peak: 272,
    spread: 26,
    latShift: -2.5,
    tempOpt: 10,
    rainSens: 0.8,
    frostHardy: true,
    value: 0.95,
    age: [20, 45, 200, 300, 1],
    pathEdge: 0.05,
    color: '#8a6a3f',
  },
  {
    id: 'svarttrumpet',
    name: 'Svart trumpetsvamp',
    kind: 'svamp',
    habitat: 'Ädellövskog med ek och bok på lerig, näringsrik mark',
    tree: { tall: 0.05, gran: 0.2, barrbland: 0.15, lovbarr: 0.45, triv: 0.45, adel: 1 },
    wet: { dry: 1, wet: 0.6 },
    soil: { sand: 0.3, moran: 0.8, lera: 1, torv: 0.1, berg: 0.5 },
    tpi: 0,
    south: 0.05,
    openEdge: 0,
    wetEdge: 0.05,
    needsNoble: true,
    continuity: 0.3,
    peak: 262,
    spread: 28,
    latShift: -1,
    tempOpt: 14,
    rainSens: 0.9,
    range: (lat) => clamp((60.5 - lat) / 2.5, 0.1, 1),
    value: 0.9,
    color: '#3b3530',
  },
  {
    id: 'karljohan',
    name: 'Karljohansvamp',
    kind: 'svamp',
    habitat: 'Gran, tall och björk på torr, sandig mark och i skogsbryn',
    tree: { tall: 0.85, gran: 0.9, barrbland: 0.9, lovbarr: 1, triv: 0.8, adel: 0.55, fjall: 0.5, hygge: 0.05 },
    wet: { dry: 1, wet: 0.35 },
    soil: { sand: 1, moran: 0.85, lera: 0.45, torv: 0.15, berg: 0.6 },
    tpi: 0.15,
    south: 0.05,
    openEdge: 0.15,
    wetEdge: 0,
    continuity: 0.25,
    peak: 240,
    spread: 24,
    latShift: -1,
    tempOpt: 15,
    rainSens: 1,
    value: 1,
    age: [8, 20, 90, 150, 0.8],
    pathEdge: 0.12,
    color: '#8b5a2b',
  },
  {
    id: 'taggsvamp',
    name: 'Blek taggsvamp',
    kind: 'svamp',
    habitat: 'Mossig granskog och blandskog',
    tree: { tall: 0.6, gran: 1, barrbland: 0.95, lovbarr: 0.8, triv: 0.45, adel: 0.6, hygge: 0.03 },
    wet: { dry: 1, wet: 0.55 },
    soil: { sand: 0.6, moran: 1, lera: 0.6, torv: 0.2, berg: 0.5 },
    tpi: 0,
    south: 0,
    openEdge: 0.05,
    wetEdge: 0.05,
    continuity: 0.4,
    peak: 262,
    spread: 28,
    latShift: -1.5,
    tempOpt: 13,
    rainSens: 0.85,
    value: 0.8,
    age: [20, 45, 200, 300, 1],
    pathEdge: 0.05,
    color: '#e3c48f',
  },
  {
    id: 'farticka',
    name: 'Fårticka',
    kind: 'svamp',
    habitat: 'Mager, gärna kalkpåverkad granskog',
    tree: { tall: 0.4, gran: 1, barrbland: 0.8, lovbarr: 0.5, triv: 0.15, adel: 0.1 },
    wet: { dry: 1, wet: 0.5 },
    soil: { sand: 0.7, moran: 1, lera: 0.45, torv: 0.15, berg: 0.7 },
    tpi: 0.05,
    south: 0,
    openEdge: 0,
    wetEdge: 0,
    continuity: 0.45,
    peak: 252,
    spread: 24,
    latShift: -1.5,
    tempOpt: 13,
    rainSens: 0.8,
    value: 0.7,
    age: [30, 60, 200, 300, 1],
    pathEdge: 0,
    color: '#d8cfbd',
  },
  {
    id: 'smorsopp',
    name: 'Smörsopp',
    kind: 'svamp',
    habitat: 'Ung tallskog på sand, vägkanter och planteringar',
    tree: { tall: 1, gran: 0.15, barrbland: 0.5, lovbarr: 0.3, triv: 0.05, adel: 0.05, hygge: 0.15 },
    wet: { dry: 1, wet: 0.4 },
    soil: { sand: 1, moran: 0.6, lera: 0.3, torv: 0.1, berg: 0.6 },
    tpi: 0.1,
    south: 0.05,
    openEdge: 0.18,
    wetEdge: 0,
    continuity: 0.15,
    peak: 262,
    spread: 28,
    latShift: -1.5,
    tempOpt: 13,
    rainSens: 0.9,
    value: 0.72,
    age: [4, 10, 35, 70, 0.45],
    pathEdge: 0.12,
    color: '#9a6a2e',
  },
  {
    id: 'blabar',
    name: 'Blåbär',
    kind: 'bar',
    habitat: 'Skuggig, frisk granskog på morän',
    tree: { tall: 0.65, gran: 1, barrbland: 0.95, lovbarr: 0.8, triv: 0.4, adel: 0.15, fjall: 0.6, hygge: 0.12, oppen: 0.25 },
    wet: { dry: 1, wet: 0.7 },
    soil: { sand: 0.6, moran: 1, lera: 0.5, torv: 0.6, berg: 0.6 },
    tpi: -0.05,
    south: -0.08,
    openEdge: 0,
    wetEdge: 0.05,
    continuity: 0.4,
    peak: 203,
    spread: 16,
    latShift: 3,
    tempOpt: 16,
    rainSens: 0.25,
    value: 1,
    age: [15, 40, 200, 300, 1],
    pathEdge: 0.05,
    color: '#3d5a9e',
  },
  {
    id: 'lingon',
    name: 'Lingon',
    kind: 'bar',
    habitat: 'Torr, gles tallskog på sand och berghällar',
    tree: { tall: 1, gran: 0.45, barrbland: 0.8, lovbarr: 0.45, triv: 0.2, adel: 0.05, fjall: 0.6, hygge: 0.3, oppen: 0.5 },
    wet: { dry: 1, wet: 0.45 },
    soil: { sand: 1, moran: 0.8, lera: 0.25, torv: 0.3, berg: 0.9 },
    tpi: 0.2,
    south: 0.1,
    openEdge: 0.08,
    wetEdge: 0,
    continuity: 0.25,
    peak: 252,
    spread: 26,
    latShift: -1,
    tempOpt: 14,
    rainSens: 0.2,
    value: 1,
    age: [12, 35, 200, 300, 1],
    pathEdge: 0.08,
    color: '#c2283c',
  },
  {
    id: 'hjortron',
    name: 'Hjortron',
    kind: 'bar',
    habitat: 'Öppna myrar, framför allt i norra Sverige',
    tree: { mire: 1, tall: 0.15, gran: 0.05, barrbland: 0.05, fjall: 0.3, oppen: 0.1 },
    wet: { dry: 0, wet: 1 },
    soil: { sand: 0.3, moran: 0.3, lera: 0.2, torv: 1, berg: 0.2 },
    tpi: -0.2,
    south: 0,
    openEdge: 0,
    wetEdge: 0,
    continuity: 0.3,
    peak: 205,
    spread: 11,
    latShift: 3,
    tempOpt: 14,
    rainSens: 0.15,
    range: (lat) => clamp((lat - 56.5) / 3, 0.12, 1),
    value: 1,
    color: '#e58a2b',
  },
  {
    id: 'hallon',
    name: 'Hallon',
    kind: 'bar',
    habitat: 'Hyggen, skogsbryn och ungskog',
    tree: { hygge: 1, triv: 0.4, lovbarr: 0.3, barrbland: 0.15, tall: 0.1, gran: 0.1, adel: 0.2, oppen: 0.45 },
    wet: { dry: 1, wet: 0.5 },
    soil: { sand: 0.7, moran: 1, lera: 0.9, torv: 0.4, berg: 0.6 },
    tpi: 0,
    south: 0.1,
    openEdge: 0.35,
    wetEdge: 0,
    continuity: 0,
    peak: 212,
    spread: 15,
    latShift: 3,
    tempOpt: 16,
    rainSens: 0.2,
    value: 0.85,
    age: [0, 0, 8, 25, 0.35],
    pathEdge: 0.15,
    color: '#d0335a',
  },
  {
    id: 'tranbar',
    name: 'Tranbär',
    kind: 'bar',
    habitat: 'Mossar och myrar',
    tree: { mire: 1, tall: 0.1, oppen: 0.1 },
    wet: { dry: 0, wet: 1 },
    soil: { sand: 0.2, moran: 0.2, lera: 0.2, torv: 1, berg: 0.1 },
    tpi: -0.2,
    south: 0,
    openEdge: 0,
    wetEdge: 0,
    continuity: 0.3,
    peak: 275,
    spread: 25,
    latShift: -1,
    tempOpt: 10,
    rainSens: 0.1,
    value: 0.75,
    color: '#9e1f33',
  },
  {
    id: 'smultron',
    name: 'Smultron',
    kind: 'bar',
    habitat: 'Soliga gläntor, hyggen och skogsbryn',
    tree: { hygge: 0.7, adel: 0.3, triv: 0.3, lovbarr: 0.2, tall: 0.15, oppen: 0.55 },
    wet: { dry: 1, wet: 0.2 },
    soil: { sand: 0.9, moran: 0.8, lera: 0.6, torv: 0.1, berg: 0.8 },
    tpi: 0.1,
    south: 0.25,
    openEdge: 0.4,
    wetEdge: 0,
    continuity: 0,
    peak: 182,
    spread: 14,
    latShift: 3,
    tempOpt: 18,
    rainSens: 0.15,
    value: 0.75,
    age: [0, 0, 10, 30, 0.45],
    pathEdge: 0.2,
    color: '#e0413a',
  },
]

/**
 * Modellerna som används: expertvikterna, ersatta av vikter tränade på riktiga
 * fynd där träningen slog expertmodellen på testdata (se trained.ts).
 */
export const SPECIES_MODELS: SpeciesModel[] = EXPERT_MODELS.map((s) => {
  const t = TRAINED[s.id]
  return t?.used && t.params ? { ...s, ...t.params } : s
})

export const SPECIES_BY_ID = Object.fromEntries(SPECIES_MODELS.map((s) => [s.id, s])) as Record<SpeciesId, SpeciesModel>

/** Vad chanskartan visar: en art, alla svampar eller alla bär. */
export type Target = SpeciesId | 'svamp' | 'bar'

export function targetSpecies(t: Target): SpeciesModel[] {
  if (t === 'svamp' || t === 'bar') return SPECIES_MODELS.filter((s) => s.kind === t)
  return [SPECIES_BY_ID[t]]
}

export function targetLabel(t: Target) {
  return t === 'svamp' ? 'Alla svampar' : t === 'bar' ? 'Alla bär' : SPECIES_BY_ID[t].name
}

export function dayOfYear(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000)
}

/**
 * Säsongsfaktor 0–1. Platt topp (|z|³) så att högsäsongen inte är en spets.
 * Toppen förskjuts med breddgraden: sommararter senare norrut, höstarter tidigare.
 */
export function seasonFactor(s: SpeciesModel, doy: number, lat: number) {
  const peak = s.peak + s.latShift * (lat - 56)
  const z = Math.abs(doy - peak) / s.spread
  return Math.exp(-0.5 * z * z * z)
}

/** Högsta möjliga chans just nu för ett mål (samma tidsfaktorer som workern använder). */
export function chanceCeiling(t: Target, mode: 'nu' | 'potential', doy: number, lat: number, weather: Partial<Record<SpeciesId, number>>) {
  const group = t === 'svamp' || t === 'bar'
  return Math.min(
    1,
    Math.max(
      ...targetSpecies(t).map((sp) => {
        const range = sp.range ? sp.range(lat) : 1
        const value = group ? sp.value : 1
        if (mode === 'potential') return range * value
        return (0.12 + 0.88 * seasonFactor(sp, doy, lat)) * (weather[sp.id] ?? 1) * range * value
      }),
    ),
  )
}

/** Matcha en fritt skriven artbenämning ("Kantareller", "trattis") mot modellen. */
export function matchSpecies(text: string): SpeciesId | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const aliases: [SpeciesId, string[]][] = [
    ['trattkantarell', ['trattkantarell', 'tratt']],
    ['svarttrumpet', ['trumpet']],
    ['karljohan', ['karl johan', 'karljohan', 'stensopp']],
    ['taggsvamp', ['taggsvamp']],
    ['farticka', ['farticka']],
    ['smorsopp', ['smorsopp']],
    ['kantarell', ['kantarell']],
    ['blabar', ['blabar']],
    ['lingon', ['lingon']],
    ['hjortron', ['hjortron']],
    ['hallon', ['hallon']],
    ['tranbar', ['tranbar']],
    ['smultron', ['smultron']],
  ]
  for (const [id, keys] of aliases) if (keys.some((k) => t.includes(k))) return id
  return null
}
