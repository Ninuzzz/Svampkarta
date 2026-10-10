/**
 * Kartans startvy för ett hemområde. Ren kod utan beroenden, så att den går att testa.
 */

/** Utbredning som [väst, syd, öst, nord]. */
export type BBox = readonly [number, number, number, number]

export interface View {
  lat: number
  lng: number
  zoom: number
}

/** Hela Sverige: det kartan visar innan ett område är valt. */
export const SWEDEN_VIEW: View = { lat: 62.6, lng: 16.6, zoom: 5 }

/** Så länge öppnas kartan där man senast tittade; därefter hemma igen. */
export const LAST_VIEW_MS = 6 * 3600 * 1000

/**
 * Handinställda vyer. Landskronas gräns går långt ut i Öresund och skogen ligger inåt land:
 * på smal skärm visas ett zoomsteg längre ut och förskjutet österut, så att kommunens land ryms.
 */
const TUNED: Record<string, { wide: View; narrow: View }> = {
  '1282': { wide: { lat: 55.8708, lng: 12.8302, zoom: 12 }, narrow: { lat: 55.865, lng: 12.938, zoom: 11 } },
}

const mercX = (lng: number) => (lng + 180) / 360
const mercY = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2

/** Högsta hela zoom där utbredningen ryms i en yta på w × h pixlar. */
export function fitZoom(bbox: BBox, w: number, h: number) {
  const dx = mercX(bbox[2]) - mercX(bbox[0])
  const dy = mercY(bbox[1]) - mercY(bbox[3])
  if (!(dx > 0) || !(dy > 0) || !(w > 0) || !(h > 0)) return 12
  return Math.floor(Math.log2(Math.min(w / (256 * dx), h / (256 * dy))))
}

/**
 * Startvyn för ett hemområde i ett fönster på width × height pixlar.
 * Hela kommunen i bild om det går, men aldrig längre ut än `minZoom` (där chansen slutar visas)
 * och aldrig närmare än zoom 13. På bred skärm täcker kartpanelen vänsterkanten: mitten flyttas dit.
 */
export function homeView(home: { id: string; lat: number; lng: number; bbox: BBox }, width: number, height: number, minZoom: number): View {
  const wide = width >= 1024
  const tuned = TUNED[home.id]
  if (tuned) return wide ? tuned.wide : tuned.narrow
  const panel = wide ? 420 : 0
  // fritt från sökfält, knappar och meny
  const zoom = Math.max(minZoom, Math.min(13, fitZoom(home.bbox, width - panel - 48, height - (wide ? 160 : 280))))
  const lng = home.lng - ((panel / 2) * 360) / (256 * 2 ** zoom)
  return { lat: home.lat, lng, zoom }
}

/** Den sparade senaste vyn, om den är giltig och färsk nog. */
export function lastView(raw: string | null, now: number): View | null {
  try {
    const v = JSON.parse(raw ?? 'null') as { lat?: unknown; lng?: unknown; zoom?: unknown; t?: unknown } | null
    if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number' || typeof v.zoom !== 'number' || typeof v.t !== 'number') return null
    if (!(v.lat > 54 && v.lat < 70 && v.lng > 9 && v.lng < 26 && v.zoom >= 4 && v.zoom <= 19)) return null
    if (now - v.t > LAST_VIEW_MS || v.t > now + 60_000) return null
    return { lat: v.lat, lng: v.lng, zoom: v.zoom }
  } catch {
    return null
  }
}

/** Sökningens prioriterade område: en grov ruta runt hemområdet (väst, nord, öst, syd), avrundad till halva grader. */
export function searchBox(bbox: BBox): [number, number, number, number] {
  const down = (v: number) => Math.floor((v - 0.4) * 2) / 2
  const up = (v: number) => Math.ceil((v + 0.4) * 2) / 2
  return [down(bbox[0]), up(bbox[3]), up(bbox[2]), down(bbox[1])]
}
