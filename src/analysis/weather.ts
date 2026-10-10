import { useEffect, useState } from 'react'
import { SPECIES_MODELS, type SpeciesId, type SpeciesModel } from './species'

/**
 * Väder från Open-Meteo (gratis, ingen nyckel): nederbörd, temperatur och
 * markfuktighet de senaste tre veckorna plus prognos för tre dygn.
 */
export interface Day {
  date: string
  rain: number
  tmean: number
  tmin: number
  forecast: boolean
}

export interface Weather {
  lat: number
  lng: number
  days: Day[]
  /** nederbörd senaste 14 dygnen (mm) */
  rain14: number
  /** fördröjningsviktad nederbörd, mm-ekvivalent för 14 dygn */
  rainEff: number
  /** volymetrisk markfuktighet 3–9 cm, snitt senaste 3 dygnen (m³/m³) */
  soilMoisture: number | null
  /** medeltemperatur senaste 10 dygnen */
  t10: number
  /** lägsta temperatur senaste 3 dygnen */
  frost: number
  /** 0–1 för svamp generellt */
  index: number
  factors: Partial<Record<SpeciesId, number>>
  verdict: string
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function speciesWeather(sp: SpeciesModel, w: Pick<Weather, 'rainEff' | 'soilMoisture' | 't10' | 'frost'>) {
  // Fruktkroppar kommer ~1–2 veckor efter rejält regn: rain + markfukt
  const rainScore = 1 - Math.exp(-w.rainEff / 30)
  const smScore = w.soilMoisture == null ? rainScore : clamp((w.soilMoisture - 0.12) / 0.18, 0, 1)
  const moisture = 0.6 * Math.max(rainScore, smScore) + 0.4 * Math.min(rainScore, smScore)
  const temp = Math.exp(-((w.t10 - sp.tempOpt) ** 2) / (2 * 6 * 6))
  const frost = w.frost < -2 ? (sp.frostHardy ? 0.85 : 0.45) : w.frost < 0 ? (sp.frostHardy ? 1 : 0.8) : 1
  return clamp(1 - sp.rainSens + sp.rainSens * moisture * temp * frost, 0.08, 1)
}

function summarize(lat: number, lng: number, json: OpenMeteo): Weather {
  const d = json.daily
  const today = new Date().toISOString().slice(0, 10)
  const days: Day[] = d.time.map((date, i) => ({
    date,
    rain: d.precipitation_sum[i] ?? 0,
    tmean: d.temperature_2m_mean[i] ?? 0,
    tmin: d.temperature_2m_min[i] ?? 0,
    forecast: date > today,
  }))
  const t = days.findIndex((x) => x.date === today)
  const ti = t === -1 ? days.length - 4 : t
  const back = (k: number) => days[ti - k]

  let num = 0, den = 0
  for (let k = 1; k <= 18; k++) {
    const day = back(k)
    if (!day) continue
    const w = Math.max(0, 1 - Math.abs(k - 8) / 9)
    num += day.rain * w
    den += w
  }
  const rainEff = den ? (num / den) * 14 : 0
  let rain14 = 0
  for (let k = 0; k < 14; k++) rain14 += back(k)?.rain ?? 0
  const t10 = days.slice(Math.max(0, ti - 9), ti + 1).reduce((s, x) => s + x.tmean, 0) / Math.min(10, ti + 1)
  const frost = Math.min(...days.slice(Math.max(0, ti - 2), ti + 1).map((x) => x.tmin))

  let soilMoisture: number | null = null
  const sm = json.hourly?.soil_moisture_3_to_9cm
  if (sm?.length) {
    const nowIdx = json.hourly!.time.findIndex((x) => x.startsWith(today))
    const end = nowIdx === -1 ? sm.length : nowIdx + 12
    const vals = sm.slice(Math.max(0, end - 72), end).filter((v): v is number => v != null)
    if (vals.length) soilMoisture = vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const base = { rainEff, soilMoisture, t10, frost }
  const factors: Partial<Record<SpeciesId, number>> = {}
  for (const sp of SPECIES_MODELS) factors[sp.id] = speciesWeather(sp, base)
  // indexet beskriver standardurvalet "Alla svampar" – arter som bara visas när de väljs räknas inte in
  const mush = SPECIES_MODELS.filter((s) => s.kind === 'svamp' && !s.soloOnly).map((s) => factors[s.id]!)
  const index = Math.max(...mush)

  const verdict =
    frost < -2
      ? 'Frostnätter – de flesta svampar har tagit stryk, men trattkantareller tål kyla.'
      : index > 0.75
        ? 'Utmärkt svampväder – fuktig mark och lagom temperatur.'
        : index > 0.5
          ? 'Hyfsat svampväder – leta i fuktiga svackor och mossig skog.'
          : rainEff < 12
            ? 'Torrt – svamparna behöver regn. Satsa på fuktiga lägen eller bär.'
            : 'Svagt svampväder just nu.'

  return { lat, lng, days, rain14, rainEff, soilMoisture, t10, frost, index, factors, verdict }
}

interface OpenMeteo {
  daily: { time: string[]; precipitation_sum: number[]; temperature_2m_mean: number[]; temperature_2m_min: number[] }
  hourly?: { time: string[]; soil_moisture_3_to_9cm: (number | null)[] }
}

const memo = new Map<string, Promise<Weather>>()

/** Vädret hämtas på ett rutnät om 0,25° (~25 km) – det räcker för regn och temperatur. */
const snap = (v: number) => Math.round(v * 4) / 4

export function fetchWeather(lat: number, lng: number): Promise<Weather> {
  const la = snap(lat)
  const ln = snap(lng)
  const key = `${la},${ln}`
  let p = memo.get(key)
  if (!p) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}` +
      '&daily=precipitation_sum,temperature_2m_mean,temperature_2m_min&hourly=soil_moisture_3_to_9cm' +
      '&past_days=21&forecast_days=4&timezone=Europe%2FStockholm'
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Vädret kunde inte hämtas')
        return r.json()
      })
      .then((j: OpenMeteo) => summarize(la, ln, j))
    p.catch(() => memo.delete(key))
    memo.set(key, p)
  }
  return p
}

/** Vädret för en punkt. Utan punkt (null, inget område valt än) hämtas inget. */
export function useWeather(lat: number | null, lng: number | null) {
  const [w, setW] = useState<Weather | null>(null)
  const [error, setError] = useState(false)
  const la = lat == null ? null : snap(lat)
  const ln = lng == null ? null : snap(lng)
  useEffect(() => {
    if (la == null || ln == null) return setW(null)
    let alive = true
    setError(false)
    fetchWeather(la, ln)
      .then((x) => alive && setW(x))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [la, ln])
  return { weather: w, error }
}
