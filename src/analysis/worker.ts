/// <reference lib="webworker" />
/**
 * Analysmotorn för chanskartan. Körs i en Web Worker så att kartan förblir
 * följsam medan tunga beräkningar pågår.
 *
 * För varje kartruta (webbmercator z/x/y) hämtas tre öppna datakällor med en
 * marginal runt rutan så att grannskapsberäkningar fungerar över rutkanter:
 *
 *   1. NMD 2023 (Naturvårdsverket) – trädslag, fastmark/våtmark, hyggen, myr
 *   2. SGU Jordarter 1:25 000–1:100 000 – sand, morän, lera, torv, berg
 *   3. Terrarium-höjddata (AWS Open Data) – terrängläge, lutning, väderstreck
 *
 * Av dessa räknas per pixel fram: relativ höjd (TPI), sydlighet, andel öppen
 * mark / våtmark / ädellöv i närheten. Sedan vägs varje arts habitatkrav ihop
 * med kontinuitet, säsong, väder och dina egna fynd till en chans 0–1.
 */
import { CODE_INFO, COLOR_TO_CODE, NMD_LAYER, NMD_WMS, SGU_LAYER, SGU_WMS, SOIL_COLOR_TO_INDEX, SOIL_DETAIL, SOIL_NAMES } from './nmdcodes'
import { SPECIES_MODELS, seasonFactor, targetSpecies, type SpeciesModel, type TreeKey } from './species'
import type { ChanceOptions, FactorBreakdown, Hotspot, InspectResult, SpeciesResult, WorkerRequest, WorkerResponse } from './protocol'
import { ageAt, ageGrid } from './age'
import { TREE_KEYS, lut, product, score, type Parts, type PixelFeatures } from './model'
import { pathGrid } from './paths'

declare const self: DedicatedWorkerGlobalScope

const HALF = 20037508.342789244
const TS = 256 // rutstorlek
const M = 32 // marginal i pixlar
const N = TS + 2 * M

/* ------------------------------------------------------------------ */
/*  Geometri                                                           */
/* ------------------------------------------------------------------ */

function tileBox(z: number, x: number, y: number) {
  const span = (2 * HALF) / 2 ** z
  const mpp = span / TS
  const minx = -HALF + x * span - M * mpp
  const maxy = HALF - y * span + M * mpp
  return { minx, maxy, maxx: minx + N * mpp, miny: maxy - N * mpp, mpp }
}
const yToLat = (y: number) => (Math.atan(Math.exp(y / 6378137)) * 2 - Math.PI / 2) * (180 / Math.PI)
const xToLng = (x: number) => (x / 6378137) * (180 / Math.PI)
const latToY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137
const lngToX = (lng: number) => (lng * Math.PI * 6378137) / 180

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/* ------------------------------------------------------------------ */
/*  Hämtning och avkodning                                             */
/* ------------------------------------------------------------------ */

/**
 * Källdatan (NMD 2023, jordartskartan, höjdmodellen) ändras nästan aldrig,
 * så varje hämtad bild sparas i webbläsarens Cache Storage. Andra gången
 * ett område öppnas laddas allt lokalt.
 */
const CACHE_NAME = 'mycel-data-v1'
let cacheP: Promise<Cache | null> | null = null
const openCache = () => (cacheP ??= 'caches' in self ? caches.open(CACHE_NAME).catch(() => null) : Promise.resolve(null))

/**
 * På den publicerade sajten går NMD- och SGU-bilderna via Netlifys delade cache
 * (netlify/functions/wms.mts) – källservrarna är långsamma. Svarar inte cachen
 * hämtas bilden direkt från källan.
 */
function viaCdn(url: string) {
  if (!import.meta.env.PROD) return null
  if (url.startsWith(NMD_WMS + '?')) return '/wms/nmd' + url.slice(NMD_WMS.length)
  if (url.startsWith(SGU_WMS + '?')) return '/wms/sgu' + url.slice(SGU_WMS.length)
  return null
}

async function download(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image')) throw new Error('Inte en bild')
  return blob
}

/**
 * Cachen svarar på under en sekund när bilden redan finns där. Finns den inte
 * hämtar funktionen från källan, och den kan ge upp efter 10 s – så om inget
 * svar kommit efter 2,5 s hämtas bilden även direkt, och det som kommer först används.
 */
function raceCdn(cdn: string, direct: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false
    let failures = 0
    let started = 1
    const ok = (b: Blob) => {
      settled = true
      clearTimeout(timer)
      resolve(b)
    }
    const fail = (e: unknown) => {
      if (++failures === started && started === 2) reject(e)
      else if (started === 1) startDirect()
    }
    const startDirect = () => {
      if (started === 2 || settled) return
      started = 2
      download(direct).then(ok, fail)
    }
    download(cdn).then(ok, fail)
    const timer = setTimeout(startDirect, 2500)
  })
}

async function fetchBlob(url: string): Promise<Blob> {
  const cache = await openCache()
  const hit = await cache?.match(url).catch(() => undefined)
  if (hit) return hit.blob()
  const cdn = viaCdn(url)
  const blob = cdn ? await raceCdn(cdn, url) : await download(url)
  cache?.put(url, new Response(blob, { headers: { 'content-type': blob.type } })).catch(() => {})
  return blob
}

async function fetchPixels(url: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const blob = await fetchBlob(url)
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return ctx.getImageData(0, 0, w, h).data
}

function wms(base: string, layer: string, b: ReturnType<typeof tileBox>, size: number, extra = '') {
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    srs: 'EPSG:3857',
    bbox: [b.minx, b.miny, b.maxx, b.maxy].join(','),
    width: String(size),
    height: String(size),
  })
  return `${base}?${q}${extra}`
}

/*
 * Block: webbläsaren tillåter bara ~6 samtidiga anrop per server, så NMD och
 * jordarter hämtas i block om 2×2 rutor (+ marginal) – fyra gånger färre anrop.
 */
const BLK = 2
const BN = BLK * TS + 2 * M

function blockBox(z: number, bx: number, by: number) {
  const span = (2 * HALF) / 2 ** z
  const mpp = span / TS
  const minx = -HALF + bx * BLK * span - M * mpp
  const maxy = HALF - by * BLK * span + M * mpp
  return { minx, maxy, maxx: minx + BN * mpp, miny: maxy - BN * mpp, mpp }
}

