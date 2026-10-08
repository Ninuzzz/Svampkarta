import { useEffect, useState } from 'react'

/** Kommun i public/kommuner/index.json (gränser: OpenStreetMap, grannar förberäknade). */
export interface Kommun {
  id: string
  name: string
  lan: string
  /** [lat, lng] */
  center: [number, number]
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number]
  neighbors: string[]
  detail: boolean
}

/** Polygoner som [lng, lat]-ringar (första ringen ytterkant, resten hål). */
export interface KommunShape {
  id: string
  name: string
  polygons: [number, number][][][]
}

let indexP: Promise<Kommun[]> | null = null
export const loadIndex = () =>
  (indexP ??= fetch('/kommuner/index.json')
    .then((r) => r.json() as Promise<Kommun[]>)
    .catch((e) => {
      indexP = null
      throw e
    }))

const shapes = new Map<string, Promise<KommunShape | null>>()
export function loadShape(id: string) {
  let p = shapes.get(id)
  if (!p) {
    p = fetch(`/kommuner/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<KommunShape>) : null))
      .catch(() => null)
    shapes.set(id, p)
  }
  return p
}

export function useKommunIndex() {
  const [index, setIndex] = useState<Kommun[] | null>(null)
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch(() => setIndex([]))
  }, [])
  return index
}

export function useShapes(ids: string[]) {
  const [list, setList] = useState<KommunShape[]>([])
  const key = ids.join(',')
  useEffect(() => {
    let alive = true
    Promise.all(ids.map(loadShape)).then((s) => alive && setList(s.filter((x): x is KommunShape => !!x)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return list
}

/** Gemensam utbredning för flera kommuner som [[syd, väst], [nord, öst]]. */
export function unionBounds(index: Kommun[], ids: string[]): [[number, number], [number, number]] | null {
  const ks = index.filter((k) => ids.includes(k.id))
  if (!ks.length) return null
  return [
    [Math.min(...ks.map((k) => k.bbox[1])), Math.min(...ks.map((k) => k.bbox[0]))],
    [Math.max(...ks.map((k) => k.bbox[3])), Math.max(...ks.map((k) => k.bbox[2]))],
  ]
}

/** Jämn-udda-test: ligger punkten i någon av polygonerna (hål räknas bort)? */
function inside(polygons: [number, number][][][], x: number, y: number) {
  for (const poly of polygons) {
    let c = false
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
    if (c) return true
  }
  return false
}

/** Kommuner som inte heter "X kommun" */
const OFFICIAL: Record<string, string> = {
  Stockholm: 'Stockholms stad',
  Göteborg: 'Göteborgs stad',
  Malmö: 'Malmö stad',
  Solna: 'Solna stad',
  Sundbyberg: 'Sundbybergs stad',
  Lidingö: 'Lidingö stad',
  Vaxholm: 'Vaxholms stad',
  Falun: 'Falu kommun',
  Gotland: 'Region Gotland',
}

/** Kommunen en punkt ligger i – räknas lokalt ur gränserna, inget skickas till någon tjänst. */
export async function kommunOf(lat: number, lng: number): Promise<Kommun | null> {
  try {
    const index = await loadIndex()
    for (const k of index) {
      if (lng < k.bbox[0] || lng > k.bbox[2] || lat < k.bbox[1] || lat > k.bbox[3]) continue
      const shape = await loadShape(k.id)
      if (shape && inside(shape.polygons, lng, lat)) return k
    }
  } catch {
    /* utan nät och utan sparade gränser – visa inget */
  }
  return null
}

/** Kommunens officiella namn ("Landskrona kommun", "Malmö stad") för en punkt. */
export async function kommunAt(lat: number, lng: number): Promise<string | null> {
  const k = await kommunOf(lat, lng)
  return k ? (OFFICIAL[k.name] ?? `${k.name} kommun`) : null
}
