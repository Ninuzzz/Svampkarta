/**
 * Steg 3 av 3: tränar artmodellernas vikter på riktiga fynd.
 *
 *   node scripts/train/fit.ts
 *
 * Metod: närvaro–bakgrund, mätt på två sätt:
 *   1. mot bakgrundsfynd (andra svampar/växter – rapporteringsskevheten tar ut sig)
 *   2. mot slumpade punkter på svensk mark (det kartan faktiskt gör: peka ut
 *      var i landskapet man ska gå)
 * Varje punkt får medelpoängen i ett 5 × 5-fönster (±32 m), eftersom fyndens
 * koordinater har några tiotals meters osäkerhet. Målet är att maximera
 * medelvärdet av de två AUC-måtten.
 *
 * Vikterna justeras med koordinatsökning och dras mot expertvärdena
 * (regularisering) så att modellen inte överanpassas.
 *
 * Kontroll: 5-faldig geografisk korsvalidering. Sverige delas i rutor
 * (~55 × 30 km) som fördelas på 5 grupper. Modellen tränas fem gånger, varje
 * gång utan en grupp, och mäts bara på den utelämnade gruppen – alltså på
 * platser den aldrig sett. Tränade vikter används bara om de i snitt slår
 * expertvikterna och inte blir sämre i något av måtten.
 *
 * Resultatet skrivs till src/analysis/trained.ts.
 */
import fs from 'node:fs'
import { EXPERT_MODELS, type SoilKey, type SpeciesModel, type TreeKey } from '../../src/analysis/species.ts'
import { lut, score, type Parts, type PixelFeatures } from '../../src/analysis/model.ts'

const occ = JSON.parse(fs.readFileSync(new URL('./data/occurrences.json', import.meta.url), 'utf8'))
const FEATS = process.argv[2] ?? new URL('./data/features-window.json', import.meta.url)
const feats: Record<string, PixelFeatures | (PixelFeatures | null)[] | null> = JSON.parse(fs.readFileSync(FEATS, 'utf8'))

const FOLDS = 5

/** fv = alla prover i fönstret runt punkten (eller bara punkten) */
type Pt = { lat: number; lng: number; fv: PixelFeatures[]; fold: number }

// Geografisk uppdelning: hela rutor (~55 × 30 km) hamnar i samma grupp
const foldOf = (lat: number, lng: number) => {
  const key = `${Math.floor(lat * 2)}:${Math.floor(lng * 2)}`
  let h = 2166136261
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) % FOLDS
}

function points(prefix: string, list: { lat: number; lng: number }[]): Pt[] {
  const out: Pt[] = []
  list.forEach((p, i) => {
    const v = feats[`${prefix}:${i}`]
    const fv = (Array.isArray(v) ? v : [v]).filter((x): x is PixelFeatures => !!x)
    if (fv.length) out.push({ lat: p.lat, lng: p.lng, fv, fold: foldOf(p.lat, p.lng) })
  })
  return out
}

/** Slumpade punkter på svensk mark (jordartskartan finns bara på land i Sverige). */
const land = points('rnd', occ.random?.points ?? []).filter((p) => p.fv[Math.floor(p.fv.length / 2)].soil > 0)
console.log(`${land.length} slumpade punkter på svensk mark`)

/** AUC (Mann–Whitney) med delad rang vid lika poäng. */
function auc(pos: number[], neg: number[]) {
  const all = [...pos.map((v) => [v, 1] as const), ...neg.map((v) => [v, 0] as const)].sort((a, b) => a[0] - b[0])
  let rankSum = 0
  for (let i = 0; i < all.length; ) {
    let j = i
    while (j < all.length && all[j][0] === all[i][0]) j++
    const avg = (i + j + 1) / 2
    for (let k = i; k < j; k++) if (all[k][1]) rankSum += avg
    i = j
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length)
}