function memo<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>, max = 60) {
  let p = map.get(key)
  if (!p) {
    p = make()
    p.catch(() => map.delete(key))
    map.set(key, p)
    if (map.size > max) map.delete(map.keys().next().value!)
  }
  return p
}

/** Klipp ut en rutas N×N-fönster ur sitt block. */
function crop(block: Uint8Array, x: number, y: number) {
  const ox = (x % BLK) * TS, oy = (y % BLK) * TS
  const out = new Uint8Array(N * N)
  for (let gy = 0; gy < N; gy++) out.set(block.subarray((oy + gy) * BN + ox, (oy + gy) * BN + ox + N), gy * N)
  return out
}

const nmdBlocks = new Map<string, Promise<Uint8Array>>()
function nmdBlock(z: number, bx: number, by: number) {
  return memo(nmdBlocks, `${z}/${bx}/${by}`, async () => {
    const px = await fetchPixels(wms(NMD_WMS, NMD_LAYER, blockBox(z, bx, by), BN), BN, BN)
    const codes = new Uint8Array(BN * BN)
    for (let i = 0, j = 0; i < codes.length; i++, j += 4) {
      if (px[j + 3] < 128) continue
      codes[i] = COLOR_TO_CODE.get((px[j] << 16) | (px[j + 1] << 8) | px[j + 2]) ?? 0
    }
    return codes
  })
}

async function loadNmd(z: number, x: number, y: number) {
  return crop(await nmdBlock(z, Math.floor(x / BLK), Math.floor(y / BLK)), x, y)
}

/** SGU ritas bara upp till ~25 m/pixel – vid grövre zoom hämtas en större bild som sedan förminskas. */
const PATTERN = 255 // täckt men okänd färg: prickar, streck, kantlinjer
const soilBlocks = new Map<string, Promise<Uint8Array>>()
function soilBlock(z: number, bx: number, by: number) {
  return memo(soilBlocks, `${z}/${bx}/${by}`, async () => {
    const b = blockBox(z, bx, by)
    const f = Math.max(1, Math.ceil(b.mpp / 24))
    const size = BN * f
    const px = await fetchPixels(wms(SGU_WMS, SGU_LAYER, b, size, '&format_options=antialias:none'), size, size)
    const raw = new Uint8Array(size * size)
    for (let i = 0, j = 0; i < raw.length; i++, j += 4) {
      if (px[j + 3] < 128) continue // ej karterat / vatten
      raw[i] = SOIL_COLOR_TO_INDEX.get((px[j] << 16) | (px[j + 1] << 8) | px[j + 2]) ?? PATTERN
    }
    const grid = f === 1 ? raw : downsample(raw, size, f)
    return fillPattern(grid, BN, 3)
  })
}

/** Förminska med majoritet bland kända jordarter. */
function downsample(src: Uint8Array, size: number, f: number) {
  const out = new Uint8Array(BN * BN)
  const counts = new Uint16Array(256)
  for (let gy = 0; gy < BN; gy++)
    for (let gx = 0; gx < BN; gx++) {
      let best = 0, bestN = 0, pattern = false
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const v = src[(gy * f + dy) * size + gx * f + dx]
          if (v === PATTERN) pattern = true
          else if (v && ++counts[v] > bestN) {
            bestN = counts[v]
            best = v
          }
        }
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) counts[src[(gy * f + dy) * size + gx * f + dx]] = 0
      out[gy * BN + gx] = best || (pattern ? PATTERN : 0)
    }
  return out
}

/** Ersätt mönsterpixlar med vanligaste kända jordart inom radie r – bara där det behövs. */
function fillPattern(src: Uint8Array, size: number, r: number) {
  const out = src.slice()
  const counts = new Uint16Array(256)
  const touched: number[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (src[i] !== PATTERN) continue
      let best = 0, bestN = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= size) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= size) continue
          const v = src[yy * size + xx]
          if (!v || v === PATTERN) continue
          if (counts[v]++ === 0) touched.push(v)
          if (counts[v] > bestN) {
            bestN = counts[v]
            best = v
          }
        }
      }
      for (const v of touched) counts[v] = 0
      touched.length = 0
      out[i] = best
    }
  return out
}

async function loadSoil(z: number, x: number, y: number) {
  return crop(await soilBlock(z, Math.floor(x / BLK), Math.floor(y / BLK)), x, y)
}

/* Terrarium: höjd = (R·256 + G + B/256) − 32768 */
const demTiles = new Map<string, Promise<Float32Array | null>>()
function demTile(z: number, x: number, y: number) {
  const n = 2 ** z
  x = ((x % n) + n) % n
  const key = `${z}/${x}/${y}`
  let p = demTiles.get(key)
  if (!p) {
    p = fetchPixels(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, 256, 256)
      .then((px) => {
        const e = new Float32Array(256 * 256)
        for (let i = 0, j = 0; i < e.length; i++, j += 4) e[i] = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768
        return e
      })
      .catch(() => null)
    demTiles.set(key, p)
    if (demTiles.size > 300) demTiles.delete(demTiles.keys().next().value!)
  }
  return p
}

/**
 * Höjdmodellen har ~30 m upplösning i Sverige, så den hämtas en nivå grövre
 * än kartan och högst på zoom 12 (en höjdruta täcker 16 kartrutor på zoom 14)
 * och interpoleras bilinjärt.
 */
const DEM_MAX_Z = 12
async function loadDem(z: number, x: number, y: number) {
  const dz = Math.min(z - 1, DEM_MAX_Z)
  const s = 2 ** (z - dz)
  const lo = (v: number) => Math.floor((v * TS - M) / s / 256)
  const hi = (v: number) => Math.floor((v * TS + TS + M) / s / 256)
  const need: [number, number][] = []
  for (let ty = lo(y); ty <= hi(y); ty++) for (let tx = lo(x); tx <= hi(x); tx++) need.push([tx, ty])
  const tiles = new Map<string, Float32Array | null>()
  await Promise.all(need.map(async ([tx, ty]) => tiles.set(`${tx}/${ty}`, await demTile(dz, tx, ty))))
  if ([...tiles.values()].some((t) => !t)) return null
  const at = (X: number, Y: number) => {
    const tx = Math.floor(X / 256), ty = Math.floor(Y / 256)
    return tiles.get(`${tx}/${ty}`)![(Y - ty * 256) * 256 + (X - tx * 256)]
  }
  const e = new Float32Array(N * N)
  for (let gy = 0; gy < N; gy++) {
    const Y = (y * TS + gy - M + 0.5) / s - 0.5
    const y0 = Math.floor(Y), fy = Y - y0
    for (let gx = 0; gx < N; gx++) {
      const X = (x * TS + gx - M + 0.5) / s - 0.5
      const x0 = Math.floor(X), fx = X - x0
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1)
      e[gy * N + gx] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  }
  return e
}

