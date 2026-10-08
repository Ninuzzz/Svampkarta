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
 * Fyndkällor: GBIF (bl.a. Artportalen, koordinatosäkerhet ≤ 50 m) och, för
 * svamparna, fynd från svampkarta.se (märkta med src). Modellen tränas både
 * med och utan svampkarta-fynden; de används bara om de förbättrar resultatet
 * på GBIF-testfynden.
 *
 * Kontroll: 5-faldig geografisk korsvalidering. Sverige delas i rutor
 * (~55 × 30 km) som fördelas på 5 grupper. Modellen tränas fem gånger, varje
 * gång utan en grupp, och mäts bara på den utelämnade gruppen – alltså på
 * platser den aldrig sett. Tränade vikter används bara om de i snitt slår
 * expertvikterna och inte blir sämre i något av måtten.
 *
 * Bären: fynden (Artportalen) ligger mest i södra Sverige och nära bebyggelse,
 * medan markpunkterna är slumpade över hela landet. Utan korrigering lär sig
 * modellen "södra kusten" i stället för var bären växer (t.ex. att morän är
 * dåligt). För bär viktas därför markpunkterna så att de fördelar sig över
 * regionerna (breddgrad × väst/öst) som fynden gör – fynden jämförs med mark
 * i samma trakt. Till bären används också extra markpunkter nära fynden
 * (add-local-random.mjs), så att jämförelsen i varje trakt vilar på fler punkter.
 *
 *   ONLY=blabar,lingon node scripts/train/fit.ts → tränar bara de arterna,
 *   övriga behåller sina nuvarande vikter i trained.ts. Med OLD=1 mäts även
 *   de nuvarande vikterna på samma testgrupper (de är tränade på alla fynd,
 *   så jämförelsen gynnar dem något).
 *
 * Resultatet skrivs till src/analysis/trained.ts.
 */
import fs from 'node:fs'
import { EXPERT_MODELS, type SoilKey, type SpeciesModel, type TreeKey } from '../../src/analysis/species.ts'
import { lut, score, type Parts, type PixelFeatures } from '../../src/analysis/model.ts'
import { TRAINED as CURRENT } from '../../src/analysis/trained.ts'

const occ = JSON.parse(fs.readFileSync(new URL('./data/occurrences.json', import.meta.url), 'utf8'))
const FEATS = process.argv[2] ?? new URL('./data/features-window.json', import.meta.url)
const feats: Record<string, PixelFeatures | (PixelFeatures | null)[] | null> = JSON.parse(fs.readFileSync(FEATS, 'utf8'))

const FOLDS = 5

/** fv = alla prover i fönstret runt punkten (eller bara punkten) */
type Pt = { lat: number; lng: number; fv: PixelFeatures[]; fold: number; src?: string }

// Geografisk uppdelning: hela rutor (~55 × 30 km) hamnar i samma grupp
const foldOf = (lat: number, lng: number) => {
  const key = `${Math.floor(lat * 2)}:${Math.floor(lng * 2)}`
  let h = 2166136261
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) % FOLDS
}

function points(prefix: string, list: { lat: number; lng: number; src?: string }[]): Pt[] {
  const out: Pt[] = []
  list.forEach((p, i) => {
    const v = feats[`${prefix}:${i}`]
    const fv = (Array.isArray(v) ? v : [v]).filter((x): x is PixelFeatures => !!x)
    if (fv.length) out.push({ lat: p.lat, lng: p.lng, fv, fold: foldOf(p.lat, p.lng), src: p.src })
  })
  return out
}

/** Slumpade punkter på svensk mark (jordartskartan finns bara på land i Sverige). */
const onLand = (p: Pt) => p.fv[Math.floor(p.fv.length / 2)].soil > 0
const land = points('rnd', occ.random?.points ?? []).filter(onLand)
/** Extra markpunkter nära bärfynden (add-local-random.mjs), används bara för bär. */
const landLocal = points('rnd-lokal', occ.randomLocal?.points ?? []).filter(onLand)
console.log(`${land.length} slumpade punkter på svensk mark, ${landLocal.length} till nära bärfynden`)
const landBerries = [...land, ...landLocal]

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