/** Andel fynd i den bästa femtedelen av marken (enligt markpunkternas poäng). */
function hit20(pos: number[], neg: number[]) {
  const sorted = [...neg].sort((a, b) => a - b)
  const cut = sorted[Math.floor(sorted.length * 0.8)]
  // lika poäng vid gränsen delas proportionellt (annars får grova modeller med många lika värden 0 %)
  const above = neg.filter((v) => v > cut).length / neg.length
  const at = neg.filter((v) => v === cut).length / neg.length
  const share = at ? Math.max(0, Math.min(1, (0.2 - above) / at)) : 0
  return (pos.filter((v) => v > cut).length + share * pos.filter((v) => v === cut).length) / pos.length
}

const scratch = {} as Parts
const scores = (sp: SpeciesModel, pts: Pt[]) => {
  const L = lut(sp)
  return pts.map((p) => {
    let s = 0
    for (const fv of p.fv) s += score(sp, L, fv, scratch)
    return s / p.fv.length
  })
}

/** Jämförelsemodell: "gå till närmaste skog" (andel skog i fönstret, alla skogstyper lika). */
const forestOnly = (pts: Pt[]) => pts.map((p) => p.fv.filter((f) => f.tree >= 1 && f.tree <= 7).length / p.fv.length)

/* ---------------- parametrar som får tränas ---------------- */

interface Param {
  name: string
  get: (s: SpeciesModel) => number
  set: (s: SpeciesModel, v: number) => SpeciesModel
  candidates: (v: number) => number[]
  penalty: (v: number, expert: number) => number
}

const mult = (lo: number, hi: number) => (v: number) => [0.6, 0.8, 0.9, 1.1, 1.25, 1.6].map((m) => Math.min(hi, Math.max(lo, v * m)))
const add = (lo: number, hi: number, step: number) => (v: number) => [-2, -1, 1, 2].map((k) => Math.round(Math.min(hi, Math.max(lo, v + k * step)) * 1000) / 1000)
const logPen = (v: number, e: number) => Math.log(Math.max(v, 0.01) / Math.max(e, 0.01)) ** 2
const linPen = (scale: number) => (v: number, e: number) => ((v - e) / scale) ** 2

function paramsFor(sp: SpeciesModel): Param[] {
  const ps: Param[] = []
  for (const k of Object.keys(sp.tree) as TreeKey[]) {
    if (!sp.tree[k]) continue
    ps.push({ name: `tree.${k}`, get: (s) => s.tree[k] ?? 0, set: (s, v) => ({ ...s, tree: { ...s.tree, [k]: v } }), candidates: mult(0.02, 1), penalty: logPen })
  }
  for (const k of ['dry', 'wet'] as const) {
    if (!sp.wet[k]) continue
    ps.push({ name: `wet.${k}`, get: (s) => s.wet[k], set: (s, v) => ({ ...s, wet: { ...s.wet, [k]: v } }), candidates: mult(0.05, 1), penalty: logPen })
  }
  for (const k of Object.keys(sp.soil) as SoilKey[])
    ps.push({ name: `soil.${k}`, get: (s) => s.soil[k], set: (s, v) => ({ ...s, soil: { ...s.soil, [k]: v } }), candidates: mult(0.1, 1), penalty: logPen })
  ps.push({ name: 'tpi', get: (s) => s.tpi, set: (s, v) => ({ ...s, tpi: v }), candidates: add(-0.35, 0.35, 0.05), penalty: linPen(0.2) })
  ps.push({ name: 'south', get: (s) => s.south, set: (s, v) => ({ ...s, south: v }), candidates: add(-0.3, 0.3, 0.05), penalty: linPen(0.2) })
  ps.push({ name: 'openEdge', get: (s) => s.openEdge, set: (s, v) => ({ ...s, openEdge: v }), candidates: add(0, 0.5, 0.05), penalty: linPen(0.2) })
  ps.push({ name: 'wetEdge', get: (s) => s.wetEdge, set: (s, v) => ({ ...s, wetEdge: v }), candidates: add(0, 0.5, 0.05), penalty: linPen(0.2) })
  ps.push({ name: 'continuity', get: (s) => s.continuity, set: (s, v) => ({ ...s, continuity: v }), candidates: add(0, 0.6, 0.1), penalty: linPen(0.3) })
  if (sp.age) {
    ps.push({
      name: 'age.optStart',
      get: (s) => s.age![1],
      set: (s, v) => ({ ...s, age: [s.age![0], Math.max(s.age![0] + 1, Math.min(s.age![2] - 1, Math.round(v))), s.age![2], s.age![3], s.age![4]] }),
      candidates: mult(1, 200),
      penalty: logPen,
    })
    ps.push({
      name: 'age.old',
      get: (s) => s.age![4],
      set: (s, v) => ({ ...s, age: [s.age![0], s.age![1], s.age![2], s.age![3], v] }),
      candidates: add(0.3, 1, 0.1),
      penalty: linPen(0.3),
    })
  }
  return ps
}

