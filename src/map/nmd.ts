/**
 * Nationella marktäckedata (NMD 2023, Naturvårdsverket) – öppen data, CC0.
 * WMS-tjänsten levererar en palettbild där varje klass har en exakt färg.
 * Vi översätter färgen tillbaka till klasskod och färgar om i appens egen
 * palett enligt filtret – helt i webbläsaren.
 */

export const NMD_WMS = 'https://geodata.naturvardsverket.se/geoserver/wms'
export const NMD_LAYER = 'lc-nmd:LC.LandCoverRaster.Bas.2023.v2.x'

export type Conifer = 'tall' | 'gran' | 'blandbarr'

export interface ForestClass {
  label: string
  /** ungefärlig lövandel 0–100 */
  leaf: number
  wet: boolean
  young: boolean
  conifer?: Conifer
  mire?: boolean
}

/** Legendfärg (hex från tjänstens GetLegendGraphic) → klass */
const LEGEND: Record<string, [number, ForestClass]> = {
  '6e8c05': [111, { label: 'Tallskog på fastmark', leaf: 5, wet: false, young: false, conifer: 'tall' }],
  '2d5f00': [112, { label: 'Granskog på fastmark', leaf: 5, wet: false, young: false, conifer: 'gran' }],
  '4e7000': [113, { label: 'Barrblandskog på fastmark', leaf: 10, wet: false, young: false, conifer: 'blandbarr' }],
  '38a800': [114, { label: 'Lövblandad barrskog på fastmark', leaf: 35, wet: false, young: false }],
  '4ce600': [115, { label: 'Triviallövskog på fastmark', leaf: 90, wet: false, young: false }],
  aaff00: [116, { label: 'Ädellövskog på fastmark', leaf: 95, wet: false, young: false }],
  '97e600': [117, { label: 'Triviallövskog med ädellövinslag på fastmark', leaf: 92, wet: false, young: false }],
  cdcd66: [118, { label: 'Hygge / ungskog på fastmark', leaf: -1, wet: false, young: true }],
  '598c55': [121, { label: 'Tallskog på våtmark', leaf: 5, wet: true, young: false, conifer: 'tall' }],
  '305e50': [122, { label: 'Granskog på våtmark', leaf: 5, wet: true, young: false, conifer: 'gran' }],
  '23735a': [123, { label: 'Barrblandskog på våtmark', leaf: 10, wet: true, young: false, conifer: 'blandbarr' }],
  '438870': [124, { label: 'Lövblandad barrskog på våtmark', leaf: 35, wet: true, young: false }],
  '89cd9b': [125, { label: 'Triviallövskog på våtmark', leaf: 90, wet: true, young: false }],
  a5f578: [126, { label: 'Ädellövskog på våtmark', leaf: 95, wet: true, young: false }],
  abcd78: [127, { label: 'Triviallövskog med ädellövinslag på våtmark', leaf: 92, wet: true, young: false }],
  '898944': [128, { label: 'Hygge / ungskog på våtmark', leaf: -1, wet: true, young: true }],
  '00e6a9': [23, { label: 'Låg fjällskog på våtmark', leaf: 90, wet: true, young: false }],
  '55ff00': [43, { label: 'Låg fjällskog på fastmark', leaf: 90, wet: false, young: false }],
}

const MIRE_COLORS = [
  'c29ed7', '894465', 'cd6699', 'f57ab6', 'd69dbc', '73004c', 'a80084', 'e600a9', 'ff00c5',
  '704489', 'aa66cd', 'ca7af5', '4c0073', '8400a8', 'a900e6', 'c500ff',
]
const MIRE_CODE = 200

export const CLASSES = new Map<number, ForestClass>()
/** rgb-heltal → klasskod */
export const COLOR_TO_CODE = new Map<number, number>()

for (const [hex, [code, cls]] of Object.entries(LEGEND)) {
  CLASSES.set(code, cls)
  COLOR_TO_CODE.set(parseInt(hex, 16), code)
}
CLASSES.set(MIRE_CODE, { label: 'Öppen våtmark / myr', leaf: -1, wet: true, young: false, mire: true })
for (const hex of MIRE_COLORS) COLOR_TO_CODE.set(parseInt(hex, 16), MIRE_CODE)

/* ------------------------------------------------------------------ */

export type AgeFilter = 'alla' | 'etablerad' | 'ung'
export type MoistureFilter = 'alla' | 'torr' | 'fuktig'

