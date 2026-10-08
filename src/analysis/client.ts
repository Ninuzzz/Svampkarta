import type { ChanceOptions, Hotspot, InspectResult, WorkerRequest, WorkerResponse } from './protocol'
import type { TreeKey } from './species'

type Payload = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never

/**
 * En pool av workers så att analysen använder flera processorkärnor.
 * Rutor fördelas per 2×2-block (samma som workerns hämtningsblock), så att
 * varje block bara hämtas och avkodas en gång.
 */
const POOL = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
const workers: Worker[] = []
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function worker(i: number) {
  if (!workers[i]) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.result)
      else p.reject(new Error(e.data.error))
    }
    workers[i] = w
  }
  return workers[i]
}

/** Samma block → samma worker (block = 2×2 rutor på analysens zoomnivå). */
function route(z: number, x: number, y: number) {
  const bx = Math.floor(x / 2), by = Math.floor(y / 2)
  const h = Math.imul(bx, 73856093) ^ Math.imul(by, 19349663) ^ Math.imul(z, 83492791)
  return Math.abs(h) % POOL
}

function routeLatLng(lat: number, lng: number) {
  const n = 2 ** 14
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  return route(14, x, y)
}

function call<T>(w: number, payload: Payload): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker(w).postMessage({ ...payload, id })
  })
}

export const analysis = {
  forest: (z: number, x: number, y: number) => call<Uint8Array>(route(z, x, y), { type: 'forest', z, x, y }),
  chance: (z: number, x: number, y: number, opts: ChanceOptions, quick = false) =>
    call<{ field: Uint8Array; hotspots: Hotspot[]; complete: boolean }>(route(z, x, y), { type: 'chance', z, x, y, opts, quick }),
  inspect: (lat: number, lng: number, opts: ChanceOptions) => call<InspectResult>(routeLatLng(lat, lng), { type: 'inspect', lat, lng, opts }),
  signature: (lat: number, lng: number) => call<{ tree: TreeKey | null; soil: number }>(routeLatLng(lat, lng), { type: 'signature', lat, lng }),
}
