import { useSyncExternalStore } from 'react'
import { loadIndex, type Kommun } from './kommuner'
import type { BBox } from './homeview'

/**
 * Hemområdet: kommunen som startsidan och kartan utgår från. Besökaren väljer det själv
 * (se HomePicker) och valet sparas bara i webbläsaren.
 */
export interface Home {
  /** kommunkod */
  id: string
  name: string
  lat: number
  lng: number
  bbox: BBox
}

const KEY = 'mycel:home'
const MAP_KEY = 'mycel:map'
export const VIEW_KEY = 'mycel:view'
/** Breddgrad för säsongen innan ett område är valt (Mälardalen, mitt i landets befolkning). */
export const DEFAULT_LAT = 59.3

const toHome = (k: Kommun): Home => ({ id: k.id, name: k.name, lat: k.center[0], lng: k.center[1], bbox: k.bbox })

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* privat läge */
  }
}

function stored(): Home | null {
  const h = read<Partial<Home>>(KEY)
  return h && typeof h.id === 'string' && typeof h.name === 'string' && typeof h.lat === 'number' && typeof h.lng === 'number' && Array.isArray(h.bbox) && h.bbox.length === 4
    ? (h as Home)
    : null
}

/** undefined = tas reda på just nu, null = inget valt */
let current: Home | null | undefined = stored()
const listeners = new Set<() => void>()

function set(h: Home | null) {
  current = h
  listeners.forEach((l) => l())
}

// Den som använde appen innan hemområdet gick att välja har redan kommuner valda på kartan:
// den första blir hemområdet, utan att någon behöver fråga.
if (!current) {
  const first = read<{ areas?: unknown }>(MAP_KEY)?.areas
  const id = Array.isArray(first) && typeof first[0] === 'string' ? first[0] : null
  if (id) {
    current = undefined
    loadIndex()
      .then((index) => {
        const k = index.find((x) => x.id === id)
        if (k) write(KEY, toHome(k))
        set(k ? toHome(k) : null)
      })
      .catch(() => set(null))
  }
}

/** Hemområdet: undefined medan det tas reda på, null om inget är valt. */
export function useHome() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export const getHome = () => current ?? null

/** Spara hemområdet (utan att röra kartans val). */
export function saveHome(k: Kommun) {
  const h = toHome(k)
  write(KEY, h)
  set(h)
  return h
}

/**
 * Välj hemområde från startsidan: kartan analyserar då den kommunen (det förra hemområdet byts ut,
 * andra tillagda kommuner behålls) och öppnas där nästa gång.
 */
export function chooseHome(k: Kommun) {
  const old = current?.id
  const prev = read<{ areas?: unknown }>(MAP_KEY) ?? {}
  const areas = Array.isArray(prev.areas) ? prev.areas.filter((a): a is string => typeof a === 'string' && a !== old && a !== k.id) : []
  write(MAP_KEY, { ...prev, wholeView: false, areas: [k.id, ...areas] })
  try {
    localStorage.removeItem(VIEW_KEY)
  } catch {
    /* privat läge */
  }
  return saveHome(k)
}
