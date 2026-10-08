import type { TreeKey } from './species'

/**
 * NMD 2023 (Naturvårdsverket) – färg i WMS-bilden → klasskod.
 * Koderna följer NMD, utom att alla öppna marktyper samlas i 41 och alla
 * öppna våtmarker i 200 (så att allt ryms i en Uint8).
 */
export const NMD_WMS = 'https://geodata.naturvardsverket.se/geoserver/wms'
export const NMD_LAYER = 'lc-nmd:LC.LandCoverRaster.Bas.2023.v2.x'

export interface CodeInfo {
  label: string
  tree?: TreeKey
  wet?: boolean
  young?: boolean
  mire?: boolean
  noble?: boolean
  conifer?: 'tall' | 'gran' | 'blandbarr'
  leaf?: number
  forest?: boolean
  open?: boolean
  water?: boolean
  road?: boolean
  built?: boolean
}

const F = (label: string, tree: TreeKey, wet: boolean, extra: Partial<CodeInfo> = {}): CodeInfo => ({ label, tree, wet, forest: true, ...extra })

export const CODE_INFO: Record<number, CodeInfo> = {
  3: { label: 'Åkermark', open: true },
  23: F('Låg fjällskog på våtmark', 'fjall', true, { leaf: 90 }),
  41: { label: 'Öppen mark', open: true },
  43: F('Låg fjällskog på fastmark', 'fjall', false, { leaf: 90 }),
  51: { label: 'Byggnad', built: true },
  52: { label: 'Anlagd mark', built: true, open: true },
  53: { label: 'Väg/järnväg', road: true, open: true },
  54: { label: 'Torvtäkt', open: true },
  61: { label: 'Sjö/vattendrag', water: true },
  62: { label: 'Hav', water: true },
  111: F('Tallskog', 'tall', false, { conifer: 'tall', leaf: 5 }),
  112: F('Granskog', 'gran', false, { conifer: 'gran', leaf: 5 }),
  113: F('Barrblandskog', 'barrbland', false, { conifer: 'blandbarr', leaf: 10 }),
  114: F('Lövblandad barrskog', 'lovbarr', false, { leaf: 35 }),
  115: F('Triviallövskog', 'triv', false, { leaf: 90 }),
  116: F('Ädellövskog', 'adel', false, { leaf: 95, noble: true }),
  117: F('Triviallövskog med ädellövinslag', 'adel', false, { leaf: 92, noble: true }),
  118: F('Hygge/ungskog', 'hygge', false, { young: true, leaf: -1 }),
  121: F('Tallskog på våtmark', 'tall', true, { conifer: 'tall', leaf: 5 }),
  122: F('Granskog på våtmark', 'gran', true, { conifer: 'gran', leaf: 5 }),
  123: F('Barrblandskog på våtmark', 'barrbland', true, { conifer: 'blandbarr', leaf: 10 }),
  124: F('Lövblandad barrskog på våtmark', 'lovbarr', true, { leaf: 35 }),
  125: F('Triviallövskog på våtmark', 'triv', true, { leaf: 90 }),
  126: F('Ädellövskog på våtmark', 'adel', true, { leaf: 95, noble: true }),
  127: F('Triviallövskog med ädellöv på våtmark', 'adel', true, { leaf: 92, noble: true }),
  128: F('Hygge/ungskog på våtmark', 'hygge', true, { young: true, leaf: -1 }),
  200: { label: 'Myr/öppen våtmark', tree: 'mire', wet: true, mire: true },
}