/* ------------------------------------------------------------------ */
/*  Rasterverktyg                                                      */
/* ------------------------------------------------------------------ */

/** Medelvärde i fyrkant med radie r (summerad-area-tabell, O(1) per pixel). */
function boxMean(src: Float32Array, r: number) {
  const W = N + 1
  const sat = new Float64Array(W * W)
  for (let y = 0; y < N; y++) {
    let row = 0
    for (let x = 0; x < N; x++) {
      row += src[y * N + x]
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row
    }
  }
  const out = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(N, y + r + 1)
    for (let x = 0; x < N; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(N, x + r + 1)
      const s = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]
      out[y * N + x] = s / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

function modeFilter(src: Uint8Array, r: number) {
  const out = new Uint8Array(N * N)
  const counts = new Uint16Array(256)
  const touched: number[] = []
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let best = src[y * N + x]
      let bestN = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= N) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= N) continue
          const v = src[yy * N + xx]
          if (counts[v]++ === 0) touched.push(v)
          if (counts[v] > bestN) {
            bestN = counts[v]
            best = v
          }
        }
      }
      for (const v of touched) counts[v] = 0
      touched.length = 0
      out[y * N + x] = best
    }
  return out
}

/* ------------------------------------------------------------------ */
/*  Rutdata med lat laddning                                           */
/* ------------------------------------------------------------------ */

interface Features {
  z: number
  x: number
  y: number
  box: ReturnType<typeof tileBox>
  lat: number
  /** markmeter per pixel */
  gm: number
  codes: Uint8Array
  smooth?: Uint8Array
  soil?: Uint8Array // index i SOIL_DETAIL
  soilGroup?: Uint8Array
  elev?: Float32Array | null
  tpi?: Float32Array // −1…1
  tpiM?: Float32Array // meter
  south?: Float32Array // −1…1, viktad med lutning
  slope?: Float32Array // grader
  openNb?: Float32Array
  wetNb?: Float32Array
  nobleNb?: Float32Array
  builtNb?: Float32Array
  forestNb?: Float32Array
  /** index i TREE_KEYS (0 = ingen skog) */
  treeIdx?: Uint8Array
  /** 0 fastmark, 1 våtmark, 2 myr */
  wetKind?: Uint8Array
  edgeS?: Float32Array
  urban?: Float32Array
  forestShare?: Float32Array
  nobleF?: Float32Array
  /** skogsålder per pixel (år, 0 = okänd), vald efter trädslag */
  age?: Uint16Array
  /** stigar: 1 = stig, 2 = skogsbilväg */
  paths?: Uint8Array
  /** andel stig/skogsväg inom ~30 m */
  pathNb?: Float32Array
  /** jordart + höjd inlästa */
  complete?: boolean
}

const cache = new Map<string, Promise<Features>>()
const full = new Map<string, Promise<Features>>()

function rpx(f: Features, meters: number) {
  return clamp(Math.round(meters / f.gm), 1, M)
}

