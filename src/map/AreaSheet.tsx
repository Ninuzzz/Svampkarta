import { useEffect, useState } from 'react'
import { BookmarkSimple, CaretDown, Check, Info, NavigationArrow, Prohibit, SpinnerGap, X } from '@phosphor-icons/react'
import type { FactorBreakdown, InspectResult } from '../analysis/protocol'
import { SPECIES_BY_ID, targetSpecies, type SpeciesId, type Target } from '../analysis/species'
import type { Weather } from '../analysis/weather'
import { CODE_INFO } from '../analysis/nmdcodes'
import { CLASSES, colorFor } from './nmd'
import { SpeciesIcon } from '../components/SpeciesIcon'
import { WeatherChart } from './WeatherChart'
import { formatCoord } from '../lib/geo'
import { href } from '../lib/router'
import { useToast } from '../components/Toast'
import type { Feedback } from '../lib/types'

export interface AreaSelection {
  lat: number
  lng: number
  result: InspectResult | null
  error?: string
}

const FACTOR_LABELS: [keyof FactorBreakdown, string, string][] = [
  ['habitat', 'Skogstyp', 'Hur väl trädslag och fastmark/våtmark passar arten'],
  ['soil', 'Jordart', 'Sand, morän, lera, torv eller berg enligt SGU'],
  ['terrain', 'Terräng', 'Svacka eller krön, och sol- eller skuggläge'],
  ['edges', 'Omgivning', 'Kanter mot hyggen, närhet till våtmark och ädellöv, hur skogsrikt det är runt omkring och avstånd till bebyggelse'],
  ['continuity', 'Sammanhang', 'Hur stor och sammanhängande den lämpliga skogen är'],
  ['age', 'Skogsålder', 'Hur väl skogens ålder (SLU skogsålder 2025) passar arten'],
  ['path', 'Stig', 'Närhet till stig eller skogsbilväg (OpenStreetMap)'],
  ['season', 'Säsong', 'Var i säsongen arten är just nu på den här breddgraden'],
  ['weather', 'Väder', 'Regn, markfukt, temperatur och frost senaste veckorna'],
  ['learning', 'Dina fynd', 'Dina sparade fynd och markeringar: "Hittade" höjer, "Hittade inget" sänker'],
]

const MULT = new Set<keyof FactorBreakdown>(['terrain', 'edges', 'path', 'learning'])
/** Rader som bara visas när de faktiskt påverkar */
const OPTIONAL = new Set<keyof FactorBreakdown>(['path', 'learning', 'age'])

/** Storlek i hektar: en decimal under 1 ha, annars heltal. */
const ha = (v: number) => `${v < 1 ? v.toFixed(1) : Math.round(v)} ha`

function describe(r: InspectResult, chanceHa?: number | null) {
  const ci = CODE_INFO[r.code]
  const parts: string[] = []
  const name = r.label.replace(/ på (fastmark|våtmark)/, '')
  if (ci?.forest || ci?.mire) {
    const moist = ci.wet || r.soilGroup === 4 ? 'fuktig' : r.soilGroup === 1 || r.soilGroup === 5 ? 'torr' : 'frisk'
    parts.push(`${name} på ${moist} mark`)
  } else parts.push(name)
  if (r.soilGroup) parts[0] += ` – ${r.soilName.toLowerCase()}`
  if (r.tpi != null) {
    if (r.tpi < -1.5) parts.push('i en svacka där fukten samlas')
    else if (r.tpi > 1.5) parts.push('högt i terrängen där det är torrare')
  }
  let s = parts.join(' ') + '.'
  if (r.forestAge) s += ` Skogen är ungefär ${r.forestAge} år${r.forestAge >= 80 ? ' eller äldre' : ''}.`
  if (r.aspect && r.slope && r.slope > 4) s += ` Sluttar mot ${r.aspect}.`
  if (chanceHa) s += ` Det markerade chansområdet är ungefär ${ha(chanceHa)}.`
  else if (chanceHa === null) s += ' Platsen ligger utanför de markerade chansområdena.'
  else s += ` Området är ungefär ${ha(r.standHa)}.`
  return s
}

const pct = (v: number) => `${Math.round(v * 100)} %`

