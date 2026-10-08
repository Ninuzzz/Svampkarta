import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { ForestLayer } from './ForestLayer'
import { ChanceLayer, chanceMinZoom, type ChanceProgress } from './ChanceLayer'
import type { ForestFilter } from './nmd'
import type { Kind } from '../lib/types'
import type { ChanceOptions, Hotspot } from '../analysis/protocol'
import { speciesSvg } from '../analysis/icons'
import type { SpeciesId } from '../analysis/species'

export type Basemap = 'ljus' | 'terrang' | 'flygfoto'

/** Alla bakgrundskartor är gratis och kräver ingen API-nyckel. */
export const BASEMAPS: Record<
  Basemap,
  {
    url: string
    attribution: string
    maxNativeZoom: number
    subdomains?: string
    className?: string
    /** skarpare lager ovanpå från en viss zoom (det undre syns medan det laddas) */
    detail?: { url: string; minZoom: number }
  }
> = {
  ljus: {
    // OpenStreetMap, mjukad med CSS-filter till appens benvita ton
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare',
    maxNativeZoom: 19,
    className: 'basemap-soft',
  },
  terrang: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxNativeZoom: 17,
    subdomains: 'abc',
  },
  flygfoto: {
    // Esri Clarity: en enhetlig sommarbild utan World Imagerys disiga lappar
    // (t.ex. kring Häljarp–Annelöv), men bara till zoom 14
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Flygfoto &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 14,
    detail: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', minZoom: 15 },
  },
}

export const HILLSHADE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'

/** Chanskartan för vald art. Byter bara innehåll när analysvalen ändras. */
export function ChanceOverlay({
  opts,
  bounds,
  onHotspots,
}: {
  opts: ChanceOptions
  /** begränsa analysen till valda områden */
  bounds: [[number, number], [number, number]] | null
  onHotspots: (h: Hotspot[], progress: ChanceProgress) => void
}) {
  const map = useMap()
  const layer = useRef<ChanceLayer | null>(null)
  const optsKey = JSON.stringify(opts)
  const boundsKey = JSON.stringify(bounds)
  const cb = useRef(onHotspots)
  cb.current = onHotspots

  useEffect(() => {
    if (!map.getPane('chance')) map.createPane('chance').style.zIndex = '320'
    const l = new ChanceLayer(opts, {
      pane: 'chance',
      minZoom: chanceMinZoom(bounds),
      ...(bounds ? { bounds: L.latLngBounds(bounds) } : {}),
      attribution:
        'Jordarter &copy; <a href="https://www.sgu.se">SGU</a> · <a href="https://gis.slu.se/data/skogsdatalabbet/SLU_skogsalder_2025/">SLU skogsålder 2025</a> · Stigar &copy; OpenStreetMap/OpenFreeMap · Höjd: Terrain Tiles (AWS) · Väder: <a href="https://open-meteo.com">Open-Meteo</a>',
    })
    l.onHotspots = (h, progress) => cb.current(h, progress)
    l.addTo(map)
    layer.current = l
    return () => {
      l.remove()
      layer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // Nya områden: byt utbredning och rita om (setOptions hoppas över – redraw räknar med nya val)
  const firstArea = useRef(true)
  const areaChanged = useRef(false)
  useEffect(() => {
    if (firstArea.current) {
      firstArea.current = false
      return
    }
    areaChanged.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, JSON.stringify(opts.areas)])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const l = layer.current
    if (!l) return
    if (areaChanged.current) {
      areaChanged.current = false
      l.setArea(bounds, opts)
    } else l.setOptions(opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey, boundsKey])

  return null
}

/** Lägger NMD-skogslagret på kartan och uppdaterar filtret utan att ladda om rutor. */
export function ForestOverlay({ filter, onReady }: { filter: ForestFilter; onReady?: (l: ForestLayer | null) => void }) {
  const map = useMap()
  const layer = useRef<ForestLayer | null>(null)

  useEffect(() => {
    if (!map.getPane('forest')) {
      const pane = map.createPane('forest')
      pane.style.zIndex = '300'
    }
    const l = new ForestLayer(filter, {
      pane: 'forest',
      attribution: 'Skogsdata: <a href="https://www.naturvardsverket.se/verktyg-och-tjanster/kartor-och-karttjanster/nationella-marktackedata/">NMD 2023, Naturvårdsverket</a>',
    })
    l.addTo(map)
    layer.current = l
    onReady?.(l)
    return () => {
      l.remove()
      layer.current = null
      onReady?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    layer.current?.setFilter(filter)
  }, [filter])

  return null
}

const MUSHROOM_SVG =
  '<svg width="16" height="16" viewBox="0 0 256 256" fill="none" aria-hidden="true"><path d="M32 128a96 96 0 0 1 192 0 8 8 0 0 1-8 8H40a8 8 0 0 1-8-8Z" fill="currentColor"/><path d="M96 136v64a24 24 0 0 0 24 24h16a24 24 0 0 0 24-24v-64" stroke="currentColor" stroke-width="22" stroke-linecap="round"/></svg>'
const BERRY_SVG =
  '<svg width="16" height="16" viewBox="0 0 256 256" fill="none" aria-hidden="true"><path d="M120 40c-4 40-30 70-56 92M120 40c16 30 40 60 76 80" stroke="currentColor" stroke-width="18" stroke-linecap="round"/><circle cx="76" cy="176" r="48" fill="currentColor"/><circle cx="184" cy="160" r="44" fill="currentColor"/></svg>'

export function placeIcon(kind: Kind, selected = false, species: SpeciesId | null = null) {
  const glyph = species ? speciesSvg(species, 22) : kind === 'svamp' ? MUSHROOM_SVG : BERRY_SVG
  return L.divIcon({
    className: '',
    html: `<div class="pin ${kind === 'svamp' ? 'pin-svamp' : 'pin-bar'} ${species ? 'pin-species' : ''} ${selected ? 'pin-selected' : ''}"><span>${glyph}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 46],
  })
}

/** Hotspot: artikon på glasbricka med chans i procent (hittaskog-lik, med siffra som twist). */
export function hotspotIcon(h: Hotspot, rank: number, active = false) {
  const pct = Math.round(h.score * 100)
  return L.divIcon({
    className: '',
    html: `<div class="hs ${active ? 'hs-active' : ''} ${rank < 3 ? 'hs-top' : ''}"><span class="hs-ico">${speciesSvg(h.species, 26)}</span><b>${pct}&nbsp;%</b></div>`,
    iconSize: [80, 44],
    iconAnchor: [22, 22],
  })
}

/** Dina markeringar: ✓ hittade, ⦸ hittade inget */
export function feedbackIcon(found: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="fb ${found ? 'fb-yes' : 'fb-no'}">${found ? '✓' : '×'}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

export const pickIcon = L.divIcon({ className: '', html: '<div class="pin-pick"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
export const meIcon = L.divIcon({ className: '', html: '<div class="pin-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