export interface ForestFilter {
  enabled: boolean
  opacity: number // 0–1
  leaf: [number, number] // lövandel min–max
  conifers: Record<Conifer, boolean>
  age: AgeFilter
  moisture: MoistureFilter
  /** visa skogsklasser */
  forest: boolean
  /** visa öppna myrar */
  mires: boolean
}

export const DEFAULT_FILTER: ForestFilter = {
  enabled: true,
  opacity: 0.62,
  leaf: [0, 100],
  conifers: { tall: true, gran: true, blandbarr: true },
  age: 'alla',
  moisture: 'alla',
  forest: true,
  mires: false,
}

export function matches(cls: ForestClass, f: ForestFilter) {
  if (cls.mire) return f.mires
  if (!f.forest) return false
  if (f.moisture === 'torr' && cls.wet) return false
  if (f.moisture === 'fuktig' && !cls.wet) return false
  if (f.age === 'etablerad' && cls.young) return false
  if (f.age === 'ung' && !cls.young) return false
  if (cls.young) return true // hyggen saknar trädslag – lövandel gäller inte
  if (cls.leaf < f.leaf[0] || cls.leaf > f.leaf[1]) return false
  if (cls.conifer && !f.conifers[cls.conifer]) return false
  return true
}

/** Appens naturpalett: barr → djupgrönt, löv → gyllene salvia, fukt → blågrön ton. */
export function colorFor(cls: ForestClass): [number, number, number] {
  if (cls.mire) return [150, 160, 196]
  if (cls.young) return cls.wet ? [176, 168, 120] : [214, 190, 140]
  const t = cls.leaf / 100
  const dry0 = [38, 82, 52], dry1 = [196, 172, 74]
  const wet0 = [36, 92, 96], wet1 = [126, 170, 140]
  const [a, b] = cls.wet ? [wet0, wet1] : [dry0, dry1]
  // lätt kurva så att blandskog hamnar mitt emellan
  const k = Math.pow(t, 0.8)
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as [number, number, number]
}

/** Klasser att visa i teckenförklaringen */
export const LEGEND_ITEMS: { label: string; code: number }[] = [
  { label: 'Barrskog', code: 112 },
  { label: 'Lövblandad', code: 114 },
  { label: 'Lövskog', code: 115 },
  { label: 'Fuktig barrskog', code: 122 },
  { label: 'Fuktig lövskog', code: 125 },
  { label: 'Hygge / ungskog', code: 118 },
  { label: 'Myr', code: MIRE_CODE },
]

export interface Preset {
  name: string
  hint: string
  filter: Partial<ForestFilter>
}

/** Tumregler för var arterna brukar trivas */
export const PRESETS: Preset[] = [
  {
    name: 'Kantarell',
    hint: 'Etablerad barr- och blandskog',
    filter: { leaf: [0, 40], conifers: { tall: true, gran: true, blandbarr: true }, age: 'etablerad', moisture: 'alla', forest: true, mires: false },
  },
  {
    name: 'Trattkantarell',
    hint: 'Fuktig gran- och blandskog',
    filter: { leaf: [0, 40], conifers: { tall: false, gran: true, blandbarr: true }, age: 'etablerad', moisture: 'fuktig', forest: true, mires: false },
  },
  {
    name: 'Karljohan',
    hint: 'Gran, tall och björk på fastmark',
    filter: { leaf: [0, 100], conifers: { tall: true, gran: true, blandbarr: true }, age: 'etablerad', moisture: 'torr', forest: true, mires: false },
  },
  {
    name: 'Blåbär',
    hint: 'Skuggig granskog',
    filter: { leaf: [0, 40], conifers: { tall: false, gran: true, blandbarr: true }, age: 'etablerad', moisture: 'torr', forest: true, mires: false },
  },
  {
    name: 'Lingon',
    hint: 'Torr tallskog',
    filter: { leaf: [0, 15], conifers: { tall: true, gran: false, blandbarr: false }, age: 'etablerad', moisture: 'torr', forest: true, mires: false },
  },
  {
    name: 'Hallon',
    hint: 'Hyggen och ungskog',
    filter: { leaf: [0, 100], conifers: { tall: true, gran: true, blandbarr: true }, age: 'ung', moisture: 'alla', forest: true, mires: false },
  },
  {
    name: 'Hjortron',
    hint: 'Öppna myrar',
    filter: { leaf: [0, 100], conifers: { tall: true, gran: true, blandbarr: true }, age: 'alla', moisture: 'alla', forest: false, mires: true },
  },
]
