import { useSyncExternalStore } from 'react'
import type { AppData, Feedback, LogEntry, Place, Route } from './types'
import { SEED_VERSION, seedData } from './seed'

/**
 * Datalagret. Allt går genom `DataBackend` så att localStorage senare kan
 * bytas mot en gratis databas (t.ex. Supabase, PocketBase eller Firebase)
 * utan att vyerna behöver ändras – implementera bara `load`/`save`.
 */
export interface DataBackend {
  load(): AppData | null
  save(data: AppData): void
}

const STORAGE_KEY = 'skogsdagbok:v1'

export const localBackend: DataBackend = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as AppData) : null
    } catch {
      return null
    }
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Kunde inte spara till localStorage', err)
    }
  },
}

const backend: DataBackend = localBackend

/** Byter ut gammal exempeldata mot den aktuella, men rör aldrig egna poster. */
function migrateSeed(data: AppData): AppData {
  if ((data.seed ?? 1) >= SEED_VERSION) return data
  const hadDemo = hasDemoData(data)
  const fresh = seedData()
  return {
    ...data,
    seed: SEED_VERSION,
    places: [...(hadDemo ? fresh.places : []), ...data.places.filter((p) => !p.demo)],
    logs: [...(hadDemo ? fresh.logs : []), ...data.logs.filter((l) => !l.demo)],
    routes: [...(hadDemo ? fresh.routes : []), ...data.routes.filter((r) => !r.demo)],
  }
}

const loaded = backend.load()
let state: AppData = loaded ? migrateSeed(loaded) : seedData()
if (state !== loaded) backend.save(state)

const listeners = new Set<() => void>()

function commit(next: AppData) {
  state = next
  backend.save(state)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, () => state)
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const now = () => new Date().toISOString()

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [item, ...list]
  const copy = list.slice()
  copy[i] = item
  return copy
}

export const actions = {
  savePlace(p: Omit<Place, 'createdAt' | 'updatedAt'> & Partial<Pick<Place, 'createdAt'>>) {
    const place: Place = { ...p, createdAt: p.createdAt ?? now(), updatedAt: now(), demo: false }
    commit({ ...state, places: upsert(state.places, place) })
    return place
  },
  deletePlace(id: string) {
    commit({
      ...state,
      places: state.places.filter((p) => p.id !== id),
      logs: state.logs.map((l) => (l.placeId === id ? { ...l, placeId: null } : l)),
    })
  },
  saveLog(entry: Omit<LogEntry, 'createdAt'> & Partial<Pick<LogEntry, 'createdAt'>>) {
    const log: LogEntry = { ...entry, createdAt: entry.createdAt ?? now(), demo: false }
    commit({ ...state, logs: upsert(state.logs, log) })
    return log
  },
  deleteLog(id: string) {
    commit({ ...state, logs: state.logs.filter((l) => l.id !== id) })
  },
  saveRoute(r: Omit<Route, 'createdAt'> & Partial<Pick<Route, 'createdAt'>>) {
    const route: Route = { ...r, createdAt: r.createdAt ?? now(), demo: false }
    commit({ ...state, routes: upsert(state.routes, route) })
    return route
  },
  deleteRoute(id: string) {
    commit({ ...state, routes: state.routes.filter((r) => r.id !== id) })
  },
  addFeedback(f: Omit<Feedback, 'id' | 'date'>) {
    const fb: Feedback = { ...f, id: uid(), date: now() }
    commit({ ...state, feedback: [fb, ...(state.feedback ?? [])] })
    return fb
  },
  deleteFeedback(id: string) {
    commit({ ...state, feedback: (state.feedback ?? []).filter((f) => f.id !== id) })
  },
  /** Återställ ett raderat objekt (för "Ångra") */
  restore(snapshot: AppData) {
    commit(snapshot)
  },
  snapshot(): AppData {
    return state
  },
  clearDemo() {
    commit({
      ...state,
      places: state.places.filter((p) => !p.demo),
      logs: state.logs.filter((l) => !l.demo),
      routes: state.routes.filter((r) => !r.demo),
    })
  },
  replaceAll(data: AppData) {
    commit(data)
  },
}

export function hasDemoData(d: AppData) {
  return d.places.some((p) => p.demo) || d.logs.some((l) => l.demo) || d.routes.some((r) => r.demo)
}

export function isAppData(x: unknown): x is AppData {
  const d = x as AppData
  return !!d && d.version === 1 && Array.isArray(d.places) && Array.isArray(d.logs) && Array.isArray(d.routes)
}
