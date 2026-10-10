// Serverfunktionen för fynd: validering, bläddring hos GBIF och att inga personuppgifter följer med.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fynd, type FyndResponse } from '../server/fynd.ts'
import { FYND_ZOOM, tileAt } from '../src/lib/fynd.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const { x, y } = tileAt(55.87, 12.83, FYND_ZOOM)
const url = (path: string) => new Request('https://mycel.example' + path)
const rec = (i: number) => ({
  key: 1000 + i,
  speciesKey: 5249504,
  decimalLatitude: 55.87,
  decimalLongitude: 12.83,
  year: 2020,
  recordedBy: 'Namn Namnsson',
  locality: 'Hemligt ställe',
})

/** GBIF-svar i tur och ordning; registrerar vilka adresser som anropades. */
function stubGbif(pages: { n: number; end: boolean }[]) {
  const calls: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = new URL(String(input instanceof Request ? input.url : input))
    calls.push(u)
    const p = pages[calls.length - 1]
    if (!p) return new Response('fel', { status: 500 })
    const offset = Number(u.searchParams.get('offset'))
    return Response.json({ endOfRecords: p.end, results: Array.from({ length: p.n }, (_, i) => rec(offset + i)) })
  }) as typeof fetch
  return calls
}

test('giltig ruta: bläddrar tills GBIF säger att det är slut', async () => {
  const calls = stubGbif([{ n: 300, end: false }, { n: 2, end: true }])
  const res = await fynd(url(`/fynd/svamp/${FYND_ZOOM}/${x}/${y}`))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /application\/json/)
  const text = await res.text()
  const body = JSON.parse(text) as FyndResponse
  assert.equal(body.finds.length, 302)
  assert.equal(body.complete, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((c) => c.searchParams.get('offset')), ['0', '300'])
  assert.ok(calls.every((c) => c.origin === 'https://api.gbif.org'))
  // inga personuppgifter eller fritext i svaret
  assert.ok(!text.includes('Namnsson') && !text.includes('recordedBy') && !text.includes('Hemligt'))
  assert.deepEqual(Object.keys(body.finds[0]).sort(), ['id', 'lat', 'lng', 'sp', 'year'])
})

test('väldigt många fynd: slutar efter tre sidor och säger att svaret inte är komplett', async () => {
  const calls = stubGbif([{ n: 300, end: false }, { n: 300, end: false }, { n: 300, end: false }, { n: 300, end: false }])
  const body = (await (await fynd(url(`/fynd/bar/${FYND_ZOOM}/${x}/${y}`))).json()) as FyndResponse
  assert.equal(calls.length, 3)
  assert.equal(body.finds.length, 900)
  assert.equal(body.complete, false)
})

test('ogiltiga anrop avvisas utan att GBIF kontaktas', async () => {
  const calls = stubGbif([{ n: 1, end: true }])
  const paris = tileAt(48.86, 2.35, FYND_ZOOM)
  for (const path of [
    `/fynd/okänd/${FYND_ZOOM}/${x}/${y}`,
    `/fynd/toString/${FYND_ZOOM}/${x}/${y}`,
    `/fynd/svamp/9/${x >> 1}/${y >> 1}`,
    `/fynd/svamp/${FYND_ZOOM}/${paris.x}/${paris.y}`,
    `/fynd/svamp/${FYND_ZOOM}/1e2/${y}`,
    `/fynd/svamp/${FYND_ZOOM}/${x}.5/${y}`,
    `/fynd/svamp/${FYND_ZOOM}/${x}`,
    '/fynd/svamp',
  ]) {
    const res = await fynd(url(path))
    assert.equal(res.status, 400, path)
  }
  assert.equal(calls.length, 0)
})

test('när GBIF inte svarar: 502 som inte får cachas', async () => {
  stubGbif([])
  const res = await fynd(url(`/fynd/kantarell/${FYND_ZOOM}/${x}/${y}`))
  assert.equal(res.status, 502)
  assert.equal(res.headers.get('cache-control'), 'no-store')
})
