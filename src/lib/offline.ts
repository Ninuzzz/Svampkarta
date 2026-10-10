import { useCallback, useEffect, useRef, useState } from 'react'
import { analysis } from '../analysis/client'
import type { ChanceOptions } from '../analysis/protocol'
import { CHANCE_NATIVE_ZOOM } from '../map/ChanceLayer'
import { tilesFor } from './fynd'
import { loadFinds } from '../map/finds'

/*
 * Offline: analysen av ett område räknas igenom i förväg. Då hamnar all
 * källdata (skog, jordart, höjd, skogsålder, stigar) i webbläsarens cache,
 * och kartan kan räkna fram chansen även utan täckning.
 *
 * Bakgrundskartan (flygfoto/karta) laddas inte ner i förväg – kartleverantörernas
 * villkor tillåter inte massnedladdning. De kartbilder du tittat på sparas dock, och där
 * de saknas ritas en enkel karta ur samma källdata (se map/SimpleLayer.ts).
 *
 * De rapporterade fynden för området hämtas också (service workern sparar svaren).
 */

const KEY = 'mycel:offline'
type Saved = Record<string, string> // områdesnyckel → datum

const load = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved
  } catch {
    return {}
  }
}

/** Analysrutor (zoom 13) som täcker ett område [[syd, väst], [nord, öst]]. */
export function areaTiles(b: [[number, number], [number, number]]) {
  const z = CHANCE_NATIVE_ZOOM
  const n = 2 ** z
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n)
  const ty = (lat: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  const out: { z: number; x: number; y: number }[] = []
  for (let y = ty(b[1][0]); y <= ty(b[0][0]); y++) for (let x = tx(b[0][1]); x <= tx(b[1][1]); x++) out.push({ z, x, y })
  return out
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export type OfflineState = { saving: boolean; done: number; total: number; failed: number; savedAt: string | null }

/** Sparar valda kommuner för offline-bruk. `areaKey` identifierar urvalet (t.ex. kommunkoder). */
export function useOfflineSave(areaKey: string, bounds: [[number, number], [number, number]] | null, opts: ChanceOptions) {
  const [state, setState] = useState<OfflineState>(() => ({ saving: false, done: 0, total: 0, failed: 0, savedAt: load()[areaKey] ?? null }))
  const run = useRef(0)

  useEffect(() => {
    run.current++
    setState({ saving: false, done: 0, total: 0, failed: 0, savedAt: load()[areaKey] ?? null })
  }, [areaKey])

  const start = useCallback(async () => {
    if (!bounds) return
    const id = ++run.current
    // be webbläsaren att inte rensa cachen vid platsbrist
    navigator.storage?.persist?.().catch(() => false)
    const tiles = areaTiles(bounds)
    let done = 0, failed = 0
    setState((s) => ({ ...s, saving: true, done: 0, total: tiles.length, failed: 0 }))
    const queue = [...tiles]
    const worker = async () => {
      for (let t = queue.shift(); t && run.current === id; t = queue.shift()) {
        const ok = await analysis.chance(t.z, t.x, t.y, opts).then(
          (r) => r.complete,
          () => false,
        )
        done++
        if (!ok) failed++
        setState((s) => ({ ...s, done, failed }))
      }
    }
    // några åt gången, så att kartan fortfarande hinner räkna det som syns
    await Promise.all(Array.from({ length: 6 }, worker))
    if (run.current !== id) return
    // Fynden för området, för både svamp och bär. Saknas de utan nät är kartan ändå användbar,
    // så ett fel här räknas inte som att sparandet misslyckades. (Bara på den publicerade sajten:
    // i utvecklingsläge finns ingen service worker som sparar svaren.)
    if (import.meta.env.PROD) {
      const box = { south: bounds[0][0], west: bounds[0][1], north: bounds[1][0], east: bounds[1][1] }
      for (const t of tilesFor(box, 40)) for (const set of ['svamp', 'bar']) await loadFinds(set, t.x, t.y).catch(() => null)
      if (run.current !== id) return
    }
    const savedAt = new Date().toISOString().slice(0, 10)
    if (!failed) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...load(), [areaKey]: savedAt }))
      } catch {
        /* privat läge */
      }
    }
    setState((s) => ({ ...s, saving: false, savedAt: failed ? s.savedAt : savedAt }))
  }, [areaKey, bounds, opts])

  const cancel = useCallback(() => {
    run.current++
    setState((s) => ({ ...s, saving: false }))
  }, [])

  return { state, start, cancel }
}
