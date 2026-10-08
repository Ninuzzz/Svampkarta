import { FIELD_EDGE, FIELD_SIZE } from '../analysis/protocol.ts'

/** Fälten räknas på den här zoomen (samma som CHANCE_NATIVE_ZOOM i ChanceLayer.ts). */
export const FLOOD_ZOOM = 13
const TS = 256

/* ------------------------------------------------------------------ */
/*  Markerat område                                                    */
/* ------------------------------------------------------------------ */

/** Högst så här många fältpunkter (≈ 10 × 10 m) i ett markerat område, ≈ 200 km². */
const FLOOD_MAX = 2_000_000

/**
 * Sammanhängande yta (täckning över kanten) runt punkten, över alla
 * uträknade fält. Varje fält får en mask: 2 = inne, 1 = en punkt utanför
 * (så att den utjämnade kanten också ritas som markerad).
 */
export function floodArea(fields: Map<string, { field: Uint8Array }>, p: { lat: number; lng: number }) {
  const z = FLOOD_ZOOM
  const W = 2 ** z * TS
  const gx0 = Math.floor(((p.lng + 180) / 360) * W)
  const gy0 = Math.floor(((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * W)
  const mask = new Map<string, Uint8Array>()
  const F = FIELD_SIZE

  const fieldAt = (gx: number, gy: number) => fields.get(`${z}/${gx >> 8}/${gy >> 8}`)?.field
  const inside = (gx: number, gy: number) => {
    const f = fieldAt(gx, gy)
    return !!f && f[(((gy & 255) + 1) * F + (gx & 255) + 1) * 3] >= FIELD_EDGE
  }
  const maskAt = (gx: number, gy: number) => {
    const k = `${z}/${gx >> 8}/${gy >> 8}`
    let m = mask.get(k)
    if (!m) mask.set(k, (m = new Uint8Array(TS * TS)))
    return m
  }
  const idx = (gx: number, gy: number) => ((gy & 255) << 8) | (gx & 255)

  if (!inside(gx0, gy0)) return { mask, ha: null }
  const qx = [gx0], qy = [gy0]
  maskAt(gx0, gy0)[idx(gx0, gy0)] = 2
  let count = 0
  while (qx.length && count < FLOOD_MAX) {
    const x = qx.pop()!, y = qy.pop()!
    count++
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (!fieldAt(nx, ny)) continue
        const m = maskAt(nx, ny)
        const j = idx(nx, ny)
        if (m[j] === 2) continue
        // bara raka grannar breder ut området; diagonalerna blir kantzon
        if (!dx || !dy ? inside(nx, ny) : false) {
          m[j] = 2
          qx.push(nx)
          qy.push(ny)
        } else if (!m[j]) m[j] = 1
      }
  }
  // fältpunktens yta i terrängen (mercator krymper med cos(lat))
  const m = (40075016.686 * Math.cos((p.lat * Math.PI) / 180)) / W
  return { mask, ha: (count * m * m) / 10000 }
}
