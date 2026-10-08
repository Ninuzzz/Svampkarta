// Markeringen av chansområdet: sammanhängande yta, även över rutgränser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { floodArea, FLOOD_ZOOM } from '../src/map/flood.ts'
import { FIELD_EDGE, FIELD_SIZE } from '../src/analysis/protocol.ts'

const W = 2 ** FLOOD_ZOOM * 256
/** lat/lng i mitten av global pixel (gx, gy) på zoom 13 */
const at = (gx: number, gy: number) => {
  const x = (gx + 0.5) / W, y = (gy + 0.5) / W
  return { lng: x * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI }
}
/** fält där inside(lx, ly) är inne i området (lx, ly = rutpixel, −1…256 med kanten) */
const field = (inside: (lx: number, ly: number) => boolean) => {
  const f = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 3)
  for (let fy = 0; fy < FIELD_SIZE; fy++)
    for (let fx = 0; fx < FIELD_SIZE; fx++) f[(fy * FIELD_SIZE + fx) * 3] = inside(fx - 1, fy - 1) ? 255 : 0
  return { field: f }
}
// en ruta i Skåne
const TX = 4380, TY = 2560
const key = (tx: number, ty: number) => `${FLOOD_ZOOM}/${tx}/${ty}`
const inner = (m: Map<string, Uint8Array>) => [...m.values()].reduce((a, u) => a + u.filter((v) => v === 2).length, 0)

test('utanför områdena: ingen markering', () => {
  const r = floodArea(new Map([[key(TX, TY), field(() => false)]]), at(TX * 256 + 10, TY * 256 + 10))
  assert.equal(r.ha, null)
})

test('fyrkant på 20 × 20 punkter markeras, inte grannfyrkanten', () => {
  const inA = (x: number, y: number) => x >= 10 && x < 30 && y >= 10 && y < 30
  const inB = (x: number, y: number) => x >= 40 && x < 60 && y >= 10 && y < 30
  const r = floodArea(new Map([[key(TX, TY), field((x, y) => inA(x, y) || inB(x, y))]]), at(TX * 256 + 15, TY * 256 + 15))
  assert.equal(inner(r.mask), 400)
  assert.ok(r.ha! > 3 && r.ha! < 6, `≈ 400 punkter à ~100 m² ≈ 4 ha, fick ${r.ha}`)
})

test('området fortsätter över rutgränsen', () => {
  const left = field((x, y) => x >= 236 && x < 256 && y >= 100 && y < 110)
  const right = field((x, y) => x >= 0 && x < 20 && y >= 100 && y < 110)
  const fields = new Map([
    [key(TX, TY), left],
    [key(TX + 1, TY), right],
  ])
  const r = floodArea(fields, at(TX * 256 + 240, TY * 256 + 105))
  assert.equal(inner(r.mask), 40 * 10)
  assert.ok(r.mask.has(key(TX + 1, TY)))
})

test('kantzon: punkterna runt området får 1', () => {
  const r = floodArea(new Map([[key(TX, TY), field((x, y) => x === 50 && y === 50)]]), at(TX * 256 + 50, TY * 256 + 50))
  const m = r.mask.get(key(TX, TY))!
  assert.equal(m[(50 << 8) | 50], 2)
  assert.equal(m[(50 << 8) | 51], 1)
  assert.equal(m[(51 << 8) | 51], 1)
  assert.equal(m[(52 << 8) | 52], 0)
})

test('täckning precis vid kanten räknas som inne', () => {
  const f = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 3)
  f[((10 + 1) * FIELD_SIZE + 10 + 1) * 3] = FIELD_EDGE
  const r = floodArea(new Map([[key(TX, TY), { field: f }]]), at(TX * 256 + 10, TY * 256 + 10))
  assert.ok(r.ha)
})