function base(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`
  let p = cache.get(key)
  if (!p) {
    p = loadNmd(z, x, y).then((codes) => {
      const box = tileBox(z, x, y)
      const lat = yToLat((box.miny + box.maxy) / 2)
      return { z, x, y, box, lat, gm: box.mpp * Math.cos((lat * Math.PI) / 180), codes }
    })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
    if (cache.size > 160) {
      const old = cache.keys().next().value!
      cache.delete(old)
      full.delete(old)
    }
  }
  return p
}

function smoothCodes(f: Features) {
  if (!f.smooth) f.smooth = modeFilter(f.codes, clamp(Math.round(12 / f.gm), 1, 2))
  return f.smooth
}

/** Grannskapsvariabler från NMD – billiga, räknas direkt när skogsdatan finns. */
function ensureNb(f: Features) {
  if (f.openNb) return f
  const open = new Float32Array(N * N)
  const wet = new Float32Array(N * N)
  const noble = new Float32Array(N * N)
  const built = new Float32Array(N * N)
  const forest = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) {
    const ci = CODE_INFO[f.codes[i]]
    if (!ci) continue
    if (ci.open || ci.young) open[i] = 1
    if (ci.mire || ci.water || (ci.forest && ci.wet)) wet[i] = 1
    if (ci.noble) noble[i] = 1
    if (ci.built) built[i] = 1
    else if (ci.road) built[i] = 0.3
    if (ci.forest && !ci.young) forest[i] = 1
  }
  f.openNb = boxMean(open, rpx(f, 80))
  f.wetNb = boxMean(wet, rpx(f, 100))
  f.nobleNb = boxMean(noble, rpx(f, 80))
  f.builtNb = boxMean(built, rpx(f, 120))
  f.forestNb = boxMean(forest, rpx(f, 160))

  // Artoberoende delar av modellen räknas en gång per ruta
  f.treeIdx = new Uint8Array(N * N)
  f.wetKind = new Uint8Array(N * N)
  f.edgeS = new Float32Array(N * N)
  f.urban = new Float32Array(N * N)
  f.forestShare = new Float32Array(N * N)
  f.nobleF = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) {
    const ci = CODE_INFO[f.codes[i]]
    if (ci?.tree) {
      f.treeIdx[i] = TREE_KEYS.indexOf(ci.tree)
      f.wetKind[i] = ci.mire ? 2 : ci.wet ? 1 : 0
    }
    const o = f.openNb[i]
    f.edgeS[i] = Math.min(1, 4 * o * (1 - o))
    // Bebyggelse: träd i villaträdgårdar och parker är inga svampskogar
    f.urban[i] = 1 - 0.9 * Math.min(1, f.builtNb[i] * 3.5)
    // Skogskärna: ju skogsrikare omgivning, desto mer etablerat mykorrhiza-nätverk
    f.forestShare[i] = Math.min(1, f.forestNb[i] / 0.65)
    f.nobleF[i] = 0.25 + 0.75 * Math.min(1, f.nobleNb[i] * 2.5)
  }
  return f
}

/** Laddar jordart + höjd och räknar fram alla artoberoende variabler. */
function features(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`
  let p = full.get(key)
  if (!p) {
    p = (async () => {
      const f = await base(z, x, y)
      // Skogsålder och stigar på detaljerad zoom (≥ 13) – på översiktszoom vore datamängden för stor
      const detail = z >= 13 && !TRAINING
      const toLatLng = (gx: number, gy: number): [number, number] => [yToLat(f.box.maxy - (gy + 0.5) * f.box.mpp), xToLng(f.box.minx + (gx + 0.5) * f.box.mpp)]
      const [soil, elev, agePine, ageSpruce, paths] = await Promise.all([
        loadSoil(z, x, y).catch(() => new Uint8Array(N * N)),
        loadDem(z, x, y).catch(() => null),
        detail ? ageGrid('tall', N, toLatLng).catch(() => null) : null,
        detail ? ageGrid('gran', N, toLatLng).catch(() => null) : null,
        detail ? pathGrid(z, x, y, N, M, TS).catch(() => null) : null,
      ])
      if (agePine || ageSpruce) {
        const age = new Uint16Array(N * N)
        for (let i = 0; i < N * N; i++) {
          const t = CODE_INFO[f.codes[i]]?.tree
          const pa = agePine?.[i] ?? 0, sa = ageSpruce?.[i] ?? 0
          // tallskog → tallkartan, granskog → grankartan, blandskog → medel av kända värden
          age[i] =
            t === 'tall' ? pa : t === 'gran' ? sa : t === 'barrbland' || t === 'lovbarr' ? (pa && sa ? Math.round((pa + sa) / 2) : pa || sa) : 0
        }
        f.age = age
      }
      if (paths) {
        f.paths = paths
        const m = new Float32Array(N * N)
        for (let i = 0; i < N * N; i++) if (paths[i]) m[i] = 1
        f.pathNb = boxMean(m, rpx(f, 30))
      }
      f.soil = soil
      f.soilGroup = soil.map((i) => SOIL_DETAIL[i].group)
      f.elev = elev

      if (elev) {
        const e = boxMean(elev, rpx(f, 20)) // dämpa brus i höjddatan
        const mean = boxMean(e, rpx(f, 150))
        f.tpiM = new Float32Array(N * N)
        f.tpi = new Float32Array(N * N)
        f.south = new Float32Array(N * N)
        f.slope = new Float32Array(N * N)
        for (let yy = 1; yy < N - 1; yy++)
          for (let xx = 1; xx < N - 1; xx++) {
            const i = yy * N + xx
            const t = e[i] - mean[i]
            f.tpiM[i] = t
            f.tpi[i] = clamp(t / 4, -1, 1)
            const gx = (e[i + 1] - e[i - 1]) / (2 * f.gm)
            const gy = (e[i + N] - e[i - N]) / (2 * f.gm) // positiv = stiger söderut
            const g = Math.hypot(gx, gy)
            const slope = (Math.atan(g) * 180) / Math.PI
            f.slope[i] = slope
            f.south[i] = g > 1e-4 ? (-gy / g) * Math.min(1, slope / 8) : 0
          }
      }

      ensureNb(f)
      f.complete = true
      return f
    })()
    p.catch(() => full.delete(key))
    full.set(key, p)
  }
  return p
}

/* ------------------------------------------------------------------ */
/*  Modellen                                                           */
/* ------------------------------------------------------------------ */

/** Läser rutnätets värden i pixel i till en återanvändbar egenskapsvektor. */
function pixelFeatures(f: Features, i: number, fv: PixelFeatures): PixelFeatures {
  fv.tree = f.treeIdx![i]
  fv.wet = f.wetKind![i]
  fv.soil = f.soilGroup ? f.soilGroup[i] : 0
  fv.tpi = f.tpi ? f.tpi[i] : null
  fv.south = f.south ? f.south[i] : 0
  fv.edge = f.edgeS![i]
  fv.wetNb = f.wetNb![i]
  fv.urban = f.urban![i]
  fv.noble = f.nobleF![i]
  fv.forest = f.forestShare![i]
  fv.age = f.age ? f.age[i] : 0
  fv.path = f.pathNb ? f.pathNb[i] : null
  return fv
}

function parts(sp: SpeciesModel, f: Features, i: number): Parts | null {
  const out = {} as Parts
  return score(sp, lut(sp), pixelFeatures(f, i, {} as PixelFeatures), out) ? out : null
}

function baseGrid(sp: SpeciesModel, f: Features) {
  const g = new Float32Array(N * N)
  const L = lut(sp)
  const fv = {} as PixelFeatures
  const scratch = {} as Parts
  for (let i = 0; i < N * N; i++) if (f.treeIdx![i]) g[i] = score(sp, L, pixelFeatures(f, i, fv), scratch)
  return g
}

const continuityFactor = (sp: SpeciesModel, ctx: number) => 1 - sp.continuity + sp.continuity * Math.min(1, ctx / 0.55)

function temporal(sp: SpeciesModel, opts: ChanceOptions, lat: number) {
  const range = sp.range ? sp.range(lat) : 1
  if (opts.mode === 'potential') return { season: 1, weather: 1, range }
  return { season: 0.12 + 0.88 * seasonFactor(sp, opts.doy, lat), weather: opts.weather[sp.id] ?? 1, range }
}

