import { useEffect, useMemo, useState } from 'react'
import { analysis } from './client'
import { SPECIES_MODELS, matchSpecies, type SpeciesId, type TreeKey } from './species'
import type { Find, Miss, Signature } from './protocol'
import type { AppData } from '../lib/types'

/**
 * Algoritmen lär sig av dina egna fynd: platser med en känd art (och loggade
 * fynd kopplade till platser) blir "träningspunkter". Runt dem höjs chansen,
 * och skogstyp/jordart som liknar dina fyndplatser viktas upp.
 */
const KEY = 'mycel:signatures'

type Sig = { lat: number; lng: number; tree: TreeKey | null; soil: number }

function load(): Record<string, Sig> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

const lngToX = (lng: number) => (lng * Math.PI * 6378137) / 180
const latToY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137

export function useLearning(data: AppData) {
  const points = useMemo(() => {
    const out: { id: string; lat: number; lng: number; sp: SpeciesId }[] = []
    for (const p of data.places) {
      const sp = matchSpecies(p.species || p.name)
      if (sp) out.push({ id: p.id, lat: p.lat, lng: p.lng, sp })
      // loggade fynd på platsen räknas också
      for (const l of data.logs)
        if (l.placeId === p.id)
          for (const f of l.findings) {
            const s = matchSpecies(f.species)
            if (s && s !== sp) out.push({ id: `${p.id}:${s}`, lat: p.lat, lng: p.lng, sp: s })
          }
    }
    // "Hittade" räknas som ett fynd
    for (const f of data.feedback ?? []) if (f.found) out.push({ id: `fb:${f.id}`, lat: f.lat, lng: f.lng, sp: f.species as SpeciesId })
    return out
  }, [data.places, data.logs, data.feedback])

  // "Hittade inget" – vikten avtar med en halveringstid på ~3 veckor (svampen kan komma senare)
  const misses = useMemo<Miss[]>(() => {
    const now = Date.now()
    return (data.feedback ?? [])
      .filter((f) => !f.found)
      .flatMap((f) => {
        // "svamp"/"bar" = hela gruppen, samma arter som targetSpecies ger (utan soloOnly)
        const ids = f.species === 'svamp' || f.species === 'bar' ? SPECIES_MODELS.filter((s) => s.kind === f.species && !s.soloOnly).map((s) => s.id) : [f.species as SpeciesId]
        const w = Math.round(Math.exp(-(now - Date.parse(f.date)) / (30 * 86400000)) * 20) / 20
        return ids.map((sp) => ({ mx: Math.round(lngToX(f.lng)), my: Math.round(latToY(f.lat)), sp, w }))
      })
      .filter((m) => m.w > 0.05)
  }, [data.feedback])

  const [sigs, setSigs] = useState<Record<string, Sig>>(load)

  useEffect(() => {
    let alive = true
    const missing = points.filter((p) => {
      const s = sigs[p.id]
      return !s || s.lat !== p.lat || s.lng !== p.lng
    })
    if (!missing.length) return
    // vänta tills kartans första rutor hunnit laddas
    const timer = window.setTimeout(async () => {
      const next = { ...sigs }
      for (const p of missing) {
        try {
          const r = await analysis.signature(p.lat, p.lng)
          next[p.id] = { lat: p.lat, lng: p.lng, ...r }
        } catch {
          /* utanför täckning – hoppa över */
        }
      }
      if (!alive) return
      setSigs(next)
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* ignorera */
      }
    }, 2500)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  return useMemo(() => {
    const finds: Find[] = points.map((p) => ({ mx: Math.round(lngToX(p.lng)), my: Math.round(latToY(p.lat)), sp: p.sp }))
    const bySp: Partial<Record<SpeciesId, Signature>> = {}
    for (const p of points) {
      const s = sigs[p.id]
      if (!s) continue
      const g = (bySp[p.sp] ??= { n: 0, tree: {}, soil: [0, 0, 0, 0, 0, 0] })
      g.n++
      if (s.tree) g.tree[s.tree] = (g.tree[s.tree] ?? 0) + 1
      g.soil[s.soil]++
    }
    return { finds, misses, sigs: bySp, count: points.length + misses.length }
  }, [points, sigs, misses])
}