const COLORS: Record<number, string[]> = {
  3: ['ffffbe'],
  23: ['00e6a9'],
  41: ['e1e1e1', 'ccd79e', 'abc9a6', '9eb591', 'd7c29e', 'cdaa66', '897044', 'ffebaf', 'ffd37f', 'ffbf7f'],
  43: ['55ff00'],
  51: ['5a1414'],
  52: ['e5464b'],
  53: ['191919'],
  54: ['800080'],
  61: ['6699cd'],
  62: ['8accfa'],
  111: ['6e8c05'],
  112: ['2d5f00'],
  113: ['4e7000'],
  114: ['38a800'],
  115: ['4ce600'],
  116: ['aaff00'],
  117: ['97e600'],
  118: ['cdcd66'],
  121: ['598c55'],
  122: ['305e50'],
  123: ['23735a'],
  124: ['438870'],
  125: ['89cd9b'],
  126: ['a5f578'],
  127: ['abcd78'],
  128: ['898944'],
  200: ['c29ed7', '894465', 'cd6699', 'f57ab6', 'd69dbc', '73004c', 'a80084', 'e600a9', 'ff00c5', '704489', 'aa66cd', 'ca7af5', '4c0073', '8400a8', 'a900e6', 'c500ff'],
}

export const COLOR_TO_CODE = new Map<number, number>()
for (const [code, hexes] of Object.entries(COLORS)) for (const h of hexes) COLOR_TO_CODE.set(parseInt(h, 16), Number(code))

/* ------------------------------------------------------------------ */
/*  SGU Jordarter 1:25 000–1:100 000 (öppen data). Standardfärg → grupp */
/* ------------------------------------------------------------------ */

export const SGU_WMS = 'https://maps3.sgu.se/geoserver/jord/ows'
export const SGU_LAYER = 'SE.GOV.SGU.JORD.GRUNDLAGER.25K'

/** 0 = okänt/ej karterat, 1 sand/grus, 2 morän, 3 lera/silt, 4 torv, 5 berg */
export const SOIL_KEYS = [null, 'sand', 'moran', 'lera', 'torv', 'berg'] as const
export const SOIL_NAMES = ['Okänd jordart', 'Sand och grus', 'Morän', 'Lera och silt', 'Torv', 'Berg / tunt jordtäcke']

const SOIL_COLORS: [number, string, string][] = [
  // grupp, färg, namn
  [1, 'f3943e', 'Sand och grus'],
  [1, 'f2963f', 'Sand och grus'],
  [1, 'f9b760', 'Sand'],
  [1, '96c147', 'Isälvssediment (sand/grus)'],
  [1, 'd9e7ba', 'Glacial finsand'],
  [1, 'f9c39c', 'Älvsediment'],
  [2, 'dfedf7', 'Morän'],
  [2, 'cfe4f3', 'Morän'],
  [2, 'afd0ef', 'Sandig-siltig morän'],
  [2, 'bad3ef', 'Morän'],
  [2, 'cbe6e1', 'Grusig morän'],
  [2, 'c7d7e1', 'Flytjord'],
  [2, 'b6d1aa', 'Morän med sorterat sediment'],
  [3, 'ffeca3', 'Lera–silt'],
  [3, 'ffdd62', 'Postglacial lera'],
  [3, 'ffd500', 'Glacial lera'],
  [3, 'e7e2f1', 'Moränlera'],
  [3, 'e99cba', 'Svämsediment'],
  [3, '95b3b3', 'Slamströmssediment'],
  [4, 'dfc3a2', 'Torv'],
  [4, 'd8b78f', 'Torv'],
  [4, 'ca9661', 'Torv'],
  [4, 'be874d', 'Kalktuff'],
  [4, '886136', 'Gyttja'],
  [5, 'de3534', 'Berg i dagen'],
  [5, '0b88c5', 'Sedimentärt berg'],
  [5, 'b84e94', 'Diabas'],
]

/** Index 1… i SOIL_DETAIL; 0 = okänd. */
export const SOIL_DETAIL = [{ group: 0, name: 'Okänd jordart' }, ...SOIL_COLORS.map(([group, , name]) => ({ group, name }))]
export const SOIL_COLOR_TO_INDEX = new Map<number, number>()
SOIL_COLORS.forEach(([, hex], i) => SOIL_COLOR_TO_INDEX.set(parseInt(hex, 16), i + 1))