/** Viktad AUC: varje negativ punkt räknas med sin vikt (lika poäng = halv). */
function aucW(pos: number[], neg: number[], w: number[]) {
  const all = [...pos.map((v) => [v, 1, 0] as const), ...neg.map((v, i) => [v, 0, w[i]] as const)].sort((a, b) => a[0] - b[0])
  let below = 0, total = 0, sum = 0
  for (let i = 0; i < all.length; ) {
    let j = i, tieW = 0, tieP = 0
    while (j < all.length && all[j][0] === all[i][0]) {
      if (all[j][1]) tieP++
      else tieW += all[j][2]
      j++
    }
    sum += tieP * (below + tieW / 2)
    below += tieW
    i = j
  }
  total = below
  return total && pos.length ? sum / (pos.length * total) : 0.5
}

/** Viktad variant av hit20: gränsen är den viktade 80:e percentilen av markpunkterna. */
function hit20W(pos: number[], neg: number[], w: number[]) {
  const order = neg.map((v, i) => [v, w[i]] as const).sort((a, b) => a[0] - b[0])
  const total = w.reduce((a, b) => a + b, 0)
  let acc = 0, cut = order[order.length - 1][0]
  for (const [v, wi] of order) {
    acc += wi
    if (acc >= 0.8 * total) {
      cut = v
      break
    }
  }
  // lika poäng vid gränsen delas proportionellt, som i hit20
  const above = order.filter(([v]) => v > cut).reduce((a, [, wi]) => a + wi, 0) / total
  const at = order.filter(([v]) => v === cut).reduce((a, [, wi]) => a + wi, 0) / total
  const share = at ? Math.max(0, Math.min(1, (0.2 - above) / at)) : 0
  return (pos.filter((v) => v > cut).length + share * pos.filter((v) => v === cut).length) / pos.length
}

/** Region för biaskorrigeringen: hel breddgrad × väst/öst om 15° O. */
const regionOf = (p: { lat: number; lng: number }) => `${Math.floor(p.lat)}:${p.lng < 15 ? 'v' : 'o'}`

/**
 * Vikter för markpunkterna så att de fördelar sig över regionerna som fynden.
 * Regioner utan fynd får vikt 0; vikten begränsas till 10 så att några få
 * markpunkter inte styr allt.
 */
