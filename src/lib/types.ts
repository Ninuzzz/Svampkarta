export type Kind = 'svamp' | 'bar'

export type LatLng = { lat: number; lng: number }

export interface Place {
  id: string
  name: string
  kind: Kind
  species: string
  lat: number
  lng: number
  /** 1 = några få, 2 = bra, 3 = fantastiskt */
  yield: 1 | 2 | 3
  notes: string
  createdAt: string
  updatedAt: string
  demo?: boolean
}

export type Weather = 'sol' | 'halvklart' | 'moln' | 'regn' | 'dimma' | 'snö'

export interface Finding {
  species: string
  /** fri text, t.ex. "2 liter" eller "en handfull" */
  amount: string
}

export interface LogEntry {
  id: string
  date: string // YYYY-MM-DD
  title: string
  weather: Weather
  temperature: number | null
  placeId: string | null
  findings: Finding[]
  notes: string
  /** nycklar till foton i IndexedDB */
  photoIds: string[]
  createdAt: string
  demo?: boolean
}

export interface Route {
  id: string
  name: string
  date: string // YYYY-MM-DD
  points: [number, number][] // [lat, lng]
  /** meter */
  distance: number
  /** sekunder, om känt */
  duration: number | null
  createdAt: string
  demo?: boolean
}

/** "Hittade" / "Hittade inget" i ett område – algoritmen lär sig av det. */
export interface Feedback {
  id: string
  lat: number
  lng: number
  /** art-id i modellen, t.ex. "kantarell" */
  species: string
  found: boolean
  date: string // ISO
}

export interface AppData {
  version: 1
  /** vilken version av exempeldatan som senast lades in */
  seed?: number
  places: Place[]
  logs: LogEntry[]
  routes: Route[]
  feedback?: Feedback[]
}
