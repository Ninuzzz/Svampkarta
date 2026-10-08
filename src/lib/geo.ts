import type { LatLng } from './types'

const R = 6371008.8

export function haversine(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function pathLength(points: [number, number][]) {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += haversine({ lat: points[i - 1][0], lng: points[i - 1][1] }, { lat: points[i][0], lng: points[i][1] })
  }
  return d
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} km`
}

export function formatDuration(s: number | null) {
  if (s == null) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('sv-SE', opts)
}

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Läser spårpunkter ur en GPX-fil (trk/rte/wpt i den ordningen). */
export function parseGpx(xml: string): { name: string | null; points: [number, number][]; duration: number | null; date: string | null } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Filen är inte en giltig GPX-fil')
  let nodes = Array.from(doc.getElementsByTagName('trkpt'))
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('rtept'))
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('wpt'))
  const points = nodes
    .map((n) => [Number(n.getAttribute('lat')), Number(n.getAttribute('lon'))] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  if (points.length < 2) throw new Error('Hittade inga spårpunkter i filen')
  const times = nodes.map((n) => n.getElementsByTagName('time')[0]?.textContent).filter(Boolean) as string[]
  const duration = times.length > 1 ? (Date.parse(times[times.length - 1]) - Date.parse(times[0])) / 1000 : null
  const name = doc.getElementsByTagName('name')[0]?.textContent?.trim() || null
  return { name, points, duration: duration && duration > 0 ? duration : null, date: times[0]?.slice(0, 10) ?? null }
}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Din webbläsare stöder inte platstjänster'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Platsåtkomst nekades. Tillåt plats i webbläsarens inställningar.'
              : 'Kunde inte hämta din position just nu.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}
