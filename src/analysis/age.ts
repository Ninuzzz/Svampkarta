/**
 * SLU skogsålder 2025 (CC BY 4.0) – grundytevägd medelålder för tall- och
 * grandominerad skog, 10 m upplösning i SWEREF 99 TM.
 *
 * Filerna är stora BigTIFF (≈3 GB) indelade i rutor om 128×128 px. Vi läser
 * bara de rutor som behövs med HTTP-range via en proxy på samma domän
 * (/slu-age → gis.slu.se), eftersom SLU:s server saknar CORS.
 *
 * Kartan beskriver ålder väl upp till ~80 år men underskattar äldre skog.
 */

interface AgeFile {
  url: string
  /** namn i Netlify-cachen (netlify/functions/age.mts) */
  cdn: string
  offsetsAt: number // TileOffsets (LONG8)
  countsAt: number // TileByteCounts (LONG)
}

export const AGE_FILES = {
  tall: { url: '/slu-age/PINE_AGE_2025.tif', cdn: 'pine', offsetsAt: 3004295510, countsAt: 3001924942 },
  gran: { url: '/slu-age/SPRUCE_AGE_2025.tif', cdn: 'spruce', offsetsAt: 3056309672, countsAt: 3053939104 },
} satisfies Record<string, AgeFile>

const TILE = 128
const ACROSS = 514 // ceil(65750 / 128)
const DOWN = 1153 // ceil(147500 / 128)
const E0 = 265000
const N0 = 7607500
const RES = 10
const NODATA = 65535

/* ------------------------------------------------------------------ */
/*  WGS84 → SWEREF 99 TM (Gauss–Krüger enligt Lantmäteriet)            */
/* ------------------------------------------------------------------ */

const GK = (() => {
  const a = 6378137.0
  const f = 1 / 298.257222101
  const e2 = f * (2 - f)
  const n = f / (2 - f)
  const ah = (a / (1 + n)) * (1 + (n * n) / 4 + n ** 4 / 64)
  return {
    k0ah: 0.9996 * ah,
    A: e2,
    B: (5 * e2 ** 2 - e2 ** 3) / 6,
    C: (104 * e2 ** 3 - 45 * e2 ** 4) / 120,
    D: (1237 * e2 ** 4) / 1260,
    b1: n / 2 - (2 * n * n) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180,
    b2: (13 * n * n) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440,
    b3: (61 * n ** 3) / 240 - (103 * n ** 4) / 140,
    b4: (49561 * n ** 4) / 161280,
    lam0: (15 * Math.PI) / 180,
  }
})()

