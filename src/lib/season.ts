import type { Kind } from './types'

export interface Species {
  name: string
  kind: Kind
  /** månader 1–12 då arten brukar finnas */
  months: number[]
  habitat: string
}

/** Ungefärliga säsonger för södra/mellersta Sverige – norrut kommer allt några veckor senare. */
export const SPECIES: Species[] = [
  { name: 'Kantarell', kind: 'svamp', months: [7, 8, 9, 10], habitat: 'Mossig barr- och blandskog' },
  { name: 'Trattkantarell', kind: 'svamp', months: [8, 9, 10, 11], habitat: 'Fuktig, mossig granskog' },
  { name: 'Karljohansvamp', kind: 'svamp', months: [7, 8, 9], habitat: 'Gran, tall och björk' },
  { name: 'Svart trumpetsvamp', kind: 'svamp', months: [8, 9, 10], habitat: 'Lövskog med ek och bok' },
  { name: 'Blek taggsvamp', kind: 'svamp', months: [8, 9, 10], habitat: 'Mossig barrskog' },
  { name: 'Fårticka', kind: 'svamp', months: [8, 9, 10], habitat: 'Mager granskog' },
  { name: 'Smörsopp', kind: 'svamp', months: [8, 9, 10], habitat: 'Ung tallskog' },
  { name: 'Ängschampinjon', kind: 'svamp', months: [7, 8, 9, 10], habitat: 'Betesmarker, ängar och gräsmattor' },
  { name: 'Smultron', kind: 'bar', months: [6, 7], habitat: 'Soliga gläntor och vägkanter' },
  { name: 'Blåbär', kind: 'bar', months: [7, 8], habitat: 'Skuggig granskog' },
  { name: 'Hjortron', kind: 'bar', months: [7, 8], habitat: 'Öppna myrar' },
  { name: 'Hallon', kind: 'bar', months: [7, 8], habitat: 'Hyggen och skogsbryn' },
  { name: 'Lingon', kind: 'bar', months: [8, 9, 10], habitat: 'Torr tallskog' },
  { name: 'Tranbär', kind: 'bar', months: [9, 10], habitat: 'Mossar och myrar' },
]

export const inSeason = (month = new Date().getMonth() + 1) => SPECIES.filter((s) => s.months.includes(month))

export const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