function regionWeights(pres: Pt[], land: Pt[]) {
  const pc = new Map<string, number>(), lc = new Map<string, number>()
  for (const p of pres) pc.set(regionOf(p), (pc.get(regionOf(p)) ?? 0) + 1)
  for (const l of land) lc.set(regionOf(l), (lc.get(regionOf(l)) ?? 0) + 1)
  return land.map((l) => {
    const r = regionOf(l)
    return Math.min(10, (pc.get(r) ?? 0) / pres.length / ((lc.get(r) ?? 1) / land.length))
  })
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
function fit(expert: SpeciesModel, p: Pt[], b: Pt[], l: Pt[], lw?: number[]) {
  const params = paramsFor(expert)
  const objective = (s: SpeciesModel) => {
    let pen = 0
    for (const q of params) pen += q.penalty(q.get(s), q.get(expert))
    const sp = scores(s, p)
    const la = lw ? aucW(sp, scores(s, l), lw) : auc(sp, scores(s, l))
    return (auc(sp, scores(s, b)) + la) / 2 - LAMBDA * pen
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
const pct = (v: number) => `${Math.round(v * 100)} %`
const report: Record<string, unknown> = {}
const out: Record<string, unknown> = {}
const fold = (k: number, inTest: boolean) => (x: Pt) => (x.fold === k) === inTest
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null

for (const expert of EXPERT_MODELS) {
  if (ONLY && !ONLY.has(expert.id)) {
    if (CURRENT[expert.id]) out[expert.id] = CURRENT[expert.id]
    continue
  }
  const info = occ.species[expert.id]
  if (!info) continue
  // bär: markpunkterna viktas efter var fynden finns (se överst)
  const regional = expert.kind === 'bar'
  const landSp = regional ? landBerries : land
  const weightsFor = (p: Pt[], l: Pt[]) => (regional ? regionWeights(p, l) : undefined)
  const pres = points(expert.id, info.points)
  const bg = points(`bg-${expert.kind}`, occ.background[expert.kind].points)
  // Testet görs alltid på GBIF-fynd (känd precision ≤ 50 m), så att varianterna mäts på samma sak
  const presG = pres.filter((x) => !x.src)
  const bgG = bg.filter((x) => !x.src)
  const extra = pres.length - presG.length
  if (presG.length < 60) {
    console.log(`${expert.id}: för få fynd (${presG.length}) – behåller expertvikter`)
    continue
  }

  // Varianter: G = tränad på GBIF, A = tränad på alla fynd (GBIF + svampkarta.se)
  type Metrics = { auc: number[]; land: number[]; hit: number[] }
  const blank = (): Metrics => ({ auc: [], land: [], hit: [] })
  const m = { E: blank(), G: blank(), A: blank(), F: blank(), O: blank() }
  const cur = CURRENT[expert.id]?.params
  const old = process.env.OLD && cur ? ({ ...expert, ...cur } as SpeciesModel) : null
  // svampkarta-fynd i testområdena: mäter om de stämmer med modellen (bara som information)
  const extraLand = { E: [] as number[], G: [] as number[], A: [] as number[] }
  const betterThanE = { G: 0, A: 0 }
  let aBeatsG = 0
  for (let k = 0; k < FOLDS; k++) {
    const te = { p: presG.filter(fold(k, true)), b: bgG.filter(fold(k, true)), l: landSp.filter(fold(k, true)) }
    if (te.p.length < 8 || te.b.length < 20 || te.l.length < 20) continue
    const trL = landSp.filter(fold(k, false))
    const trP = presG.filter(fold(k, false))
    const teW = weightsFor(te.p, te.l)
    const models = {
      E: expert,
      G: fit(expert, trP, bgG.filter(fold(k, false)), trL, weightsFor(trP, trL)),
      A: extra ? fit(expert, pres.filter(fold(k, false)), bg.filter(fold(k, false)), trL, weightsFor(pres.filter(fold(k, false)), trL)) : null,
    }
    const sum: Record<string, number> = {}
    for (const v of ['E', 'G', 'A'] as const) {
      const sp = models[v]
      if (!sp) continue
      const p = scores(sp, te.p), l = scores(sp, te.l)
      const a = auc(p, scores(sp, te.b)), la = teW ? aucW(p, l, teW) : auc(p, l)
      m[v].auc.push(a)
      m[v].land.push(la)
      m[v].hit.push(teW ? hit20W(p, l, teW) : hit20(p, l))
      sum[v] = a + la
      const ex = pres.filter((x) => x.src && x.fold === k)
      if (ex.length >= 8) extraLand[v].push(auc(scores(sp, ex), l))
    }
    if (old) {
      const p = scores(old, te.p), l = scores(old, te.l)
      m.O.auc.push(auc(p, scores(old, te.b)))
      m.O.land.push(teW ? aucW(p, l, teW) : auc(p, l))
      m.O.hit.push(teW ? hit20W(p, l, teW) : hit20(p, l))
    }
    const fp = forestOnly(te.p), fl = forestOnly(te.l)
    m.F.land.push(teW ? aucW(fp, fl, teW) : auc(fp, fl))
    m.F.hit.push(teW ? hit20W(fp, fl, teW) : hit20(fp, fl))
    if (sum.G > sum.E) betterThanE.G++
    if (sum.A > sum.E) betterThanE.A++
    if (sum.A > sum.G) aBeatsG++
  }
  const folds = m.E.auc.length
  if (folds < 3) {
    console.log(`${expert.id}: för få testgrupper – behåller expertvikter`)
    continue
  }
  const avg = (x: Metrics) => ({ auc: mean(x.auc), land: mean(x.land), hit: mean(x.hit) })
  const E = avg(m.E), G = avg(m.G), A = m.A.auc.length ? avg(m.A) : null, F = { land: mean(m.F.land), hit: mean(m.F.hit) }

  // Svampkarta-fynden används bara om de gör modellen bättre på GBIF-testet, i de flesta grupper
  const useExtra = !!A && A.auc + A.land > G.auc + G.land + 0.005 && aBeatsG >= Math.ceil(folds * 0.6)
  const T = useExtra ? A! : G
  const better = useExtra ? betterThanE.A : betterThanE.G
  // Tränade vikter används bara om de slår expertvikterna i snitt, i de flesta grupper, och inte tappar mycket i något mått
  const used = T.auc + T.land > E.auc + E.land + 0.01 && better >= Math.ceil(folds * 0.6) && T.auc > E.auc - 0.02 && T.land > E.land - 0.01

  report[expert.id] = {
    gbif: presG.length,
    extra,
    'mark E / G / A': `${r3(E.land)} / ${r3(G.land)} / ${A ? r3(A.land) : '–'}`,
    'bgfynd E / G / A': `${r3(E.auc)} / ${r3(G.auc)} / ${A ? r3(A.auc) : '–'}`,
    'topp20 E / G / A': `${pct(E.hit)} / ${pct(G.hit)} / ${A ? pct(A.hit) : '–'}`,
    'A>G': extra ? `${aBeatsG}/${folds}` : '–',
    'sk-fynd mark E/G/A': extraLand.E.length ? `${r3(mean(extraLand.E))} / ${r3(mean(extraLand.G))} / ${r3(mean(extraLand.A))}` : '–',
    'bara skog': `${r3(F.land)} / ${pct(F.hit)}`,
    ...(m.O.auc.length ? { 'nuvarande mark/bg/topp20': `${r3(mean(m.O.land))} / ${r3(mean(m.O.auc))} / ${pct(mean(m.O.hit))}` } : {}),
    val: used ? (useExtra ? 'A' : 'G') : 'E',
  }
  // Slutlig modell: tränad på alla fynd i den valda varianten
  const final = used ? (useExtra ? fit(expert, pres, bg, landSp, weightsFor(pres, landSp)) : fit(expert, presG, bgG, landSp, weightsFor(presG, landSp))) : null
  out[expert.id] = {
    used,
    n: useExtra ? pres.length : presG.length,
    extra: useExtra ? extra : 0,
    folds,
    better,
    aucExpert: r3(E.auc),
    aucTrained: r3(T.auc),
    landExpert: r3(E.land),
    landTrained: r3(T.land),
    landForest: r3(F.land),
    hitExpert: r3(E.hit),
    hitTrained: r3(T.hit),
    hitForest: r3(F.hit),
    params: final
      ? { tree: final.tree, wet: final.wet, soil: final.soil, tpi: final.tpi, south: final.south, openEdge: final.openEdge, wetEdge: final.wetEdge, continuity: final.continuity, age: final.age }
      : null,
  }
  console.log(`${expert.id} klar`)
}

console.table(report)

const file = `/**
 * Genererad av scripts/train/fit.ts – ändra inte för hand.
 * Vikter tränade på öppna fynd från GBIF (bl.a. Artportalen), ${occ.filter.includes('2016,2025') ? '2016–2025' : ''}, och för vissa arter även svampkarta.se (extra).
 * Testet görs alltid på GBIF-fynd.
 * Alla mått är medel över ${FOLDS}-faldig geografisk korsvalidering (mätt på platser modellen inte tränats på).
 * auc  = sannolikheten att en riktig fyndplats får högre poäng än ett annat svamp-/växtfynd (0,5 = slump, 1 = perfekt).
 * land = samma sak mot slumpade punkter på svensk mark (för bär viktade efter fyndens regioner).
 * hit  = andel fynd som hamnar i den bästa femtedelen av marken.
 * Forest = jämförelsemodellen "all skog är lika bra".
 */
import type { SpeciesId, SpeciesModel } from './species.ts'

export interface TrainedInfo {
  used: boolean
  n: number
  /** varav fynd från svampkarta.se */
  extra: number
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