export function toSweref(lat: number, lng: number): [number, number] {
  const { k0ah, A, B, C, D, b1, b2, b3, b4, lam0 } = GK
  const phi = (lat * Math.PI) / 180
  const s = Math.sin(phi)
  const s2 = s * s
  const phis = phi - s * Math.cos(phi) * (A + B * s2 + C * s2 * s2 + D * s2 * s2 * s2)
  const dl = (lng * Math.PI) / 180 - lam0
  const xp = Math.atan(Math.tan(phis) / Math.cos(dl))
  const ep = Math.atanh(Math.cos(phis) * Math.sin(dl))
  const N = k0ah * (xp + b1 * Math.sin(2 * xp) * Math.cosh(2 * ep) + b2 * Math.sin(4 * xp) * Math.cosh(4 * ep) + b3 * Math.sin(6 * xp) * Math.cosh(6 * ep) + b4 * Math.sin(8 * xp) * Math.cosh(8 * ep))
  const E = k0ah * (ep + b1 * Math.cos(2 * xp) * Math.sinh(2 * ep) + b2 * Math.cos(4 * xp) * Math.sinh(4 * ep) + b3 * Math.cos(6 * xp) * Math.sinh(6 * ep) + b4 * Math.cos(8 * xp) * Math.sinh(8 * ep)) + 500000
  return [E, N]
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

let cacheP: Promise<Cache | null> | null = null
const openCache = () =>
  (cacheP ??=
    'caches' in self
      ? // äldre version sparade per byte-spann och används inte längre
        caches
          .delete('mycel-age-v1')
          .catch(() => false)
          .then(() => caches.open('mycel-age-v2'))
          .catch(() => null)
      : Promise.resolve(null))

/* ------------------------------------------------------------------ */
/*  LZW (TIFF-varianten: MSB först, "early change")                    */
/* ------------------------------------------------------------------ */

function lzw(src: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize)
  let op = 0
  const prefix = new Int32Array(4096)
  const suffix = new Uint8Array(4096)
  const length = new Uint16Array(4096)
  for (let i = 0; i < 256; i++) {
    prefix[i] = -1
    suffix[i] = i
    length[i] = 1
  }
  let next = 258
  let codeLen = 9
  let bitPos = 0
  let prev = -1
  const totalBits = src.length * 8
  const stack = new Uint8Array(4096)

  const read = () => {
    const byte = bitPos >> 3
    const v = ((src[byte] << 16) | ((src[byte + 1] ?? 0) << 8) | (src[byte + 2] ?? 0)) >>> 0
    const code = (v >> (24 - (bitPos & 7) - codeLen)) & ((1 << codeLen) - 1)
    bitPos += codeLen
    return code
  }
  const emit = (code: number) => {
    let c = code
    let sp = 0
    while (c >= 0) {
      stack[sp++] = suffix[c]
      c = prefix[c]
    }
    while (sp > 0 && op < outSize) out[op++] = stack[--sp]
  }
  const first = (code: number) => {
    let c = code
    while (prefix[c] >= 0) c = prefix[c]
    return suffix[c]
  }

  while (bitPos + codeLen <= totalBits && op < outSize) {
    const code = read()
    if (code === 257) break
    if (code === 256) {
      next = 258
      codeLen = 9
      prev = -1
      continue
    }
    if (prev < 0) {
      emit(code)
      prev = code
      continue
    }
    if (code < next) {
      emit(code)
      prefix[next] = prev
      suffix[next] = first(code)
    } else {
      prefix[next] = prev
      suffix[next] = first(prev)
      emit(next)
    }
    length[next] = length[prev] + 1
    next++
    prev = code
    if (next + 1 >= 1 << codeLen && codeLen < 12) codeLen++
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Rutor                                                              */
/* ------------------------------------------------------------------ */

/*
 * Rutorna begärs en och en men hämtas i klump: förfrågningar som kommer
 * inom några millisekunder samlas, och rutor som ligger nära varandra i
 * filen (samma rad) hämtas i ett enda range-anrop. Annars blir det tusentals
 * små anrop som köas bakom webbläsarens gräns på ~6 samtidiga per server.
 * Varje ruta sparas för sig i Cache Storage, så att nästa besök går direkt.
 */

type Tile = Uint16Array | null
type Want = { tx: number; ty: number; resolve: (t: Tile) => void; reject: (e: unknown) => void }

const MEM = 600 // ≈ 20 MB avkodade rutor per worker
/*
 * Hämtningarna görs i fasta bitar – index för 8 rader i taget och data för 16
 * rutor i en rad i taget – så att samma del av kartan alltid ger samma
 * byte-spann. Då kan Netlifys CDN spara svaren åt alla besökare.
 */
const INDEX_ROWS = 8
const CHUNK = 16

const tiles = new Map<string, Promise<Tile>>()
const pending = new Map<string, Want[]>() // per fil
let flushTimer = 0

const tileKey = (file: AgeFile, tx: number, ty: number) => new URL(`${file.url}?t=${tx},${ty}`, self.location.href).href
const rowKey = (file: AgeFile, ty: number) => new URL(`${file.url}?row=${ty}`, self.location.href).href
const decode = (bytes: Uint8Array): Tile => (bytes.length ? new Uint16Array(lzw(bytes, TILE * TILE * 2).buffer, 0, TILE * TILE) : null)

/** Samma bit begärs ofta av flera rutor samtidigt – dela på ett anrop. */
const inflight = new Map<string, Promise<Uint8Array>>()
function getRange(file: AgeFile, start: number, end: number): Promise<Uint8Array> {
  const key = `${file.cdn}|${start}|${end}`
  let p = inflight.get(key)
  if (!p) {
    p = getRangeOnce(file, start, end)
    inflight.set(key, p)
    p.catch(() => {}).finally(() => setTimeout(() => inflight.delete(key), 2000))
  }
  return p
}

/** På den publicerade sajten via den delade cachen, annars (eller om den inte svarar) direkt. */
async function getRangeOnce(file: AgeFile, start: number, end: number): Promise<Uint8Array> {
  // Utvecklingsservern har en proxy (vite.config.ts). Den publicerade sajten går bara via
  // den begränsade Netlify-funktionen – en öppen proxy till 3 GB-filen vore lätt att missbruka.
  if (!import.meta.env.PROD) return fetchRange(file.url, start, end)
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/age-range/${file.cdn}/${start}-${end}`)
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.length === end - start + 1) return buf
      }
      if (res.status === 400) throw new Error('Skogsålder: ogiltigt anrop')
      lastError = new Error(`Skogsålder: HTTP ${res.status}`)
    } catch (e) {
      lastError = e
      if ((e as Error).message?.includes('ogiltigt')) break
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  throw lastError
}

async function fetchRange(url: string, start: number, end: number, tries = 3): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
    if (res.status >= 500) throw new Error(`Skogsålder: HTTP ${res.status}`)
  } catch (e) {
    // SLU:s server svarar ibland med tillfälliga fel – försök igen efter en kort paus
    if (tries <= 1) throw e
    await new Promise((r) => setTimeout(r, 400 * (4 - tries)))
    return fetchRange(url, start, end, tries - 1)
  }
  if (res.status !== 206 && res.status !== 200) throw new Error(`Skogsålder: HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  // servern ignorerade Range och skickade hela filen
  return res.status === 200 && buf.length > end - start + 1 ? buf.slice(start, end + 1) : buf
}

function want(file: AgeFile, tx: number, ty: number): Promise<Tile> {
  const key = `${file.url}|${tx}|${ty}`
  let p = tiles.get(key)
  if (!p) {
    p = new Promise<Tile>((resolve, reject) => {
      const list = pending.get(file.url) ?? []
      list.push({ tx, ty, resolve, reject })
      pending.set(file.url, list)
      if (!flushTimer) flushTimer = self.setTimeout(flush, 30)
    })
    // misslyckade hämtningar sparas inte – nästa ruta försöker igen
    p.catch(() => tiles.delete(key))
    tiles.set(key, p)
    if (tiles.size > MEM) tiles.delete(tiles.keys().next().value!)
  }
  return p
}

function flush() {
  flushTimer = 0
  for (const [url, list] of pending) {
    const file = Object.values(AGE_FILES).find((f) => f.url === url)!
    load(file, list).catch((e) => list.forEach((w) => w.reject(e)))
  }
  pending.clear()
}

/** Index (filposition och storlek) för hela rader, hämtade i ett anrop per sammanhängande radspann. */
const rowMem = new Map<string, Promise<{ offs: Float64Array; cnts: Uint32Array }>>()
async function rowIndex(file: AgeFile, rows: number[], cache: Cache | null) {
  const need: number[] = []
  const out = new Map<number, { offs: Float64Array; cnts: Uint32Array }>()
  await Promise.all(
    rows.map(async (ty) => {
      const m = rowMem.get(`${file.url}|${ty}`)
      if (m) return void out.set(ty, await m)
      const hit = await cache?.match(rowKey(file, ty)).catch(() => undefined)
      if (hit) {
        const b = await hit.arrayBuffer()
        const r = { offs: new Float64Array(b, 0, ACROSS), cnts: new Uint32Array(b, 8 * ACROSS, ACROSS) }
        rowMem.set(`${file.url}|${ty}`, Promise.resolve(r))
        out.set(ty, r)
      } else need.push(ty)
    }),
  )
  // fasta grupper om 8 rader (TileOffsets = 8 byte, TileByteCounts = 4 byte per ruta)
  const groups = [...new Set(need.map((ty) => Math.floor(ty / INDEX_ROWS)))]
  const spans: [number, number][] = groups.map((g) => [g * INDEX_ROWS, Math.min(DOWN - 1, g * INDEX_ROWS + INDEX_ROWS - 1)])
  await Promise.all(
    spans.map(async ([r0, r1]) => {
      const i0 = r0 * ACROSS, i1 = r1 * ACROSS + ACROSS - 1
      const [offB, cntB] = await Promise.all([
        getRange(file, file.offsetsAt + 8 * i0, file.offsetsAt + 8 * i1 + 7),
        getRange(file, file.countsAt + 4 * i0, file.countsAt + 4 * i1 + 3),
      ])
      const offs = new DataView(offB.buffer, offB.byteOffset, offB.byteLength)
      const cnts = new DataView(cntB.buffer, cntB.byteOffset, cntB.byteLength)
      for (let ty = r0; ty <= r1; ty++) {
        const buf = new ArrayBuffer(12 * ACROSS)
        const r = { offs: new Float64Array(buf, 0, ACROSS), cnts: new Uint32Array(buf, 8 * ACROSS, ACROSS) }
        for (let tx = 0; tx < ACROSS; tx++) {
          const k = (ty - r0) * ACROSS + tx
          r.offs[tx] = Number(offs.getBigUint64(8 * k, true))
          r.cnts[tx] = cnts.getUint32(4 * k, true)
        }
        rowMem.set(`${file.url}|${ty}`, Promise.resolve(r))
        cache?.put(rowKey(file, ty), new Response(buf)).catch(() => {})
        out.set(ty, r)
      }
    }),
  )
  return out
}

async function load(file: AgeFile, list: Want[]) {
  const cache = await openCache()
  // 1. rutor som redan finns i Cache Storage
  const net: Want[] = []
  await Promise.all(
    list.map(async (w) => {
      const hit = await cache?.match(tileKey(file, w.tx, w.ty)).catch(() => undefined)
      if (hit) w.resolve(decode(new Uint8Array(await hit.arrayBuffer())))
      else net.push(w)
    }),
  )
  if (!net.length) return

  // 2. var ligger rutorna i filen?
  const idx = await rowIndex(file, [...new Set(net.map((w) => w.ty))], cache)
  type Item = Want & { off: number; cnt: number }
  const items: Item[] = []
  for (const w of net) {
    const r = idx.get(w.ty)!
    const off = r.offs[w.tx], cnt = r.cnts[w.tx]
    if (!off || !cnt) {
      // ingen data (hav, utanför Sverige)
      cache?.put(tileKey(file, w.tx, w.ty), new Response(new Uint8Array(0))).catch(() => {})
      w.resolve(null)
    } else items.push({ ...w, off, cnt })
  }

  // 3. hämta hela biten (16 rutor i samma rad) som varje ruta ligger i – alltid samma byte-spann
  const chunks = new Map<string, Item[]>()
  for (const it of items) {
    const k = `${it.ty}|${Math.floor(it.tx / CHUNK)}`
    chunks.set(k, [...(chunks.get(k) ?? []), it])
  }
  await Promise.all(
    [...chunks.values()].map(async (wanted) => {
      const ty = wanted[0].ty
      const c0 = Math.floor(wanted[0].tx / CHUNK) * CHUNK
      const r = idx.get(ty)!
      const all: { tx: number; off: number; cnt: number }[] = []
      for (let tx = c0; tx < Math.min(ACROSS, c0 + CHUNK); tx++) if (r.offs[tx] && r.cnts[tx]) all.push({ tx, off: r.offs[tx], cnt: r.cnts[tx] })
      // Rutorna ligger nästan alltid i följd, men identiska rutor (t.ex. tomma) kan dela på en
      // kopia någon annanstans i filen. Dela biten i sammanhängande delar och hämta de delar
      // som innehåller efterfrågade rutor – delarna blir alltid desamma, så cachen träffar.
      all.sort((a, b) => a.off - b.off)
      const runs: { start: number; end: number; tiles: typeof all }[] = []
      for (const t of all) {
        const run = runs.at(-1)
        if (run && t.off - run.end - 1 <= 64 * 1024) {
          run.tiles.push(t)
          run.end = Math.max(run.end, t.off + t.cnt - 1)
        } else runs.push({ start: t.off, end: t.off + t.cnt - 1, tiles: [t] })
      }
      const parts = runs.filter((run) => run.tiles.some((t) => wanted.some((w) => w.tx === t.tx)))
      try {
        for (const part of await Promise.all(parts.map(async (pt) => ({ ...pt, buf: await getRange(file, pt.start, pt.end) })))) {
          for (const t of part.tiles) {
            const bytes = part.buf.slice(t.off - part.start, t.off - part.start + t.cnt)
            cache?.put(tileKey(file, t.tx, ty), new Response(bytes)).catch(() => {})
            const w = wanted.find((x) => x.tx === t.tx)
            if (w) w.resolve(decode(bytes))
          }
        }
      } catch (e) {
        wanted.forEach((w) => w.reject(e))
      }
    }),
  )
}

/** Alla rutor i ett rektangulärt område (null där data saknas eller inte gick att hämta). */
async function loadTiles(file: AgeFile, tx0: number, tx1: number, ty0: number, ty1: number) {
  const out = new Map<string, Tile>()
  const ps: Promise<void>[] = []
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      ps.push(
        want(file, tx, ty)
          .then((t) => void out.set(`${tx}|${ty}`, t))
          .catch(() => void out.set(`${tx}|${ty}`, null)),
      )
  await Promise.all(ps)
  return out
}

/**
 * Ålder (år) för varje pixel i ett rutnät. `toLatLng(gx, gy)` ger pixelns
 * mittpunkt. Returnerar 0 där ålder saknas.
 */
export async function ageGrid(kind: keyof typeof AGE_FILES, n: number, toLatLng: (gx: number, gy: number) => [number, number]) {
  const file = AGE_FILES[kind]
  // SWEREF-koordinater i ett glest gitter (var 16:e pixel) + bilinjär interpolation
  const step = 16
  const gw = Math.ceil(n / step) + 1
  const E = new Float64Array(gw * gw)
  const Nn = new Float64Array(gw * gw)
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
  for (let j = 0; j < gw; j++)
    for (let i = 0; i < gw; i++) {
      const [lat, lng] = toLatLng(Math.min(i * step, n - 1), Math.min(j * step, n - 1))
      const [e, nn] = toSweref(lat, lng)
      E[j * gw + i] = e
      Nn[j * gw + i] = nn
      if (e < minE) minE = e
      if (e > maxE) maxE = e
      if (nn < minN) minN = nn
      if (nn > maxN) maxN = nn
    }
  const px0 = Math.floor((minE - E0) / RES), px1 = Math.floor((maxE - E0) / RES)
  const py0 = Math.floor((N0 - maxN) / RES), py1 = Math.floor((N0 - minN) / RES)
  const tx0 = Math.max(0, Math.floor(px0 / TILE)), tx1 = Math.min(ACROSS - 1, Math.floor(px1 / TILE))
  const ty0 = Math.max(0, Math.floor(py0 / TILE)), ty1 = Math.min(DOWN - 1, Math.floor(py1 / TILE))
  const out = new Uint16Array(n * n)
  if (tx0 > tx1 || ty0 > ty1) return out
  const tiles = await loadTiles(file, tx0, tx1, ty0, ty1)

  for (let gy = 0; gy < n; gy++) {
    const fj = gy / step
    const j0 = Math.min(gw - 2, Math.floor(fj))
    const v = fj - j0
    for (let gx = 0; gx < n; gx++) {
      const fi = gx / step
      const i0 = Math.min(gw - 2, Math.floor(fi))
      const u = fi - i0
      const a = j0 * gw + i0
      const e = E[a] * (1 - u) * (1 - v) + E[a + 1] * u * (1 - v) + E[a + gw] * (1 - u) * v + E[a + gw + 1] * u * v
      const nn = Nn[a] * (1 - u) * (1 - v) + Nn[a + 1] * u * (1 - v) + Nn[a + gw] * (1 - u) * v + Nn[a + gw + 1] * u * v
      const px = Math.floor((e - E0) / RES)
      const py = Math.floor((N0 - nn) / RES)
      const t = tiles.get(`${Math.floor(px / TILE)}|${Math.floor(py / TILE)}`)
      if (!t) continue
      const val = t[(py % TILE) * TILE + (px % TILE)]
      out[gy * n + gx] = val === NODATA ? 0 : val
    }
  }
  return out
}

/** Ålder i en enskild punkt (används vid träning – hämtar bara en ruta). */
export async function ageAt(kind: keyof typeof AGE_FILES, lat: number, lng: number) {
  const [e, n] = toSweref(lat, lng)
  const px = Math.floor((e - E0) / RES)
  const py = Math.floor((N0 - n) / RES)
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= ACROSS || ty >= DOWN) return 0
  const tiles = await loadTiles(AGE_FILES[kind], tx, tx, ty, ty)
  const t = tiles.get(`${tx}|${ty}`)
  if (!t) return 0
  const v = t[(py % TILE) * TILE + (px % TILE)]
  return v === NODATA ? 0 : v
}