/** Dina fynd: närhet till tidigare fyndplatser + likhet med deras skogstyp och jordart. */
function learningGrid(sp: SpeciesModel, f: Features, opts: ChanceOptions): Float32Array | null {
  const finds = opts.finds.filter((d) => d.sp === sp.id)
  const misses = (opts.misses ?? []).filter((d) => d.sp === sp.id)
  const sig = opts.sigs[sp.id]
  if (!finds.length && !sig?.n && !misses.length) return null
  const L = new Float32Array(N * N).fill(1)
  const sigma = 250 / Math.cos((f.lat * Math.PI) / 180) // meter → mercatorenheter
  const reach = 3 * sigma
  const near = finds.filter((d) => d.mx > f.box.minx - reach && d.mx < f.box.maxx + reach && d.my > f.box.miny - reach && d.my < f.box.maxy + reach)
  const prox = new Float32Array(N * N)
  for (const d of near) {
    const cx = (d.mx - f.box.minx) / f.box.mpp
    const cy = (f.box.maxy - d.my) / f.box.mpp
    const rs = reach / f.box.mpp
    for (let y = Math.max(0, Math.floor(cy - rs)); y < Math.min(N, cy + rs); y++)
      for (let x = Math.max(0, Math.floor(cx - rs)); x < Math.min(N, cx + rs); x++) {
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) * f.box.mpp ** 2
        const v = Math.exp(-d2 / (2 * sigma * sigma))
        if (v > prox[y * N + x]) prox[y * N + x] = v
      }
  }
  // "Hittade inget": sänk chansen inom ~300 m, mest i själva punkten
  const missF = new Float32Array(N * N).fill(1)
  const ms = 150 / Math.cos((f.lat * Math.PI) / 180)
  for (const d of misses) {
    const cx = (d.mx - f.box.minx) / f.box.mpp
    const cy = (f.box.maxy - d.my) / f.box.mpp
    const rs = (3 * ms) / f.box.mpp
    if (cx < -rs || cy < -rs || cx > N + rs || cy > N + rs) continue
    for (let y = Math.max(0, Math.floor(cy - rs)); y < Math.min(N, cy + rs); y++)
      for (let x = Math.max(0, Math.floor(cx - rs)); x < Math.min(N, cx + rs); x++) {
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) * f.box.mpp ** 2
        missF[y * N + x] *= 1 - 0.45 * d.w * Math.exp(-d2 / (2 * ms * ms))
      }
  }
  for (let i = 0; i < N * N; i++) {
    let l = (1 + 0.3 * prox[i]) * missF[i]
    if (sig?.n) {
      const tk = TREE_KEYS[f.treeIdx![i]]
      const treeShare = tk ? (sig.tree[tk] ?? 0) / sig.n : 0
      const soilShare = f.soilGroup ? (sig.soil[f.soilGroup[i]] ?? 0) / sig.n : 0
      l *= 1 + 0.15 * treeShare + 0.1 * soilShare
    }
    L[i] = Math.min(1.45, Math.max(0.5, l))
  }
  return L
}

interface SpeciesGrid {
  sp: SpeciesModel
  chance: Float32Array
  /** högsta möjliga chans just nu (säsong × väder × utbredning × värde) */
  ceiling: number
}

function speciesGrids(f: Features, opts: ChanceOptions): SpeciesGrid[] {
  const group = opts.target === 'svamp' || opts.target === 'bar'
  return targetSpecies(opts.target).map((sp) => {
    // i "Alla svampar/bär" väger eftertraktade arter tyngre
    const value = group ? sp.value : 1
    const b = baseGrid(sp, f)
    const ctx = boxMean(b, rpx(f, 60))
    const t = temporal(sp, opts, f.lat)
    const k = t.season * t.weather * t.range
    const L = learningGrid(sp, f, opts)
    const chance = new Float32Array(N * N)
    for (let i = 0; i < N * N; i++) {
      if (!b[i]) continue
      chance[i] = Math.min(1, b[i] * continuityFactor(sp, ctx[i]) * k * value * (L ? L[i] : 1))
    }
    return { sp, chance, ceiling: k * value }
  })
}

/* Färgskala: varm honung → bärnsten → glödande orange */
const RAMP: [number, [number, number, number, number]][] = [
  [0, [255, 236, 120, 0.42]],
  [0.35, [255, 196, 40, 0.6]],
  [0.7, [255, 132, 26, 0.72]],
  [1, [246, 70, 10, 0.8]],
]
const RAMP_LUT = new Uint8ClampedArray(256 * 4)
for (let k = 0; k < 256; k++) {
  const t = k / 255
  let a = RAMP[0], b = RAMP[RAMP.length - 1]
  for (let j = 0; j < RAMP.length - 1; j++)
    if (t >= RAMP[j][0] && t <= RAMP[j + 1][0]) {
      a = RAMP[j]
      b = RAMP[j + 1]
      break
    }
  const u = (t - a[0]) / (b[0] - a[0] || 1)
  for (let c = 0; c < 4; c++) RAMP_LUT[k * 4 + c] = Math.round((a[1][c] + (b[1][c] - a[1][c]) * u) * (c === 3 ? 255 : 1))
}

const SHOW = 0.36
const LINE = 0.55

/* ------------------------------------------------------------------ */
/*  Valda områden (kommuner)                                           */
/* ------------------------------------------------------------------ */

