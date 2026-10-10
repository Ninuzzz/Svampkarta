// Kartans startvy för ett hemområde: inramning, gränser och den sparade senaste vyn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitZoom, homeView, lastView, searchBox, LAST_VIEW_MS, type BBox } from '../src/lib/homeview.ts'

const landskrona = { id: '1282', lat: 55.89, lng: 12.8701, bbox: [12.6491, 55.8229, 13.059, 55.9631] as BBox }
const varberg = { id: '1383', lat: 57.1804, lng: 12.3812, bbox: [12.0245, 56.9873, 12.7628, 57.3515] as BBox }
const kiruna = { id: '2584', lat: 68.1627, lng: 20.7111, bbox: [17.8997, 67.3562, 23.2864, 69.06] as BBox }

test('fitZoom: större yta eller mindre område ger högre zoom, och utbredningen ryms', () => {
  const z = fitZoom(varberg.bbox, 342, 564)
  assert.equal(z, 9)
  assert.ok(fitZoom(varberg.bbox, 1300, 900) > z)
  assert.ok(fitZoom(landskrona.bbox, 342, 564) > z)
  // ryms vid z, men inte vid z + 1
  const px = (zz: number) => ((varberg.bbox[2] - varberg.bbox[0]) / 360) * 256 * 2 ** zz
  assert.ok(px(z) <= 342 && px(z + 1) > 342)
  assert.equal(fitZoom([1, 1, 1, 1], 300, 300), 12)
})

test('homeView: Landskrona har handinställda vyer för smal och bred skärm', () => {
  assert.deepEqual(homeView(landskrona, 390, 844, 10), { lat: 55.865, lng: 12.938, zoom: 11 })
  assert.deepEqual(homeView(landskrona, 1366, 800, 10), { lat: 55.8708, lng: 12.8302, zoom: 12 })
})

test('homeView: aldrig längre ut än där chansen visas, aldrig närmare än zoom 13', () => {
  assert.equal(homeView(varberg, 390, 844, 11).zoom, 11)
  assert.equal(homeView(kiruna, 390, 844, 12).zoom, 12)
  const tiny = { id: 'x', lat: 59.36, lng: 17.97, bbox: [17.95, 59.35, 17.99, 59.37] as BBox }
  assert.equal(homeView(tiny, 1366, 800, 10).zoom, 13)
})

test('homeView: på bred skärm flyttas mitten åt höger om panelen, på smal skärm inte', () => {
  const narrow = homeView(varberg, 390, 844, 11)
  assert.equal(narrow.lng, varberg.lng)
  assert.equal(narrow.lat, varberg.lat)
  const wide = homeView(varberg, 1366, 800, 11)
  assert.ok(wide.lng < varberg.lng)
  // 210 px vid vyns zoom
  const px = ((varberg.lng - wide.lng) / 360) * 256 * 2 ** wide.zoom
  assert.ok(Math.abs(px - 210) < 0.01)
})

test('lastView: bara en giltig och färsk vy i Sverige används', () => {
  const now = 1_800_000_000_000
  const ok = { lat: 56.03, lng: 13.23, zoom: 14, t: now - 1000 }
  assert.deepEqual(lastView(JSON.stringify(ok), now), { lat: 56.03, lng: 13.23, zoom: 14 })
  assert.equal(lastView(JSON.stringify({ ...ok, t: now - LAST_VIEW_MS - 1 }), now), null)
  assert.equal(lastView(JSON.stringify({ ...ok, t: now + 3_600_000 }), now), null)
  assert.equal(lastView(JSON.stringify({ ...ok, lat: 48.8 }), now), null)
  assert.equal(lastView(JSON.stringify({ ...ok, zoom: '14' }), now), null)
  assert.equal(lastView('inte json', now), null)
  assert.equal(lastView(null, now), null)
})

test('searchBox: grov ruta som rymmer området, på halva grader', () => {
  const [w, n, e, s] = searchBox(landskrona.bbox)
  assert.deepEqual([w, n, e, s], [12, 56.5, 13.5, 55])
  assert.ok(w < landskrona.bbox[0] && s < landskrona.bbox[1] && e > landskrona.bbox[2] && n > landskrona.bbox[3])
})
