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