type Shape = { polygons: [number, number][][][] }
const shapeCache = new Map<string, Promise<Shape | null>>()
const loadShape = (id: string) => {
  let p = shapeCache.get(id)
  if (!p) {
    p = fetch(`/kommuner/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Shape>) : null))
      .catch(() => null)
    shapeCache.set(id, p)
  }
  return p
}

/** 1 = inom något av de valda områdena. Rastreras med canvas (jämn-udda för hål). */
async function areaMask(f: Features, ids: string[]) {
  const shapes = (await Promise.all(ids.map(loadShape))).filter((s): s is Shape => !!s)
  if (!shapes.length) return null
  const canvas = new OffscreenCanvas(N, N)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  for (const s of shapes)
    for (const poly of s.polygons) {
      ctx.beginPath()
      for (const ring of poly)
        ring.forEach(([lng, lat], i) => {
          const gx = (lngToX(lng) - f.box.minx) / f.box.mpp
          const gy = (f.box.maxy - latToY(lat)) / f.box.mpp
          if (i) ctx.lineTo(gx, gy)
          else ctx.moveTo(gx, gy)
        })
      ctx.fill('evenodd')
    }
  const d = ctx.getImageData(0, 0, N, N).data
  const m = new Uint8Array(N * N)
  for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] > 127 ? 1 : 0
  return m
}

async function chanceTile(z: number, x: number, y: number, opts: ChanceOptions, quick: boolean) {
  // Snabbt läge: rita direkt från skogsdatan medan jordart och höjd laddas
  const f = quick ? ensureNb(await base(z, x, y)) : await features(z, x, y)
  const grids = speciesGrids(f, opts)
  const best = new Float32Array(N * N)
  const arg = new Uint8Array(N * N)
  grids.forEach((g, s) => {
    for (let i = 0; i < N * N; i++)
      if (g.chance[i] > best[i]) {
        best[i] = g.chance[i]
        arg[i] = s
      }
  })
  // utanför valda kommuner: ingen chans (och inga toppar)
  if (opts.areas?.length) {
    const mask = await areaMask(f, opts.areas)
    if (mask) for (let i = 0; i < N * N; i++) if (!mask[i]) best[i] = 0
  }

  // Färgskalan följer bästa möjliga chans just nu, så att de bästa
  // områdena syns även i dåligt väder – procentsatserna förblir absoluta.
  const ceiling = Math.max(0.25, Math.min(1, Math.max(...grids.map((g) => g.ceiling))))
  const softAbs = boxMean(boxMean(best, rpx(f, 10)), 1)
  const soft = new Float32Array(softAbs.length)
  for (let i = 0; i < soft.length; i++) soft[i] = Math.min(1, softAbs[i] / ceiling)
  // Användarens chansfilter (absolut %): allt under gränsen döljs
  const minC = opts.minChance || 0
  const mask = new Uint8Array(N * N)
  for (let i = 0; i < mask.length; i++) mask[i] = soft[i] >= SHOW && softAbs[i] >= minC ? 1 : 0

  // Områdesfilter: enstaka prickar tas bort, närliggande fläckar slås ihop till
  // sammanhängande ytor och områden under minsta storlek döljs.
  const cellHa = (f.gm * f.gm) / 10000
  const minHa = opts.minAreaHa ?? 0
  const cleaned = minHa > 0 ? dilate(erode(mask, 1), 1) : mask
  const areas = areaFilter(cleaned, minHa > 0 ? rpx(f, 15) : 0, minHa / cellHa)
  const keep = (j: number) => areas.region[j] === 1 && areas.size[areas.label[j]] > 0
  const shown = (j: number) => soft[j] >= LINE && softAbs[j] >= minC && keep(j)
  const rgba = new Uint8ClampedArray(TS * TS * 4)
  for (let y2 = 0; y2 < TS; y2++)
    for (let x2 = 0; x2 < TS; x2++) {
      const i = (y2 + M) * N + x2 + M
      if (!keep(i)) continue
      // luckor som fyllts när fläckar slogs ihop får områdets lägsta färg
      const v = Math.max(soft[i], SHOW + 0.04)
      const o = (y2 * TS + x2) * 4
      const edge = shown(i) && (!shown(i - 1) || !shown(i + 1) || !shown(i - N) || !shown(i + N))
      if (edge) {
        rgba.set([255, 246, 214, 235], o)
        continue
      }
      const k = Math.round(((v - SHOW) / (1 - SHOW)) * 255) * 4
      rgba[o] = RAMP_LUT[k]
      rgba[o + 1] = RAMP_LUT[k + 1]
      rgba[o + 2] = RAMP_LUT[k + 2]
      rgba[o + 3] = RAMP_LUT[k + 3]
    }

  const spots = hotspots(f, best, arg, grids, Math.max(0.5 * ceiling, minC), (i) => {
    const l = areas.label[i]
    return keep(i) ? areas.size[l] * cellHa : -1
  })
  return { rgba, hotspots: spots, complete: !!f.complete }
}

/**
 * Sammanhängande områden i en mask. Först en morfologisk stängning (radie r)
 * så att fläckar som ligger några meter isär räknas som samma område, sedan
 * 8-grannars komponentmärkning. Områden mindre än `minPx` får storlek 0.
 * Områden som når rutans ytterkant kan fortsätta in i grannrutan – de behålls
 * om de är minst 40 % av gränsen, så att stora områden inte klipps vid kanten.
 */
function areaFilter(mask: Uint8Array, r: number, minPx: number) {
  const closed = r > 0 ? erode(dilate(mask, r), r) : mask
  const label = new Int32Array(N * N)
  const size: number[] = [0]
  const stack: number[] = []
  for (let s = 0; s < N * N; s++) {
    if (!closed[s] || label[s]) continue
    const id = size.length
    let count = 0
    let border = false
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const j = stack.pop()!
      if (mask[j]) count++
      const x = j % N, y = (j / N) | 0
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) border = true
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= N) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= N) continue
          const k = yy * N + xx
          if (closed[k] && !label[k]) {
            label[k] = id
            stack.push(k)
          }
        }
      }
    }
    size.push(count >= minPx || (border && count >= 0.4 * minPx) ? count : 0)
  }
  return { label, size, region: closed }
}

/** Kvadratisk max-/minfiltrering i två pass (separabel). */
function morph(src: Uint8Array, r: number, grow: boolean) {
  const tmp = new Uint8Array(N * N)
  const out = new Uint8Array(N * N)
  const hit = grow ? 1 : 0
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = grow ? 0 : 1
      for (let d = -r; d <= r && v !== hit; d++) {
        const xx = x + d
        if (xx >= 0 && xx < N && src[y * N + xx] === hit) v = hit
      }
      tmp[y * N + x] = v
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = grow ? 0 : 1
      for (let d = -r; d <= r && v !== hit; d++) {
        const yy = y + d
        if (yy >= 0 && yy < N && tmp[yy * N + x] === hit) v = hit
      }
      out[y * N + x] = v
    }
  return out
}
const dilate = (m: Uint8Array, r: number) => morph(m, r, true)
const erode = (m: Uint8Array, r: number) => morph(m, r, false)

/** Toppar i den utjämnade chansytan, med icke-maximum-undertryckning. */
function hotspots(f: Features, best: Float32Array, arg: Uint8Array, grids: SpeciesGrid[], min: number, areaHa: (i: number) => number): Hotspot[] {
  const sm = boxMean(best, rpx(f, 35))
  const cand: number[] = []
  for (let y = M; y < M + TS; y++)
    for (let x = M; x < M + TS; x++) {
      const i = y * N + x
      const v = sm[i]
      if (v < min || areaHa(i) <= 0) continue
      if (v >= sm[i - 1] && v >= sm[i + 1] && v >= sm[i - N] && v >= sm[i + N] && v > sm[i - N - 1] && v > sm[i + N + 1]) cand.push(i)
    }
  cand.sort((a, b) => sm[b] - sm[a])
  const rs = rpx(f, 350)
  const picked: number[] = []
  for (const i of cand) {
    const x = i % N, y = (i / N) | 0
    if (picked.some((j) => (j % N - x) ** 2 + (((j / N) | 0) - y) ** 2 < rs * rs)) continue
    picked.push(i)
    if (picked.length >= 4) break
  }
  return picked.map((i) => {
    const x = i % N, y = (i / N) | 0
    // vanligaste arten i toppens närhet
    const votes = new Float32Array(grids.length)
    const r = rpx(f, 40)
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) votes[arg[yy * N + xx]] += best[yy * N + xx]
    let s = 0
    votes.forEach((v, k) => v > votes[s] && (s = k))
    return {
      lat: yToLat(f.box.maxy - (y + 0.5) * f.box.mpp),
      lng: xToLng(f.box.minx + (x + 0.5) * f.box.mpp),
      score: sm[i],
      species: grids[s].sp.id,
      areaHa: areaHa(i),
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Inspektion av en punkt                                             */
/* ------------------------------------------------------------------ */

const INSPECT_Z = 14
const ASPECTS = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst']

async function inspect(lat: number, lng: number, opts: ChanceOptions): Promise<InspectResult> {
  const z = INSPECT_Z
  const n = 2 ** z
  const X = ((lng + 180) / 360) * n
  const Y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const tx = Math.floor(X), ty = Math.floor(Y)
  const f = await features(z, tx, ty)
  const px = Math.floor((X - tx) * TS) + M
  const py = Math.floor((Y - ty) * TS) + M
  const i = py * N + px
  const code = f.codes[i]
  const sm = smoothCodes(f)

  // Området: sammanhängande pixlar med samma (utjämnade) klass
  const target = sm[i]
  const mask = new Uint8Array(N * N)
  const stack = [i]
  mask[i] = 1
  let count = 0
  let x0 = px, x1 = px, y0 = py, y1 = py
  while (stack.length) {
    const j = stack.pop()!
    count++
    const jx = j % N, jy = (j / N) | 0
    if (jx < x0) x0 = jx
    if (jx > x1) x1 = jx
    if (jy < y0) y0 = jy
    if (jy > y1) y1 = jy
    for (const k of [jx > 0 ? j - 1 : -1, jx < N - 1 ? j + 1 : -1, jy > 0 ? j - N : -1, jy < N - 1 ? j + N : -1])
      if (k >= 0 && !mask[k] && sm[k] === target) {
        mask[k] = 1
        stack.push(k)
      }
  }
  const standHa = (count * f.gm * f.gm) / 10000
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const crop = new Uint8Array(w * h)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) crop[yy * w + xx] = mask[(y0 + yy) * N + x0 + xx]

  // Arter: punktvärde med faktorer + snitt över området
  const standIdx: number[] = []
  const step = Math.max(1, Math.floor(count / 1500))
  for (let j = 0, k = 0; j < N * N; j++) if (mask[j] && k++ % step === 0) standIdx.push(j)

  const species: SpeciesResult[] = SPECIES_MODELS.map((sp) => {
    const r = rpx(f, 60)
    let ctxSum = 0, ctxN = 0
    for (let yy = Math.max(0, py - r); yy <= Math.min(N - 1, py + r); yy++)
      for (let xx = Math.max(0, px - r); xx <= Math.min(N - 1, px + r); xx++) {
        const p = parts(sp, f, yy * N + xx)
        ctxSum += p ? product(p) : 0
        ctxN++
      }
    const t = temporal(sp, opts, f.lat)
    const L = learningGrid(sp, f, opts)
    const p = parts(sp, f, i)
    const cont = continuityFactor(sp, ctxSum / ctxN)
    const learning = L ? L[i] : 1
    const factors: FactorBreakdown = {
      habitat: p?.habitat ?? 0,
      soil: p?.soil ?? 0,
      terrain: p?.terrain ?? 1,
      edges: p?.edges ?? 1,
      age: p?.age ?? 1,
      path: p?.path ?? 1,
      continuity: cont,
      season: t.season,
      weather: t.weather,
      range: t.range,
      learning,
    }
    const chance = p ? Math.min(1, product(p) * cont * t.season * t.weather * t.range * learning) : 0
    let sum = 0
    for (const j of standIdx) {
      const q = parts(sp, f, j)
      sum += q ? product(q) : 0
    }
    const meanBase = standIdx.length ? sum / standIdx.length : 0
    const standChance = Math.min(1, meanBase * continuityFactor(sp, meanBase) * t.season * t.weather * t.range * learning)
    return { id: sp.id, chance, standChance, factors }
  }).sort((a, b) => b.standChance - a.standChance)

  const distIn = (grid: Uint8Array, v: number) => {
    let bestD = Infinity
    for (let j = 0; j < N * N; j++)
      if (grid[j] === v) {
        const d = (j % N - px) ** 2 + (((j / N) | 0) - py) ** 2
        if (d < bestD) bestD = d
      }
    return Number.isFinite(bestD) ? Math.sqrt(bestD) * f.gm : null
  }
  const dist = (pred: (c: number) => boolean) => {
    let bestD = Infinity
    for (let j = 0; j < N * N; j++)
      if (pred(f.codes[j])) {
        const d = (j % N - px) ** 2 + (((j / N) | 0) - py) ** 2
        if (d < bestD) bestD = d
      }
    return Number.isFinite(bestD) ? Math.sqrt(bestD) * f.gm : null
  }

  const s = f.soil![i]
  let aspect: string | null = null
  if (f.elev && f.slope && f.slope[i] > 2) {
    const gx = f.elev[i + 1] - f.elev[i - 1]
    const gy = f.elev[i + N] - f.elev[i - N]
    // riktning nedför: (−gx, −gy) där y växer söderut
    const deg = (Math.atan2(-gx, gy) * 180) / Math.PI // 0 = norr
    aspect = ASPECTS[Math.round(((deg + 360) % 360) / 45) % 8]
  }

  return {
    code,
    label: CODE_INFO[code]?.label ?? 'Okänd mark',
    soilGroup: f.soilGroup![i],
    soilName: s ? SOIL_DETAIL[s].name : SOIL_NAMES[0],
    elevation: f.elev ? Math.round(f.elev[i]) : null,
    tpi: f.tpiM ? Math.round(f.tpiM[i] * 10) / 10 : null,
    slope: f.slope ? Math.round(f.slope[i] * 10) / 10 : null,
    aspect,
    roadDistance: dist((c) => c === 53),
    waterDistance: dist((c) => c === 61 || c === 62),
    forestAge: f.age && f.age[i] ? f.age[i] : null,
    pathDistance: f.paths ? distIn(f.paths, 1) : null,
    trackDistance: f.paths ? distIn(f.paths, 2) : null,
    standHa,
    stand: {
      mask: crop,
      w,
      h,
      west: xToLng(f.box.minx + x0 * f.box.mpp),
      east: xToLng(f.box.minx + (x1 + 1) * f.box.mpp),
      north: yToLat(f.box.maxy - y0 * f.box.mpp),
      south: yToLat(f.box.maxy - (y1 + 1) * f.box.mpp),
    },
    species,
  }
}

/** Skogstyp och jordart vid en fyndplats – två små bilder i stället för en hel ruta. */
/** Träningsläge: inga hela rutor med ålder/stigar – ålder läses bara i punkten. */
let TRAINING = false

/** Alla modellens egenskaper i en punkt (zoom 14) – används av träningsskriptet. */
async function pointFeatures(lat: number, lng: number): Promise<PixelFeatures | null> {
  const z = INSPECT_Z
  const n = 2 ** z
  const X = ((lng + 180) / 360) * n
  const Y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const f = await features(z, Math.floor(X), Math.floor(Y))
  const i = (Math.floor((Y % 1) * TS) + M) * N + Math.floor((X % 1) * TS) + M
  const fv = pixelFeatures(f, i, {} as PixelFeatures)
  if (TRAINING) fv.age = await pointAge(fv.tree, lat, lng)
  return fv
}

async function pointAge(tree: number, lat: number, lng: number) {
  const t = TREE_KEYS[tree]
  const [pa, sa] = await Promise.all([
    t === 'tall' || t === 'barrbland' || t === 'lovbarr' ? ageAt('tall', lat, lng).catch(() => 0) : 0,
    t === 'gran' || t === 'barrbland' || t === 'lovbarr' ? ageAt('gran', lat, lng).catch(() => 0) : 0,
  ])
  return t === 'tall' ? pa : t === 'gran' ? sa : pa && sa ? Math.round((pa + sa) / 2) : pa || sa
}

/**
 * Egenskaper i ett rutnät (5 × 5 punkter, ~16 m mellan) runt en fyndplats.
 * Fyndkoordinater kan vara fel med tiotals meter, så träningen ser på
 * omgivningen – precis som kartan, som också jämnar ut.
 */
async function windowFeatures(lat: number, lng: number): Promise<PixelFeatures[]> {
  const z = INSPECT_Z
  const n = 2 ** z
  const X = ((lng + 180) / 360) * n
  const Y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const f = await features(z, Math.floor(X), Math.floor(Y))
  const cx = Math.floor((X % 1) * TS) + M
  const cy = Math.floor((Y % 1) * TS) + M
  const out: PixelFeatures[] = []
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const gx = clamp(cx + dx * 3, 0, N - 1), gy = clamp(cy + dy * 3, 0, N - 1)
      const fv = pixelFeatures(f, gy * N + gx, {} as PixelFeatures)
      if (TRAINING) fv.age = await pointAge(fv.tree, yToLat(f.box.maxy - (gy + 0.5) * f.box.mpp), xToLng(f.box.minx + (gx + 0.5) * f.box.mpp))
      out.push(fv)
    }
  return out
}

async function signature(lat: number, lng: number) {
  const mx = lngToX(lng), my = latToY(lat)
  const half = 60 / Math.cos((lat * Math.PI) / 180) // ±60 m på marken
  const S = 16
  const b = { minx: mx - half, maxx: mx + half, miny: my - half, maxy: my + half, mpp: (2 * half) / S }
  const [nmd, soil] = await Promise.all([
    fetchPixels(wms(NMD_WMS, NMD_LAYER, b, S), S, S),
    fetchPixels(wms(SGU_WMS, SGU_LAYER, b, S, '&format_options=antialias:none'), S, S).catch(() => null),
  ])
  const trees = new Map<TreeKey, number>()
  const soils = new Map<number, number>()
  for (let j = 0; j < S * S * 4; j += 4) {
    const rgb = (nmd[j] << 16) | (nmd[j + 1] << 8) | nmd[j + 2]
    const t = nmd[j + 3] > 127 ? CODE_INFO[COLOR_TO_CODE.get(rgb) ?? 0]?.tree : undefined
    if (t) trees.set(t, (trees.get(t) ?? 0) + 1)
    if (soil && soil[j + 3] > 127) {
      const k = SOIL_COLOR_TO_INDEX.get((soil[j] << 16) | (soil[j + 1] << 8) | soil[j + 2])
      if (k) soils.set(SOIL_DETAIL[k].group, (soils.get(SOIL_DETAIL[k].group) ?? 0) + 1)
    }
  }
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { tree: top(trees), soil: top(soils) ?? 0 }
}

/* ------------------------------------------------------------------ */

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  const reply = (r: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(r, transfer)
  try {
    if (req.type === 'forest') {
      const f = await base(req.z, req.x, req.y)
      const sm = smoothCodes(f)
      const codes = new Uint8Array(TS * TS)
      for (let y = 0; y < TS; y++) codes.set(sm.subarray((y + M) * N + M, (y + M) * N + M + TS), y * TS)
      reply({ id: req.id, ok: true, result: codes }, [codes.buffer])
    } else if (req.type === 'chance') {
      const r = await chanceTile(req.z, req.x, req.y, req.opts, !!req.quick)
      reply({ id: req.id, ok: true, result: r }, [r.rgba.buffer])
    } else if (req.type === 'inspect') {
      reply({ id: req.id, ok: true, result: await inspect(req.lat, req.lng, req.opts) })
    } else if (req.type === 'config') {
      TRAINING = req.training
      reply({ id: req.id, ok: true, result: null })
    } else if (req.type === 'features') {
      reply({ id: req.id, ok: true, result: req.window ? await windowFeatures(req.lat, req.lng) : await pointFeatures(req.lat, req.lng) })
    } else if (req.type === 'signature') {
      reply({ id: req.id, ok: true, result: await signature(req.lat, req.lng) })
    }
  } catch (err) {
    reply({ id: req.id, ok: false, error: (err as Error).message })
  }
}

