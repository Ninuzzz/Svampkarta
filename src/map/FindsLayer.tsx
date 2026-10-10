import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngBounds } from 'leaflet'
import { CircleMarker, LayerGroup, Pane, Popup } from 'react-leaflet'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { SPECIES_BY_ID, type SpeciesId, type Target } from '../analysis/species'
import { SpeciesIcon } from '../components/SpeciesIcon'
import { isRecent, mergeFinds, tilesFor, type Find } from '../lib/fynd'
import { loadFinds } from './finds'

/** Lagrets läge, för statusraden i lagerpanelen. */
export interface FindsInfo {
  state: 'laddar' | 'klar' | 'zooma' | 'fel'
  /** fynd som syns i kartvyn just nu */
  inView: number
  /** fynd som ritas, och fynd totalt, i de hämtade rutorna (rutorna är större än vyn) */
  shown: number
  total: number
  /** antal rutor i vyn som inte gick att hämta (fynden där saknas på kartan) */
  missing: number
}

type Load = Pick<FindsInfo, 'state' | 'total' | 'missing'>

/** Fler prickar än så här ritas inte; de nyaste fynden väljs. */
const MAX_DOTS = 1500
/** Rutor som inte gick att hämta försöks igen så här många gånger, med paus emellan. */
const RETRIES = 2
const RETRY_MS = 5000

// Lugna prickar i appens egna färger (krämvit med skogsgrön ring) – magenta är reserverat för chansen.
// Fynd äldre än tio år ritas svagare.
const RECENT = { color: '#2d4600', weight: 1.75, opacity: 1, fillColor: '#fffbeb', fillOpacity: 0.95 }
const OLDER = { color: '#2d4600', weight: 1.25, opacity: 0.55, fillColor: '#fffbeb', fillOpacity: 0.4 }
/** Pekskärm: en osynlig, större träffyta under varje prick – en prick på 10 px går inte att träffa med ett finger. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const HIT = { stroke: false, fillColor: '#fffbeb', fillOpacity: 0 }
const HIT_RADIUS = 16

/**
 * Rapporterade fynd (GBIF, mest Artportalen) för den valda arten eller gruppen,
 * som prickar på kartan. Ett tryck visar art och år och en länk till posten.
 */
export function FindsLayer({ target, bounds, onInfo }: { target: Target; bounds: LatLngBounds | null; onInfo: (i: FindsInfo) => void }) {
  const [finds, setFinds] = useState<Find[]>([])
  const [load, setLoad] = useState<Load>({ state: 'zooma', total: 0, missing: 0 })
  const [attempt, setAttempt] = useState(0)
  /** vilken vy omförsöken gäller, och hur många som gjorts */
  const tried = useRef({ view: '', n: 0 })
  const now = new Date().getFullYear()

  const tiles = useMemo(
    () => (bounds ? tilesFor({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }) : null),
    [bounds],
  )
  // ändras bara när kartan flyttas över en rutgräns
  const tileKey = tiles ? tiles.map((t) => `${t.x}/${t.y}`).join(',') : null

  useEffect(() => {
    if (!tiles) return
    if (!tiles.length) {
      setFinds([])
      setLoad({ state: 'zooma', total: 0, missing: 0 })
      return
    }
    const view = `${target}|${tileKey}`
    if (tried.current.view !== view) tried.current = { view, n: 0 }
    let alive = true
    let timer = 0
    if (!tried.current.n) setLoad({ state: 'laddar', total: 0, missing: 0 })
    Promise.allSettled(tiles.map((t) => loadFinds(target, t.x, t.y))).then((results) => {
      if (!alive) return
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.finds)
      const missing = results.length - ok.length
      const merged = mergeFinds(ok, MAX_DOTS)
      // bara arter som appen känner till (om servern och appen skulle vara olika versioner)
      setFinds(merged.finds.filter((f) => f.sp in SPECIES_BY_ID))
      setLoad({ state: ok.length ? 'klar' : 'fel', total: merged.total, missing })
      // det som saknas hämtas igen efter en stund (misslyckade rutor sparas inte, se finds.ts)
      if (missing && tried.current.n < RETRIES) {
        tried.current.n++
        timer = window.setTimeout(() => setAttempt((a) => a + 1), RETRY_MS)
      }
    })
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tileKey, attempt])

  // Rutorna är större än kartvyn: räkna det som faktiskt syns, så att statusraden inte lovar prickar som ligger utanför
  const inView = useMemo(() => (bounds ? finds.reduce((n, f) => n + (bounds.contains([f.lat, f.lng]) ? 1 : 0), 0) : 0), [finds, bounds])
  useEffect(() => {
    onInfo({ ...load, inView, shown: finds.length })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, inView, finds.length])

  return (
    <Pane name="finds" style={{ zIndex: 450 }}>
      <LayerGroup attribution='Fynd: <a href="https://www.gbif.org">GBIF.org</a> (Artportalen m.fl.)'>
        {finds.map((f) => {
          const popup = <FindPopup find={f} />
          const style = isRecent(f.year, now) ? RECENT : OLDER
          return TOUCH ? (
            <LayerGroup key={f.id}>
              <CircleMarker center={[f.lat, f.lng]} radius={HIT_RADIUS} bubblingMouseEvents={false} pathOptions={HIT}>
                {popup}
              </CircleMarker>
              <CircleMarker center={[f.lat, f.lng]} radius={5} interactive={false} pathOptions={style} />
            </LayerGroup>
          ) : (
            <CircleMarker key={f.id} center={[f.lat, f.lng]} radius={5} bubblingMouseEvents={false} pathOptions={style}>
              {popup}
            </CircleMarker>
          )
        })}
      </LayerGroup>
    </Pane>
  )
}

function FindPopup({ find: f }: { find: Find }) {
  return (
    // popupPane uttryckligen: annars hamnar rutan i prickarnas lager och prickar ritas ovanpå den
    <Popup pane="popupPane" className="find-popup" closeButton={false} autoPanPadding={[24, 24]}>
      <div className="flex items-center gap-2.5">
        <SpeciesIcon id={f.sp as SpeciesId} size={22} className="size-9 rounded-full bg-white" />
        <div>
          <p className="text-sm font-bold text-forest-900">{SPECIES_BY_ID[f.sp as SpeciesId].name}</p>
          <p className="text-[12px] text-ink-muted">Rapporterat fynd {f.year}</p>
        </div>
      </div>
      <a href={`https://www.gbif.org/occurrence/${f.id}`} target="_blank" rel="noopener noreferrer" className="find-popup-link">
        Visa hos GBIF <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
      </a>
    </Popup>
  )
}