export function AreaSheet({
  sel,
  target,
  weather,
  place,
  onClose,
  onSave,
  feedbackNear,
  onFeedback,
  chanceHa,
}: {
  sel: AreaSelection
  /** chansfliken: det markerade områdets storlek, null utanför områdena (undefined = skogsfliken) */
  chanceHa?: number | null
  target: Target
  weather: Weather | null
  place: string | null
  onClose: () => void
  onSave: (suggested: { name: string; species: SpeciesId | null }) => void
  feedbackNear: Feedback[]
  onFeedback: (found: boolean, species: SpeciesId) => void
}) {
  const toast = useToast()
  const r = sel.result
  const [why, setWhy] = useState(true)
  const targetIds = targetSpecies(target).map((s) => s.id)
  const main = r?.species.filter((s) => targetIds.includes(s.id)).sort((a, b) => b.chance - a.chance)[0]
  const cls = r ? CLASSES.get(r.code) : null
  const dot = cls ? `rgb(${colorFor(cls).join(' ')})` : '#d8d2b8'
  useEffect(() => setWhy(true), [sel.lat, sel.lng])

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`

  return (
    <section aria-label="Valt område" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 px-5 pt-5">
        <span className="mt-1.5 size-4 shrink-0 rounded-full ring-2 ring-white" style={{ background: dot }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl leading-tight font-bold">{r ? r.label.replace(/ på fastmark/, '') : 'Analyserar området…'}</h2>
          <p className="truncate text-sm text-ink-muted">
            {[r && CODE_INFO[r.code]?.forest ? (CODE_INFO[r.code].wet ? 'Våtmark' : 'Fastmark') : null, place].filter(Boolean).join(' · ') ||
              formatCoord(sel.lat, sel.lng)}
          </p>
        </div>
        <button type="button" className="icon-btn -mt-1 -mr-2" aria-label="Stäng" onClick={onClose}>
          <X size={20} />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 px-5 pt-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave({ name: main ? `${SPECIES_BY_ID[main.id].name}ställe` : r?.label ?? 'Ny plats', species: main?.id ?? null })}
        >
          <BookmarkSimple size={18} weight="bold" /> Spara
        </button>
        <a href={directions} target="_blank" rel="noopener noreferrer" className="btn border border-forest-700/80 bg-white/60 text-forest-800 hover:bg-white">
          <NavigationArrow size={18} weight="bold" className="rotate-90" /> Hitta hit
        </a>
      </div>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pt-4 pb-6">
        {sel.error && <p className="rounded-2xl bg-lingon-soft/70 p-4 text-sm text-lingon">{sel.error}</p>}
        {!r && !sel.error && (
          <div className="grid place-items-center py-10 text-sage-600">
            <SpinnerGap size={28} className="animate-spin" />
            <p className="mt-2 text-sm text-ink-muted">Hämtar skog, jordart och terräng…</p>
          </div>
        )}

        {r && (
          <div className="grid gap-4">
            {/* Information */}
            <div className="card-plain">
              <h3 className="card-title">Information</h3>
              <ul className="flex flex-wrap gap-1.5">
                {[
                  chanceHa ? `${ha(chanceHa)} chansområde` : chanceHa === undefined ? ha(r.standHa) : null,
                  r.soilGroup ? r.soilName : null,
                  r.forestAge ? `≈ ${r.forestAge} år` : null,
                  r.elevation != null ? `${r.elevation} m ö.h.` : null,
                  r.tpi != null ? (r.tpi < -1.5 ? 'Svacka' : r.tpi > 1.5 ? 'Krön' : 'Plan mark') : null,
                  r.slope != null && r.slope > 3 ? `Lutning ${Math.round(r.slope)}°` : null,
                  r.pathDistance != null && r.pathDistance < 500 ? `Stig ${Math.round(r.pathDistance / 10) * 10} m` : null,
                  r.roadDistance != null ? `Väg ${r.roadDistance < 1000 ? `${Math.round(r.roadDistance / 10) * 10} m` : `${(r.roadDistance / 1000).toFixed(1)} km`}` : null,
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <li key={t} className="chip-info">
                      {t}
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-forest-900">{describe(r, chanceHa)}</p>
            </div>

            {/* Chans för valt mål */}
            {main && (
              <div className="card-plain">
                <div className="flex items-center gap-3">
                  <SpeciesIcon id={main.id} size={40} className="size-12 rounded-full bg-white shadow-sm" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-ink-muted">Chans för {SPECIES_BY_ID[main.id].name.toLowerCase()}</h3>
                    <p className="text-3xl leading-none font-bold tabular">{pct(main.chance)}</p>
                  </div>
                  <ChanceBadge v={main.chance} />
                </div>
                <a href={href('guide', { art: main.id })} className="mt-2 inline-flex text-[13px] font-bold text-forest-700 underline-offset-2 hover:underline">
                  Så känner du igen {SPECIES_BY_ID[main.id].name.toLowerCase()} – och vad du ska se upp för →
                </a>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-chance-lo via-chance-mid to-chance-hi" style={{ width: pct(main.chance) }} />
                </div>
                <div className="mt-4 rounded-2xl bg-sand-100/70 p-3">
                  <p className="text-[13px] font-bold">Har du letat här?</p>
                  <p className="text-xs text-ink-muted">
                    {feedbackNear.length
                      ? `Du har markerat ${feedbackNear.length === 1 ? 'en gång' : `${feedbackNear.length} gånger`} i närheten – senast ${feedbackNear[0].found ? 'hittade' : 'inget'} (${new Date(feedbackNear[0].date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}).`
                      : 'Säg till – algoritmen lär sig av dina rundor.'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="btn !min-h-11 border border-forest-700/60 bg-white !px-2 text-forest-800" onClick={() => onFeedback(true, main.id)}>
                      <Check size={16} weight="bold" className="text-forest-600" /> Hittade
                    </button>
                    <button type="button" className="btn !min-h-11 border border-forest-700/60 bg-white !px-2 text-forest-800" onClick={() => onFeedback(false, main.id)}>
                      <Prohibit size={16} weight="bold" className="text-ember" /> Hittade inget
                    </button>
                  </div>
                </div>
                <button type="button" className="mt-1 flex min-h-11 items-center gap-1 text-[13px] font-semibold text-forest-700" aria-expanded={why} onClick={() => setWhy(!why)}>
                  Varför? <CaretDown size={14} className={why ? 'rotate-180' : ''} />
                </button>
                {why && (
                  <ul className="mt-2 grid gap-2">
                    {FACTOR_LABELS.filter(([k]) => !OPTIONAL.has(k) || Math.abs(main.factors[k] - 1) > 0.005).map(([k, label, help]) => {
                      const v = main.factors[k]
                      const isMult = MULT.has(k)
                      const width = isMult ? Math.min(1, v / 1.35) : v
                      const tone = isMult ? (v > 1.02 ? 'text-forest-600' : v < 0.98 ? 'text-ember' : 'text-ink-muted') : ''
                      return (
                        <li key={k} title={help} className="grid grid-cols-[88px_1fr_44px] items-center gap-2 text-[13px]">
                          <span className="font-medium text-forest-800">{label}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-sand-100">
                            <span className="block h-full rounded-full bg-forest-600" style={{ width: `${Math.max(3, width * 100)}%` }} />
                          </span>
                          <span className={`tabular text-right font-semibold ${tone}`}>{isMult ? `×${v.toFixed(2)}` : pct(v)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Arter som trivs här */}
            <div className="card-plain">
              <h3 className="card-title">Arter som trivs här</h3>
              {r.species[0]?.standChance > 0.08 ? (
                <ul className="grid grid-cols-4 gap-2">
                  {r.species.slice(0, 4).map((s) => (
                    <li key={s.id}>
                      <a href={href('guide', { art: s.id })} className="flex flex-col items-center rounded-2xl p-1 text-center hover:bg-white/70" title={`Läs om ${SPECIES_BY_ID[s.id].name}`}>
                        <SpeciesIcon id={s.id} size={36} className="size-14 rounded-full bg-white shadow-[0_6px_14px_-8px_rgb(20_30_0/0.5)] ring-1 ring-sand-200" />
                        <span className="mt-1.5 text-[12px] leading-tight font-semibold">{SPECIES_BY_ID[s.id].name}</span>
                        <span className="tabular text-[12px] text-ink-muted">{pct(s.standChance)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Ingen bra svamp- eller bärmark här enligt modellen.</p>
              )}
            </div>

            {/* Väder */}
            {weather && (
              <div className="card-plain">
                <h3 className="card-title">Väder i området</h3>
                <WeatherChart weather={weather} />
                <p className="mt-2 text-[13px] text-forest-800">{weather.verdict}</p>
              </div>
            )}

            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
              <Info size={14} className="mt-px shrink-0" />
              Chansen räknas fram av en modell (skogstyp, jordart, terräng, omgivning, säsong, väder och dina fynd) – inte en garanti.
              <button
                type="button"
                className="-my-3 ml-auto inline-flex min-h-11 shrink-0 items-center font-semibold text-forest-700 underline-offset-2 hover:underline"
                onClick={() => navigator.clipboard?.writeText(formatCoord(sel.lat, sel.lng)).then(() => toast({ text: 'Koordinaterna är kopierade' }))}
              >
                Kopiera position
              </button>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/** Modellens bästa platser ligger oftast kring 30–60 %, så gränserna sitter lägre än man kanske tror. */
export function ChanceBadge({ v }: { v: number }) {
  const [label, cls] =
    v >= 0.5 ? ['Hög', 'bg-chance-soft text-chance-ink'] : v >= 0.3 ? ['Medel', 'bg-[#efe6fb] text-[#5b2a91]'] : ['Låg', 'bg-sand-100 text-ink-muted']
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{label}</span>
}
