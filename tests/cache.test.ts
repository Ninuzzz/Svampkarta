// Cachen framför funktionerna: webbläsaren får funktionens eget cache-huvud, även vid träff.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { cached, type PagesContext } from '../server/cache.ts'

type Stored = { body: ArrayBuffer; status: number; headers: [string, string][] }
const g = globalThis as unknown as { caches?: unknown }
const before = g.caches
afterEach(() => {
  g.caches = before
})

/** Enkel ersättare för Cloudflares cache: sparar per adress och ger en ny Response vid varje träff. */
function fakeCache() {
  const store = new Map<string, Stored>()
  g.caches = {
    default: {
      match: async (req: Request) => {
        const s = store.get(req.url)
        return s ? new Response(s.body.slice(0), { status: s.status, headers: s.headers }) : undefined
      },
      put: async (req: Request, res: Response) => {
        store.set(req.url, { body: await res.arrayBuffer(), status: res.status, headers: [...res.headers] })
      },
    },
  }
  return store
}

/** Kör cached() och väntar in det som sparas i bakgrunden. */
async function call(url: string, handler: (req: Request) => Promise<Response>, params: string[] = [], ttl?: number) {
  const pending: Promise<unknown>[] = []
  const ctx: PagesContext = { request: new Request(url), waitUntil: (p) => void pending.push(p) }
  const res = await cached(ctx, handler, params, ttl)
  await Promise.all(pending)
  return res
}

const day = async () => new Response('{"a":1}', { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })

test('första svaret och träffar ger samma cache-huvud till webbläsaren', async () => {
  const store = fakeCache()
  let runs = 0
  const handler = async () => (runs++, day())
  const first = await call('https://x.example/fynd/svamp/10/1/2', handler, [], 604800)
  const second = await call('https://x.example/fynd/svamp/10/1/2', handler, [], 604800)
  assert.equal(runs, 1, 'andra anropet ska komma från cachen')
  assert.equal(first.headers.get('cache-control'), 'public, max-age=86400')
  assert.equal(second.headers.get('cache-control'), 'public, max-age=86400')
  assert.equal(second.headers.get('x-browser-cache-control'), null, 'hjälphuvudet ska inte läcka ut')
  assert.equal(await second.text(), '{"a":1}')
  // kopian i cachen har cachens livslängd
  const kept = [...store.values()][0]
  assert.equal(new Headers(kept.headers).get('cache-control'), 'public, max-age=604800')
})

test('påhittade parametrar ger samma cachepost, tillåtna ger olika', async () => {
  fakeCache()
  let runs = 0
  const handler = async () => (runs++, day())
  await call('https://x.example/wms/nmd?bbox=1', handler, ['bbox'])
  await call('https://x.example/wms/nmd?bbox=1&x=1', handler, ['bbox'])
  assert.equal(runs, 1)
  await call('https://x.example/wms/nmd?bbox=2', handler, ['bbox'])
  assert.equal(runs, 2)
})

test('fel sparas inte', async () => {
  const store = fakeCache()
  const res = await call('https://x.example/fynd/svamp/10/1/2', async () => new Response('nej', { status: 502 }))
  assert.equal(res.status, 502)
  assert.equal(store.size, 0)
})

test('poster sparade före ändringen lämnas som de är', async () => {
  const store = fakeCache()
  store.set('https://x.example/wms/nmd', { body: new TextEncoder().encode('gammal').buffer as ArrayBuffer, status: 200, headers: [['cache-control', 'public, max-age=31536000']] })
  const res = await call('https://x.example/wms/nmd', day)
  assert.equal(await res.text(), 'gammal')
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000')
})
