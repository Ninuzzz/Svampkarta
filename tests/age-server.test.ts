// Serverfunktionen för skogsålder: validering, omförsök mot SLU och att fel inte cachas.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { age, AGE_RETRY_MS } from '../server/age.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const url = (path: string) => new Request('https://mycel.example' + path)
const part = (n: number) => new Response(new Uint8Array(n), { status: 206 })

/** SLU-svar i tur och ordning (null = nätfel); registrerar anropen. */
function stubSlu(answers: (() => Response | null)[]) {
  const calls: { url: string; range: string | null }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), range: new Headers(init?.headers).get('range') })
    const res = (answers[calls.length - 1] ?? (() => new Response('fel', { status: 500 })))()
    if (!res) throw new Error('nätfel')
    return res
  }) as typeof fetch
  return calls
}

test('giltigt spann: hämtas från rätt fil och får cachas', async () => {
  const calls = stubSlu([() => part(100)])
  const res = await age(url('/age-range/pine/1000-1099'))
  assert.equal(res.status, 200)
  assert.equal((await res.arrayBuffer()).byteLength, 100)
  assert.match(res.headers.get('cache-control') ?? '', /max-age=\d+/)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /^https:\/\/gis\.slu\.se\/.*PINE_AGE_2025\.tif$/)
  assert.equal(calls[0].range, 'bytes=1000-1099')
})

test('SLU svarar med fel först: nya försök, sedan datan', async () => {
  const calls = stubSlu([() => new Response('fel', { status: 503 }), () => null, () => part(10)])
  const res = await age(url('/age-range/spruce/0-9'))
  assert.equal(res.status, 200)
  assert.equal(calls.length, 3)
})

test('SLU svarar inte alls: 502 som inte får cachas, efter ett begränsat antal försök', async () => {
  const calls = stubSlu([])
  const res = await age(url('/age-range/pine/0-9'))
  assert.equal(res.status, 502)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, AGE_RETRY_MS.length + 1)
})

test('fel längd eller hela filen (200) i stället för ett spann: 502, inget omförsök', async () => {
  const short = stubSlu([() => part(5)])
  assert.equal((await age(url('/age-range/pine/0-9'))).status, 502)
  assert.equal(short.length, 1)
  const whole = stubSlu([() => new Response(new Uint8Array(10), { status: 200 })])
  assert.equal((await age(url('/age-range/pine/0-9'))).status, 502)
  assert.equal(whole.length, 1)
})

test('ogiltiga anrop avvisas utan att SLU kontaktas', async () => {
  const calls = stubSlu([() => part(1)])
  for (const path of [
    '/age-range/oak/0-9',
    '/age-range/toString/0-9',
    '/age-range/pine/9-0',
    '/age-range/pine/0-2000000',
    '/age-range/pine/3300000000-3300000009',
    '/age-range/pine/abc',
    '/age-range/pine',
  ]) {
    assert.equal((await age(url(path))).status, 400, path)
  }
  assert.equal(calls.length, 0)
})
