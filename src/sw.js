/**
 * Service worker – gör Mycel användbar utan täckning.
 *
 *  - Appen (html, js, css, ikoner, artguidens bilder) sparas vid installation.
 *  - Kartbilder (flygfoto, karta, terräng), stigdata och kommungränser sparas
 *    när de visas, så att områden du tittat på finns kvar offline.
 *  - Vädret och de rapporterade fynden: senaste svaret används om nätet saknas.
 *  - Analysdatan (skog, jordart, höjd, ålder) sparar analys-workern själv.
 *
 * __VERSION__ och __PRECACHE__ fylls i vid bygget (vite.config.ts).
 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const APP = `mycel-app-${VERSION}`
const TILES = 'mycel-tiles-v1'
const RUNTIME = 'mycel-runtime-v1'
const FINDS = 'mycel-fynd-v1'
const MAX_TILES = 6000
const MAX_FINDS = 300
// filerna som sparades vid installationen, utom sidan själv (den hämtas färsk när nätet finns)
const PRECACHED = new Set(PRECACHE.filter((f) => f !== '/'))

const TILE_HOSTS = [
  'clarity.maptiles.arcgis.com',
  'server.arcgisonline.com',
  'tile.openstreetmap.org',
  'a.tile.opentopomap.org',
  'b.tile.opentopomap.org',
  'c.tile.opentopomap.org',
  'tiles.openfreemap.org',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(APP)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mycel-app-') && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Håll en cache inom en rimlig storlek (äldst först ut). */
const trimming = new Set()
async function trim(name, max) {
  if (trimming.has(name)) return
  trimming.add(name)
  try {
    const c = await caches.open(name)
    const keys = await c.keys()
    for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
  } finally {
    trimming.delete(name)
  }
}

async function cacheFirst(req, name, onStore) {
  const c = await caches.open(name)
  const hit = await c.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.type !== 'opaque') {
    c.put(req, res.clone())
    onStore?.()
  }
  return res
}

async function networkFirst(req, name, timeoutMs, onStore) {
  const c = await caches.open(name)
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
    if (res.ok) {
      c.put(req, res.clone())
      onStore?.()
    }
    return res
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: name === APP, ignoreVary: true })
    if (hit) return hit
    throw e
  }
}

let tileCount = 0
let findCount = 0
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)

  if (url.origin === self.location.origin) {
    // sidan: senaste versionen om nätet finns, annars den sparade
    // integritetspolicyn är en egen statisk sida, inte appen
    if (req.mode === 'navigate' && !url.pathname.startsWith('/integritet')) {
      e.respondWith(networkFirst(new Request('/'), APP, 4000))
      return
    }
    // det som sparades vid installationen (js, css, bilder, ikon, manifest) tas därifrån
    if (PRECACHED.has(url.pathname)) {
      e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req)))
      return
    }
    // rapporterade fynd: färska när nätet finns, annars de som visades senast
    if (url.pathname.startsWith('/fynd/')) {
      e.respondWith(networkFirst(req, FINDS, 15000, () => ++findCount % 20 === 0 && trim(FINDS, MAX_FINDS)))
      return
    }
    if (url.pathname.startsWith('/kommuner/')) {
      e.respondWith(cacheFirst(req, RUNTIME))
      return
    }
    return // /wms och /age-range: analys-workern cachar själv
  }

  // stigdatans index pekar på aktuell version – hämta färskt när nätet finns
  if (url.hostname === 'tiles.openfreemap.org' && url.pathname === '/planet') {
    e.respondWith(networkFirst(req, RUNTIME, 5000))
    return
  }
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req, TILES, () => ++tileCount % 200 === 0 && trim(TILES, MAX_TILES)))
    return
  }
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(networkFirst(req, RUNTIME, 6000))
  }
})