/** Normalisera så att bästa trädslag och jordart har vikt 1 (påverkar inte rangordningen). */
function normalize(s: SpeciesModel): SpeciesModel {
  const tmax = Math.max(...Object.values(s.tree).map((v) => v ?? 0))
  const smax = Math.max(...Object.values(s.soil))
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return {
    ...s,
    tree: Object.fromEntries(Object.entries(s.tree).map(([k, v]) => [k, r3((v ?? 0) / tmax)])),
    soil: Object.fromEntries(Object.entries(s.soil).map(([k, v]) => [k, r3(v / smax)])) as SpeciesModel['soil'],
    wet: { dry: r3(s.wet.dry), wet: r3(s.wet.wet) },
  }
}

const LAMBDA = 0.004

/** Koordinatsökning: förbättra medel-AUC (bakgrundsfynd + mark) på träningspunkterna. */
function fit(expert: SpeciesModel, p: Pt[], b: Pt[], l: Pt[]) {
  const params = paramsFor(expert)
  const objective = (s: SpeciesModel) => {
    let pen = 0
    for (const q of params) pen += q.penalty(q.get(s), q.get(expert))
    const sp = scores(s, p)
    return (auc(sp, scores(s, b)) + auc(sp, scores(s, l))) / 2 - LAMBDA * pen
  }
  let cur = expert
  let best = objective(cur)
  for (let pass = 0; pass < 5; pass++) {
    let improved = false
    for (const q of params) {
      for (const v of q.candidates(q.get(cur))) {
        const cand = q.set(cur, v)
        const o = objective(cand)
        if (o > best + 1e-6) {
          best = o
          cur = cand
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return normalize(cur)
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const r3 = (v: number) => Math.round(v * 1000) / 1000
const report: Record<string, unknown> = {}
const out: Record<string, unknown> = {}

for (const expert of EXPERT_MODELS) {
  const info = occ.species[expert.id]
  if (!info) continue
  const pres = points(expert.id, info.points)
  const bg = points(`bg-${expert.kind}`, occ.background[expert.kind].points)
  if (pres.length < 60) {
    console.log(`${expert.id}: för få fynd (${pres.length}) – behåller expertvikter`)
    continue
  }

  // Korsvalidering: mät på varje utelämnad grupp
  const m = { aucE: [] as number[], aucT: [] as number[], landE: [] as number[], landT: [] as number[], hitE: [] as number[], hitT: [] as number[], hitF: [] as number[], landF: [] as number[] }
  let better = 0
  for (let k = 0; k < FOLDS; k++) {
    const te = { p: pres.filter((x) => x.fold === k), b: bg.filter((x) => x.fold === k), l: land.filter((x) => x.fold === k) }
    if (te.p.length < 8 || te.b.length < 20 || te.l.length < 20) continue
    const trained = fit(
      expert,
      pres.filter((x) => x.fold !== k),
      bg.filter((x) => x.fold !== k),
      land.filter((x) => x.fold !== k),
    )
    const ep = scores(expert, te.p), tp = scores(trained, te.p)
    const el = scores(expert, te.l), tl = scores(trained, te.l)
    const a = { aucE: auc(ep, scores(expert, te.b)), aucT: auc(tp, scores(trained, te.b)), landE: auc(ep, el), landT: auc(tp, tl) }
    m.aucE.push(a.aucE)
    m.aucT.push(a.aucT)
    m.landE.push(a.landE)
    m.landT.push(a.landT)
    m.hitE.push(hit20(ep, el))
    m.hitT.push(hit20(tp, tl))
    const fp = forestOnly(te.p), fl = forestOnly(te.l)
    m.landF.push(auc(fp, fl))
    m.hitF.push(hit20(fp, fl))
    if (a.aucT + a.landT > a.aucE + a.landE) better++
  }
  if (m.aucE.length < 3) {
    console.log(`${expert.id}: för få testgrupper – behåller expertvikter`)
    continue
  }

  const s = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, mean(v)])) as Record<keyof typeof m, number>
  const folds = m.aucE.length
  // används bara om de slår expertvikterna i snitt, i de flesta grupper, och inte tappar mycket i något mått
  const used =
    s.aucT + s.landT > s.aucE + s.landE + 0.01 && better >= Math.ceil(folds * 0.6) && s.aucT > s.aucE - 0.02 && s.landT > s.landE - 0.01

  report[expert.id] = {
    fynd: pres.length,
    'bgfynd E→T': `${r3(s.aucE)} → ${r3(s.aucT)}`,
    'mark E→T': `${r3(s.landE)} → ${r3(s.landT)}`,
    'topp20 E→T': `${Math.round(s.hitE * 100)} → ${Math.round(s.hitT * 100)} %`,
    'bara skog': `${r3(s.landF)} / ${Math.round(s.hitF * 100)} %`,
    bättre: `${better}/${folds}`,
    used,
  }
  // Slutlig modell: tränad på alla fynd
  const final = used ? fit(expert, pres, bg, land) : null
  out[expert.id] = {
    used,
    n: pres.length,
    folds,
    better,
    aucExpert: r3(s.aucE),
    aucTrained: r3(s.aucT),
    landExpert: r3(s.landE),
    landTrained: r3(s.landT),
    landForest: r3(s.landF),
    hitExpert: r3(s.hitE),
    hitTrained: r3(s.hitT),
    hitForest: r3(s.hitF),
    params: final
      ? { tree: final.tree, wet: final.wet, soil: final.soil, tpi: final.tpi, south: final.south, openEdge: final.openEdge, wetEdge: final.wetEdge, continuity: final.continuity, age: final.age }
      : null,
  }
  console.log(`${expert.id} klar`)
}

console.table(report)

const file = `/**
 * Genererad av scripts/train/fit.ts – ändra inte för hand.
 * Vikter tränade på öppna fynd från GBIF (bl.a. Artportalen), ${occ.filter.includes('2016,2025') ? '2016–2025' : ''}.
 * Alla mått är medel över ${FOLDS}-faldig geografisk korsvalidering (mätt på platser modellen inte tränats på).
 * auc  = sannolikheten att en riktig fyndplats får högre poäng än ett annat svamp-/växtfynd (0,5 = slump, 1 = perfekt).
 * land = samma sak mot slumpade punkter på svensk mark.
 * hit  = andel fynd som hamnar i den bästa femtedelen av marken.
 * Forest = jämförelsemodellen "all skog är lika bra".
 */
import type { SpeciesId, SpeciesModel } from './species.ts'

export interface TrainedInfo {
  used: boolean
  n: number
  /** antal testgrupper och hur många av dem där tränade vikter var bättre */
  folds: number
  better: number
  aucExpert: number
  aucTrained: number
  landExpert: number
  landTrained: number
  landForest: number
  hitExpert: number
  hitTrained: number
  hitForest: number
  params: Partial<Pick<SpeciesModel, 'tree' | 'wet' | 'soil' | 'tpi' | 'south' | 'openEdge' | 'wetEdge' | 'continuity' | 'age'>> | null
}

export const TRAINING_DATE = '${new Date().toISOString().slice(0, 10)}'

export const TRAINED: Partial<Record<SpeciesId, TrainedInfo>> = ${JSON.stringify(out, null, 2)}
`
fs.writeFileSync(new URL('../../src/analysis/trained.ts', import.meta.url), file)
console.log('Skrev src/analysis/trained.ts')
