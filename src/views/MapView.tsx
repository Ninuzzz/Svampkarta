import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import L from 'leaflet'
import { ImageOverlay, MapContainer, Marker, Pane, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { ArrowCounterClockwise, BookOpenText, CaretUp, Crosshair, Drop, Leaf, MagnifyingGlass, Minus, Mountains, NavigationArrow, PencilSimple, Plus, Question, SlidersHorizontal, SpinnerGap, Stack, TreeEvergreen, WifiSlash, X } from '@phosphor-icons/react'
import { actions, useData } from '../lib/store'
import { HOME } from '../lib/home'
import { useRoute } from '../lib/router'
import { getCurrentPosition, haversine } from '../lib/geo'
import { BASEMAPS, ChanceOverlay, ForestOverlay, HILLSHADE_URL, feedbackIcon, hotspotIcon, meIcon, pickIcon, placeIcon, type Basemap } from '../map/layers'
import { CLASSES, DEFAULT_FILTER, LEGEND_ITEMS, colorFor, type ForestFilter } from '../map/nmd'
import { DualRange, KindBadge, Mushroom, RangeSlider, Segmented, Toggle, YieldDots } from '../components/ui'
import { PlaceForm, type PlaceDraft } from '../components/PlaceForm'
import { LogForm } from '../components/LogForm'
import { useToast } from '../components/Toast'
import { SpeciesIcon } from '../components/SpeciesIcon'
import type { LatLng, Place } from '../lib/types'
import { analysis } from '../analysis/client'
import { useWeather } from '../analysis/weather'
import { useLearning } from '../analysis/learning'
import { chanceCeiling, dayOfYear, matchSpecies, SPECIES_BY_ID, targetLabel, type Target } from '../analysis/species'
import type { ChanceMode, ChanceOptions, Hotspot } from '../analysis/protocol'
import { chanceMinZoom, type ChanceProgress } from '../map/ChanceLayer'
import { AreaSheet, type AreaSelection } from '../map/AreaSheet'
import { AreaCard, AreaOutlines } from '../map/AreaPicker'
import { unionBounds, useKommunIndex, type Kommun } from '../lib/kommuner'
import { useOfflineSave, useOnline } from '../lib/offline'
import { ChanceSettings, HotspotList, MinChanceCard, TargetPicker, WeatherCard } from '../map/ChancePanel'
import { useTour } from '../components/Tour'

type Tab = 'chans' | 'skog'

interface MapPrefs {
  tab: Tab
  target: Target
  chanceMode: ChanceMode
  filter: ForestFilter
  basemap: Basemap
  hillshade: boolean
  hillshadeOpacity: number
  showPlaces: boolean
  showRoutes: boolean
  forestUnder: boolean
  /** visa bara chans över detta värde (0–1) */
  minChance: number
  /** dölj områden mindre än detta (hektar) */
  minAreaHa: number
  /** analysera bara i dessa kommuner (id) */
  areas: string[]
  /** analysera allt som syns i stället för valda kommuner */
  wholeView: boolean
}

const PREFS_KEY = 'mycel:map'
const DEFAULT_PREFS: MapPrefs = {
  tab: 'chans',
  target: 'svamp',
  chanceMode: 'nu',
  filter: DEFAULT_FILTER,
  basemap: 'flygfoto',
  hillshade: false,
  hillshadeOpacity: 0.45,
  showPlaces: true,
  showRoutes: true,
  forestUnder: false,
  minChance: 0,
  minAreaHa: 2,
  areas: [HOME.kommun],
  wholeView: false,
}

function loadPrefs(): MapPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return p ? { ...DEFAULT_PREFS, ...p, filter: { ...DEFAULT_FILTER, ...p.filter } } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

const FOREST_MIN_ZOOM = 9

/** Slå ihop toppar från flera rutor: starkast först, inga två närmare än 300 m. */
function mergeSpots(all: Hotspot[], bounds: L.LatLngBounds | null, zoom: number) {
  const sorted = all.filter((h) => !bounds || bounds.contains([h.lat, h.lng])).sort((a, b) => b.score - a.score)
  // etiketterna är ~90 px breda: håll dem isär på skärmen, men minst 450 m i terrängen
  const lat = bounds ? bounds.getCenter().lat : 60
  const gap = Math.max(450, (90 * 156543 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom)
  const out: Hotspot[] = []
  for (const h of sorted) {
    if (out.some((o) => haversine(o, h) < gap)) continue
    out.push(h)
    if (out.length >= 10) break
  }
  return out
}

const reverseCache = new Map<string, Promise<string | null>>()
function municipality(lat: number, lng: number) {
  const k = `${lat.toFixed(2)},${lng.toFixed(2)}`
  let p = reverseCache.get(k)
  if (!p) {
    p = fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=sv&lat=${lat}&lon=${lng}`)
      .then((r) => r.json())
      .then((j) => (j?.address?.municipality || j?.address?.city || j?.address?.town || j?.address?.county || null) as string | null)
      .catch(() => null)
    reverseCache.set(k, p)
  }
  return p
}

function standImage(stand: NonNullable<NonNullable<AreaSelection['result']>['stand']>) {
  const s = 3
  const { mask, w, h } = stand
  const c = document.createElement('canvas')
  c.width = w * s
  c.height = h * s
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w * s, h * s)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x])
  for (let Y = 0; Y < h * s; Y++)
    for (let X = 0; X < w * s; X++) {
      const x = Math.floor(X / s), y = Math.floor(Y / s)
      if (!at(x, y)) continue
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)
      const o = (Y * w * s + X) * 4
      if (edge) img.data.set([255, 251, 235, 255], o)
      else img.data.set([255, 251, 235, 46], o)
    }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

export default function MapView() {
  const data = useData()
  const { places, routes } = data
  const { params } = useRoute()
  const toast = useToast()
  const [prefs, setPrefs] = useState<MapPrefs>(loadPrefs)
  const [map, setMap] = useState<L.Map | null>(null)
  const [zoom, setZoom] = useState(HOME.zoom)
  const [center, setCenter] = useState<LatLng>({ lat: HOME.lat, lng: HOME.lng })
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [area, setArea] = useState<AreaSelection | null>(null)
  const [areaPlace, setAreaPlace] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)
  const [me, setMe] = useState<LatLng | null>(null)
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft | null>(null)
  const [logPlace, setLogPlace] = useState<string | null>(null)
  const [rawSpots, setRawSpots] = useState<{ spots: Hotspot[]; progress: ChanceProgress }>({ spots: [], progress: { done: 0, total: 0 } })
  const [activeSpot, setActiveSpot] = useState<Hotspot | null>(null)

  const kommunIndex = useKommunIndex()
  const areaBounds = useMemo(
    () => (prefs.wholeView || !kommunIndex ? null : unionBounds(kommunIndex, prefs.areas)),
    [prefs.wholeView, prefs.areas, kommunIndex],
  )
  /** lägsta zoom där chansen visas – lägre när ett litet område är valt */
  const chanceMin = chanceMinZoom(areaBounds)
  // Vädret gäller det valda området, inte kartans mitt – annars räknas allt om när man drar i kartan
  const weatherAt = areaBounds ? { lat: (areaBounds[0][0] + areaBounds[1][0]) / 2, lng: (areaBounds[0][1] + areaBounds[1][1]) / 2 } : center
  const { weather, error: weatherError } = useWeather(weatherAt.lat, weatherAt.lng)
  /** Visa en kommun: hela kommunen i bild, men inte så långt ut att chansen döljs */
  const focusKommun = useCallback(
    (k: Kommun) => {
      if (!map || !kommunIndex) return
      const min = chanceMinZoom(unionBounds(kommunIndex, [...prefs.areas.filter((id) => id !== k.id), k.id]))
      map.fitBounds(
        [
          [k.bbox[1], k.bbox[0]],
          [k.bbox[3], k.bbox[2]],
        ],
        { padding: [40, 40], maxZoom: 14 },
      )
      if (map.getZoom() < min) map.setView([k.center[0], k.center[1]], min)
    },
    [map, kommunIndex, prefs.areas],
  )
  const addArea = useCallback(
    (id: string) => setPrefs((p) => ({ ...p, wholeView: false, areas: p.areas.includes(id) ? p.areas : [...p.areas, id] })),
    [],
  )
  const learning = useLearning(data)
  const online = useOnline()

  // Starta analysen först när vädret finns (eller efter 2,5 s) – annars räknas allt om direkt
  const [weatherSettled, setWeatherSettled] = useState(false)
  useEffect(() => {
    if (weather || weatherError) return setWeatherSettled(true)
    const t = window.setTimeout(() => setWeatherSettled(true), 2500)
    return () => window.clearTimeout(t)
  }, [weather, weatherError])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* privat läge */
    }
  }, [prefs])

  const setFilter = useCallback((patch: Partial<ForestFilter>) => setPrefs((p) => ({ ...p, filter: { ...p.filter, ...patch } })), [])

  // avrunda till 0,05 så att små väderskillnader inte räknar om kartan
  const round = (v: number) => Math.round(v * 20) / 20
  const weatherKey = weather ? Object.entries(weather.factors).map(([k, v]) => `${k}:${round(v!)}`).join() : ''
  const chanceOpts: ChanceOptions = useMemo(
    () => ({
      target: prefs.target,
      mode: prefs.chanceMode,
      doy: dayOfYear(),
      weather: weather ? Object.fromEntries(Object.entries(weather.factors).map(([k, v]) => [k, round(v!)])) : {},
      finds: learning.finds,
      misses: learning.misses,
      sigs: learning.sigs,
      minChance: prefs.minChance,
      minAreaHa: prefs.minAreaHa,
      areas: prefs.wholeView ? [] : prefs.areas,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.target, prefs.chanceMode, weatherKey, learning, prefs.minChance, prefs.minAreaHa, prefs.wholeView, prefs.areas.join()],
  )
  const offline = useOfflineSave([...prefs.areas].sort().join(','), areaBounds, chanceOpts)

  // Djuplänkar: #/karta?place=id, ?route=id eller ?lat=&lng=&z=
  useEffect(() => {
    if (!map) return
    const placeId = params.get('place')
    const routeId = params.get('route')
    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (placeId) {
      const p = places.find((x) => x.id === placeId)
      if (p) {
        setSelected(p)
        map.setView([p.lat, p.lng], 15)
        return
      }
    }
    if (routeId) {
      const r = routes.find((x) => x.id === routeId)
      if (r) {
        map.fitBounds(L.latLngBounds(r.points), { padding: [80, 80] })
        return
      }
    }
    if (Number.isFinite(lat) && Number.isFinite(lng) && params.has('lat')) {
      map.setView([lat, lng], Number(params.get('z')) || 14)
      return
    }
    map.setView([HOME.lat, HOME.lng], HOME.zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, params.toString()])

  const inspect = useCallback(
    (lat: number, lng: number) => {
      setSelected(null)
      setArea({ lat, lng, result: null })
      setAreaPlace(null)
      municipality(lat, lng).then((m) => setAreaPlace(m))
      analysis
        .inspect(lat, lng, chanceOpts)
        .then((result) => setArea((a) => (a && a.lat === lat && a.lng === lng ? { ...a, result } : a)))
        .catch(() =>
          setArea((a) => (a && a.lat === lat && a.lng === lng ? { ...a, error: 'Området kunde inte analyseras. Kontrollera anslutningen och försök igen.' } : a)),
        )
    },
    [chanceOpts],
  )

  // analysera om valt område när art/väder ändras
  useEffect(() => {
    if (area?.result) inspect(area.lat, area.lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chanceOpts])

  async function locate() {
    try {
      const p = await getCurrentPosition()
      setMe(p)
      map?.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 14), { duration: 1.2 })
    } catch (e) {
      toast({ text: (e as Error).message })
    }
  }

  const spots = useMemo(() => mergeSpots(rawSpots.spots, bounds, zoom), [rawSpots, bounds, zoom])
  const visibleRoutes = prefs.showRoutes ? routes : []
  const base = BASEMAPS[prefs.basemap]
  const chanceTab = prefs.tab === 'chans'
  const showForest = prefs.filter.enabled && (!chanceTab || prefs.forestUnder)
  const zoomHint = chanceTab ? zoom < chanceMin : showForest && zoom < FOREST_MIN_ZOOM
  const standUrl = useMemo(() => (area?.result?.stand ? standImage(area.result.stand) : null), [area?.result])
  const sheetOpen = !!(area || selected)
  const { done, total } = rawSpots.progress
  const analysing = chanceTab && zoom >= chanceMin && (total > 0 || !weatherSettled)
  const pct = total ? Math.round((done / total) * 100) : 0

  const closeSheet = () => {
    setArea(null)
    setSelected(null)
    setActiveSpot(null)
  }

  // Esc stänger områdes-/platskortet (men inte när ett formulär är öppet)
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
      setArea(null)
      setSelected(null)
      setActiveSpot(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const isActive = (h: Hotspot) => !!activeSpot && activeSpot.lat === h.lat && activeSpot.lng === h.lng

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapContainer center={[HOME.lat, HOME.lng]} zoom={HOME.zoom} minZoom={4} maxZoom={19} zoomControl={false} className="isolate size-full" ref={setMap} worldCopyJump>
        <TileLayer key={prefs.basemap} url={base.url} attribution={base.attribution} maxNativeZoom={base.maxNativeZoom} maxZoom={19} subdomains={base.subdomains ?? 'abc'} className={base.className} crossOrigin="anonymous" />
        {base.detail && <TileLayer key={`${prefs.basemap}-detail`} url={base.detail.url} minZoom={base.detail.minZoom} maxZoom={19} crossOrigin="anonymous" />}
        {prefs.hillshade && (
          <Pane name="hillshade" style={{ zIndex: 250, mixBlendMode: 'multiply' }}>
            <TileLayer url={HILLSHADE_URL} opacity={prefs.hillshadeOpacity} maxNativeZoom={16} maxZoom={19} attribution="Terrängskuggning &copy; Esri" crossOrigin="anonymous" />
          </Pane>
        )}
        {showForest && <ForestOverlay filter={chanceTab ? { ...prefs.filter, opacity: Math.min(prefs.filter.opacity, 0.35) } : prefs.filter} />}
        {chanceTab && weatherSettled && (
          <ChanceOverlay opts={chanceOpts} bounds={areaBounds} onHotspots={(s, progress) => setRawSpots({ spots: s, progress })} />
        )}
        {chanceTab && !prefs.wholeView && kommunIndex && <AreaOutlines index={kommunIndex} selected={prefs.areas} onAdd={addArea} />}

        <Pane name="stand" style={{ zIndex: 340 }}>
          {standUrl && area?.result?.stand && (
            <ImageOverlay
              url={standUrl}
              bounds={[
                [area.result.stand.south, area.result.stand.west],
                [area.result.stand.north, area.result.stand.east],
              ]}
              pane="stand"
            />
          )}
        </Pane>

        {visibleRoutes.map((r) => (
          <Polyline key={r.id} positions={r.points} pathOptions={{ color: '#fffbeb', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round', dashArray: '1 8' }} />
        ))}

        {chanceTab &&
          spots.map((h, i) => (
            <Marker
              key={`${h.lat},${h.lng},${h.species}`}
              position={[h.lat, h.lng]}
              icon={hotspotIcon(h, i, isActive(h))}
              title={`${SPECIES_BY_ID[h.species].name} – ${Math.round(h.score * 100)} % chans`}
              alt={`${SPECIES_BY_ID[h.species].name}, ${Math.round(h.score * 100)} procent`}
              zIndexOffset={500 - i}
              keyboard
              eventHandlers={{
                click: () => {
                  setActiveSpot(h)
                  inspect(h.lat, h.lng)
                },
              }}
            />
          ))}

        {prefs.showPlaces &&
          places.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={placeIcon(p.kind, selected?.id === p.id, matchSpecies(p.species || p.name))}
              title={p.name}
              alt={p.name}
              zIndexOffset={1000}
              keyboard
              eventHandlers={{
                click: () => {
                  setArea(null)
                  setActiveSpot(null)
                  setSelected(p)
                },
              }}
            />
          ))}

        {prefs.showPlaces &&
          (data.feedback ?? []).map((f) => (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={feedbackIcon(f.found)} interactive={false} zIndexOffset={200} />
          ))}

        {area && !activeSpot && <Marker position={[area.lat, area.lng]} icon={pickIcon} interactive={false} />}
        {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}

        <MapSizeWatcher />
        <MapEvents
          onClick={(ll) => inspect(ll.lat, ll.lng)}
          onMove={(m) => {
            setZoom(m.getZoom())
            const c = m.getCenter()
            setCenter({ lat: c.lat, lng: c.lng })
            // en karta som ännu inte fått sin storlek ger en punkt som gräns – ignorera den
            const bb = m.getBounds()
            if (bb.getNorth() > bb.getSouth()) setBounds(bb)
          }}
        />
      </MapContainer>

      {/* --- Svävande UI --- */}
      <Panel
        prefs={prefs}
        setPrefs={setPrefs}
        setFilter={setFilter}
        map={map}
        open={panelOpen}
        setOpen={setPanelOpen}
        chance={
          <>
            <AreaCard
              index={kommunIndex}
              selected={prefs.areas}
              wholeView={prefs.wholeView}
              onChange={(areas) => setPrefs((p) => ({ ...p, areas }))}
              onWholeView={(wholeView) => setPrefs((p) => ({ ...p, wholeView }))}
              onFocus={focusKommun}
              offline={offline.state}
              onSaveOffline={offline.start}
              onCancelOffline={offline.cancel}
            />
            <WeatherCard weather={weather} error={weatherError} />
            <MinChanceCard
              value={prefs.minChance}
              onChange={(minChance) => setPrefs((p) => ({ ...p, minChance }))}
              ceiling={chanceCeiling(prefs.target, prefs.chanceMode, dayOfYear(), center.lat, chanceOpts.weather)}
              minArea={prefs.minAreaHa}
              onMinArea={(minAreaHa) => setPrefs((p) => ({ ...p, minAreaHa }))}
            />
            <HotspotList
              spots={spots}
              progress={rawSpots.progress}
              center={me ?? center}
              target={prefs.target}
              minChance={prefs.minChance}
              zoomTooLow={zoom < chanceMin}
              onPick={(h) => {
                setActiveSpot(h)
                setPanelOpen(false)
                map?.flyTo([h.lat, h.lng], Math.max(zoom, 15), { duration: 1 })
                inspect(h.lat, h.lng)
              }}
            />
            <TargetPicker target={prefs.target} lat={center.lat} onChange={(target) => setPrefs((p) => ({ ...p, target }))} />
            <ChanceSettings mode={prefs.chanceMode} onMode={(chanceMode) => setPrefs((p) => ({ ...p, chanceMode }))} learned={learning.count} />
          </>
        }
      />

      <MapControls map={map} onLocate={locate} shifted={sheetOpen} />

      {/* Analysförlopp */}
      {!online && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-[900] flex justify-center px-4 lg:bottom-6 lg:pl-[420px]">
          <div className="glass flex items-center gap-2 !rounded-full py-1.5 pr-4 pl-3 text-[13px] font-semibold" role="status" aria-live="polite">
            <WifiSlash size={16} className="text-sage-600" aria-hidden="true" /> Offline – visar sparad data
          </div>
        </div>
      )}
      {analysing && !zoomHint && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(5.25rem+env(safe-area-inset-top))] z-[900] flex justify-center px-4 lg:top-24 lg:pl-[420px]">
          <div className="glass flex items-center gap-3 !rounded-full py-2 pr-4 pl-3 text-sm font-semibold" role="status" aria-live="polite">
            <SpinnerGap size={18} className="animate-spin text-forest-600" aria-hidden="true" />
            <span>{weatherSettled ? 'Analyserar skogen' : 'Hämtar väder'}</span>
            {total > 0 && (
              <>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-sand-200" aria-hidden="true">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber to-ember transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-9 text-right tabular text-ink-muted">{pct}%</span>
              </>
            )}
          </div>
        </div>
      )}

      {zoomHint && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(5.25rem+env(safe-area-inset-top))] z-[900] flex justify-center px-4 lg:top-24 lg:pl-[420px]">
          <div className="glass pointer-events-auto flex items-center gap-3 !rounded-full py-1.5 pr-1.5 pl-4 text-sm font-semibold">
            <TreeEvergreen size={18} className="text-forest-600" aria-hidden="true" />
            {chanceTab ? 'Zooma in för att se chansen' : 'Zooma in för att se skogen'}
            <button
              type="button"
              className="btn btn-primary !min-h-9 !px-4 !text-[13px]"
              onClick={() => {
                // med valda områden: visa dem, annars zooma in där man är
                const first = kommunIndex?.find((k) => k.id === prefs.areas[0])
                if (chanceTab && !prefs.wholeView && first) focusKommun(first)
                else map?.setZoom(chanceTab ? chanceMin + 1 : FOREST_MIN_ZOOM + 2)
              }}
            >
              Zooma in
            </button>
          </div>
        </div>
      )}

      {/* Mobil: aktuell art som pill ovanför menyn */}
      {chanceTab && !sheetOpen && (
        <div className="fixed inset-x-0 bottom-[calc(5.9rem+env(safe-area-inset-bottom))] z-[900] flex justify-center px-4 lg:hidden">
          <button type="button" data-tour="species-pill" onClick={() => setPanelOpen(true)} className="glass-strong flex min-h-12 items-center gap-2.5 !rounded-full py-1.5 pr-4 pl-1.5 text-sm font-bold">
            {prefs.target === 'svamp' || prefs.target === 'bar' ? (
              <span className="grid size-9 place-items-center rounded-full bg-forest-700 text-amber">
                <Mushroom size={18} weight="fill" />
              </span>
            ) : (
              <SpeciesIcon id={prefs.target} size={28} className="size-9 rounded-full bg-white" />
            )}
            {targetLabel(prefs.target)}
            {prefs.minChance > 0 && <span className="rounded-full bg-forest-700 px-2 py-0.5 text-xs text-bone tabular">≥ {Math.round(prefs.minChance * 100)} %</span>}
            {spots.length > 0 && <span className="rounded-full bg-[#fde3cf] px-2 py-0.5 text-xs text-[#9a3412]">{spots.length} ställen</span>}
            {analysing && <SpinnerGap size={16} className="animate-spin text-sage-600" />}
            <CaretUp size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* Områdes-/platskort: höger på dator, bottenark på mobil */}
      {sheetOpen && (
        <div className="glass-strong rise fixed inset-x-0 bottom-0 z-[1050] flex max-h-[72dvh] flex-col overflow-hidden !rounded-b-none pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:top-24 lg:right-6 lg:bottom-6 lg:max-h-none lg:w-[400px] lg:!rounded-[2rem] lg:pb-0">
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-sage-300/80 lg:hidden" aria-hidden="true" />
          {area && (
            <AreaSheet
              sel={area}
              target={prefs.target}
              weather={weather}
              place={areaPlace}
              onClose={closeSheet}
              feedbackNear={(data.feedback ?? []).filter((f) => haversine(f, area) < 200)}
              onFeedback={(found, species) => {
                // "Hittade inget" med "Alla svampar/bär" gäller hela gruppen
                const group = prefs.target === 'svamp' || prefs.target === 'bar'
                const fb = actions.addFeedback({ lat: area.lat, lng: area.lng, species: !found && group ? prefs.target : species, found })
                toast({
                  text: found
                    ? `Tack! ${SPECIES_BY_ID[species].name} räknas in här`
                    : `Noterat – chansen för ${group ? targetLabel(prefs.target).toLowerCase() : SPECIES_BY_ID[species].name.toLowerCase()} sänks här de närmaste veckorna`,
                  action: { label: 'Ångra', run: () => actions.deleteFeedback(fb.id) },
                })
              }}
              onSave={({ name, species }) =>
                setPlaceDraft({
                  lat: area.lat,
                  lng: area.lng,
                  name,
                  kind: species ? SPECIES_BY_ID[species].kind : 'svamp',
                  species: species ? SPECIES_BY_ID[species].name : '',
                })
              }
            />
          )}
          {selected && (
            <PlaceSheet
              place={places.find((p) => p.id === selected.id) ?? selected}
              onClose={closeSheet}
              onEdit={() => setPlaceDraft(places.find((p) => p.id === selected.id) ?? selected)}
              onLog={() => setLogPlace(selected.id)}
              onAnalyse={() => inspect(selected.lat, selected.lng)}
            />
          )}
        </div>
      )}

      <PlaceForm open={!!placeDraft} draft={placeDraft} onClose={() => setPlaceDraft(null)} />
      <LogForm open={!!logPlace} entry={logPlace ? { placeId: logPlace } : null} onClose={() => setLogPlace(null)} />
    </div>
  )
}

/** Leaflet märker inte själv när behållaren får sin storlek (t.ex. efter lat laddning). */
function MapSizeWatcher() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    ro.observe(el)
    const raf = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [map])
  return null
}

function MapEvents({ onClick, onMove }: { onClick: (ll: L.LatLng) => void; onMove: (m: L.Map) => void }) {
  const cbs = useRef({ onClick, onMove })
  cbs.current = { onClick, onMove }
  const map = useMapEvents({
    click: (e) => cbs.current.onClick(e.latlng),
    moveend: () => cbs.current.onMove(map),
    zoomend: () => cbs.current.onMove(map),
  })
  useEffect(() => cbs.current.onMove(map), [map])
  return null
}

/* ------------------------------------------------------------------ */

function MapControls({ map, onLocate, shifted }: { map: L.Map | null; onLocate: () => void; shifted: boolean }) {
  return (
    <div
      className={`fixed top-[calc(5.25rem+env(safe-area-inset-top))] right-3 z-[900] flex flex-col gap-2 transition-[right] duration-300 lg:top-24 ${
        shifted ? 'lg:right-[436px]' : 'lg:right-6'
      }`}
    >
      <div className="glass flex flex-col !rounded-full p-1">
        <button type="button" className="icon-btn" aria-label="Zooma in" onClick={() => map?.zoomIn()}>
          <Plus size={20} />
        </button>
        <span className="mx-auto h-px w-6 bg-sage-300/70" aria-hidden="true" />
        <button type="button" className="icon-btn" aria-label="Zooma ut" onClick={() => map?.zoomOut()}>
          <Minus size={20} />
        </button>
      </div>
      <button type="button" className="glass icon-btn !rounded-full" aria-label="Visa min position" onClick={onLocate}>
        <Crosshair size={20} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Section({ icon, title, children, hint }: { icon: ReactNode; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="border-t border-sand-200/70 py-5 first:border-0 first:pt-1">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold tracking-wide text-forest-800 uppercase">
        <span className="text-sage-600" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      <div className="grid gap-4">{children}</div>
      {hint && <p className="mt-3 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </section>
  )
}

function Panel({
  prefs,
  setPrefs,
  setFilter,
  map,
  open,
  setOpen,
  chance,
}: {
  prefs: MapPrefs
  setPrefs: Dispatch<SetStateAction<MapPrefs>>
  setFilter: (p: Partial<ForestFilter>) => void
  map: L.Map | null
  open: boolean
  setOpen: (v: boolean) => void
  chance: ReactNode
}) {
  const f = prefs.filter
  const coniferInRange = f.leaf[0] <= 10

  const tour = useTour()
  const tabs = (
    <div data-tour="tabs">
      <Segmented
        label="Kartläge"
        value={prefs.tab}
        onChange={(tab) => setPrefs((p) => ({ ...p, tab }))}
        options={[
          { value: 'chans', label: 'Svamp & bär' },
          { value: 'skog', label: 'Skogsfilter' },
        ]}
      />
    </div>
  )

  const forest = (
    <>
      <Section icon={<Leaf size={16} weight="bold" />} title="Lövskog vs barrskog">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold">Lövandel</span>
            <span className="tabular text-xs font-semibold text-ink-muted">
              {f.leaf[0]}–{f.leaf[1]} %
            </span>
          </div>
          <DualRange value={f.leaf} onChange={(v) => setFilter({ leaf: v })} labelMin="Minsta lövandel" labelMax="Största lövandel" />
          <div className="mt-1 flex justify-between text-[11px] font-medium text-ink-muted">
            <span>Barrskog</span>
            <span>Blandskog</span>
            <span>Lövskog</span>
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold">Barrträd</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['tall', 'Tall'],
                ['gran', 'Gran'],
                ['blandbarr', 'Blandat barr'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="chip disabled:opacity-40"
                aria-pressed={f.conifers[k]}
                disabled={!coniferInRange}
                onClick={() => setFilter({ conifers: { ...f.conifers, [k]: !f.conifers[k] } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        icon={<TreeEvergreen size={16} weight="bold" />}
        title="Skogens ålder"
        hint="NMD skiljer ut hyggen och ungskog. Exakt ålder och trädhöjd finns i Skogsstyrelsens data, som kräver ett kostnadsfritt konto."
      >
        <Segmented
          label="Skogens ålder"
          value={f.age}
          onChange={(age) => setFilter({ age })}
          options={[
            { value: 'alla', label: 'Alla' },
            { value: 'etablerad', label: 'Etablerad' },
            { value: 'ung', label: 'Hygge/ung' },
          ]}
        />
      </Section>

      <Section icon={<Drop size={16} weight="bold" />} title="Markfuktighet">
        <Segmented
          label="Markfuktighet"
          value={f.moisture}
          onChange={(moisture) => setFilter({ moisture })}
          options={[
            { value: 'alla', label: 'Alla' },
            { value: 'torr', label: 'Fastmark' },
            { value: 'fuktig', label: 'Fuktig' },
          ]}
        />
        <Toggle label="Visa skog" checked={f.forest} onChange={(forest) => setFilter({ forest })} />
        <Toggle label="Visa myrar" description="Hjortron och tranbär" checked={f.mires} onChange={(mires) => setFilter({ mires })} />
        <RangeSlider label="Täckning" value={Math.round(f.opacity * 100)} onChange={(v) => setFilter({ opacity: v / 100 })} format={(v) => `${v} %`} />
      </Section>

      <section className="border-t border-sand-200/70 py-5">
        <h3 className="sr-only">Teckenförklaring</h3>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
          {LEGEND_ITEMS.map((it) => {
            const [r, g, b] = colorFor(CLASSES.get(it.code)!)
            return (
              <li key={it.code} className="flex items-center gap-2 text-xs font-medium text-forest-800">
                <span className="size-3.5 shrink-0 rounded-md ring-1 ring-black/5" style={{ background: `rgb(${r} ${g} ${b})` }} aria-hidden="true" />
                {it.label}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )

  const layers = (
    <Section icon={<Stack size={16} weight="bold" />} title="Kartlager">
      <Segmented
        label="Bakgrundskarta"
        value={prefs.basemap}
        onChange={(basemap) => setPrefs((p) => ({ ...p, basemap }))}
        options={[
          { value: 'flygfoto', label: 'Flygfoto' },
          { value: 'ljus', label: 'Karta' },
          { value: 'terrang', label: 'Terräng' },
        ]}
      />
      {prefs.tab === 'chans' && (
        <Toggle label="Skogsområden under" description="Visa skogstyperna svagt under chansen" checked={prefs.forestUnder} onChange={(forestUnder) => setPrefs((p) => ({ ...p, forestUnder }))} />
      )}
      <Toggle
        label="Terrängskuggning"
        icon={<Mountains size={18} />}
        checked={prefs.hillshade}
        onChange={(hillshade) => setPrefs((p) => ({ ...p, hillshade }))}
      />
      <Toggle label="Mina platser" checked={prefs.showPlaces} onChange={(showPlaces) => setPrefs((p) => ({ ...p, showPlaces }))} />
      <Toggle label="Mina rutter" checked={prefs.showRoutes} onChange={(showRoutes) => setPrefs((p) => ({ ...p, showRoutes }))} />
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Data: NMD 2023 (Naturvårdsverket), Jordarter (SGU), SLU skogsålder 2025 (CC BY 4.0), fynd från GBIF/Artportalen, Terrain Tiles (AWS), Open-Meteo, OpenStreetMap, Esri. Allt öppet och gratis.
      </p>
    </Section>
  )

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-1 text-lg font-bold">
        {prefs.tab === 'chans' ? 'Hitta svamp & bär' : 'Filtrera skogar'}
        <button type="button" onClick={tour.start} className="icon-btn !size-8 text-sage-600" aria-label="Visa guiden" title="Visa guiden">
          <Question size={18} />
        </button>
      </h2>
      {prefs.tab === 'skog' && (
        <button type="button" className="btn btn-ghost !min-h-9 !px-3 !text-[13px]" onClick={() => setPrefs((p) => ({ ...p, filter: DEFAULT_FILTER }))}>
          <ArrowCounterClockwise size={16} /> Återställ
        </button>
      )}
    </div>
  )

  const body = (withSearch: boolean) => (
    <div className="grid gap-4">
      {withSearch && <SearchBox map={map} />}
      {tabs}
      {prefs.tab === 'chans' ? <div className="grid gap-4">{chance}</div> : <div>{forest}</div>}
      {layers}
    </div>
  )

  return (
    <>
      <aside aria-label="Kartpanel" className="glass-strong fixed top-24 bottom-6 left-6 z-[900] hidden w-[380px] flex-col overflow-hidden lg:flex">
        <div className="px-5 pt-5">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-2">{body(true)}</div>
      </aside>

      <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[900] flex gap-2 lg:hidden">
        <div className="glass-strong min-w-0 flex-1 !rounded-full">
          <SearchBox map={map} compact />
        </div>
        <button type="button" data-tour="filter-btn" className="glass-strong icon-btn !size-12 !rounded-full" aria-label="Visa filter" aria-expanded={open} onClick={() => setOpen(!open)}>
          <SlidersHorizontal size={22} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[1100] lg:hidden" role="dialog" aria-modal="true" aria-label="Kartpanel">
          <button type="button" aria-label="Stäng" className="absolute inset-0 bg-forest-900/20 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <div className="glass-strong rise absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col !rounded-b-none">
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-sage-300/80" aria-hidden="true" />
            <div className="flex items-center gap-2 px-5 pt-3">
              <div className="flex-1">{header}</div>
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">{body(false)}</div>
            <div className="border-t border-sand-200/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" className="btn btn-primary w-full" onClick={() => setOpen(false)}>
                Visa på kartan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */

interface GeoResult {
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}

/** Platssökning via OpenStreetMap Nominatim (gratis, sök sker bara vid Enter). */
function SearchBox({ map, compact = false }: { map: L.Map | null; compact?: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(e: FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    setError('')
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=se&accept-language=sv&viewbox=${HOME.searchBox.join(',')}&q=${encodeURIComponent(q.trim())}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      setResults((await res.json()) as GeoResult[])
    } catch {
      setError('Sökningen misslyckades. Kontrollera anslutningen och försök igen.')
    } finally {
      setBusy(false)
    }
  }

  function go(r: GeoResult) {
    const [s, n, w, e] = r.boundingbox.map(Number)
    map?.flyToBounds(
      [
        [s, w],
        [n, e],
      ],
      { maxZoom: 14, duration: 1.2 },
    )
    setResults(null)
    setQ(r.display_name.split(',')[0])
  }

  return (
    <div className="relative">
      <form onSubmit={search} role="search">
        <label htmlFor={compact ? 'search-m' : 'search-d'} className="sr-only">
          Sök plats
        </label>
        <div className={`flex items-center gap-2 ${compact ? 'px-4' : 'field !rounded-full !px-4 !py-0'}`}>
          {busy ? (
            <SpinnerGap size={18} className="shrink-0 animate-spin text-sage-600" />
          ) : (
            <MagnifyingGlass size={18} className="shrink-0 text-sage-600" aria-hidden="true" />
          )}
          <input
            id={compact ? 'search-m' : 'search-d'}
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök sjö, by eller naturreservat"
            className="min-h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink-muted/70"
            autoComplete="off"
          />
          {q && (
            <button type="button" className="icon-btn -mr-2 !size-9" aria-label="Rensa sökning" onClick={() => (setQ(''), setResults(null))}>
              <X size={16} />
            </button>
          )}
        </div>
      </form>
      {(results || error) && (
        <div className="glass-strong absolute inset-x-0 top-full z-10 mt-2 overflow-hidden !rounded-3xl p-1.5">
          {error && <p className="p-3 text-sm text-danger">{error}</p>}
          {results?.length === 0 && <p className="p-3 text-sm text-ink-muted">Inga träffar. Prova ett annat namn.</p>}
          <ul>
            {results?.map((r) => (
              <li key={`${r.lat}${r.lon}`}>
                <button type="button" onClick={() => go(r)} className="w-full rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-white/80">
                  <span className="block font-semibold">{r.display_name.split(',')[0]}</span>
                  <span className="block truncate text-xs text-ink-muted">{r.display_name.split(',').slice(1).join(',')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function PlaceSheet({ place, onClose, onEdit, onLog, onAnalyse }: { place: Place; onClose: () => void; onEdit: () => void; onLog: () => void; onAnalyse: () => void }) {
  const sp = matchSpecies(place.species || place.name)
  return (
    <section aria-label={place.name} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-5">
      <div className="flex items-start gap-3">
        {sp ? (
          <SpeciesIcon id={sp} size={34} className="size-12 rounded-full bg-white shadow-sm ring-1 ring-sand-200" />
        ) : (
          <span className="grid size-12 place-items-center rounded-full bg-white ring-1 ring-sand-200">
            <Mushroom size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl leading-tight font-bold">{place.name}</h2>
          <p className="text-sm text-ink-muted">{[place.species, place.kind === 'svamp' ? 'Svampställe' : 'Bärställe'].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="icon-btn -mt-1 -mr-2" aria-label="Stäng" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <KindBadge kind={place.kind} />
        <YieldDots value={place.yield} />
      </div>
      {place.notes && <p className="mt-3 text-sm leading-relaxed text-forest-900">{place.notes}</p>}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary mt-4 w-full"
      >
        <NavigationArrow size={18} weight="bold" className="rotate-90" /> Hitta hit
      </a>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" className="btn border border-forest-700/70 bg-white/60 !px-2 text-forest-800" onClick={onEdit}>
          <PencilSimple size={16} /> Redigera
        </button>
        <button type="button" className="btn border border-forest-700/70 bg-white/60 !px-2 text-forest-800" onClick={onLog}>
          <BookOpenText size={16} /> Logga
        </button>
        <button type="button" className="btn border border-forest-700/70 bg-white/60 !px-2 text-forest-800" onClick={onAnalyse}>
          <TreeEvergreen size={16} /> Analys
        </button>
      </div>
    </section>
  )
}
