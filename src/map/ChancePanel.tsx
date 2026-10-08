import { useEffect, useRef, useState } from 'react'
import { Check, CaretDown, CloudRain, Drop, Thermometer, Sparkle } from '@phosphor-icons/react'
import { SPECIES_MODELS, dayOfYear, seasonFactor, targetLabel, type SpeciesId, type Target } from '../analysis/species'
import type { Hotspot } from '../analysis/protocol'
import type { Weather } from '../analysis/weather'
import { SpeciesIcon } from '../components/SpeciesIcon'
import { Mushroom, Toggle } from '../components/ui'
import { Cherries } from '@phosphor-icons/react'
import { formatDistance, haversine } from '../lib/geo'
import { TRAINED, TRAINING_DATE } from '../analysis/trained'

export function seasonState(id: SpeciesId, lat: number) {
  const sp = SPECIES_MODELS.find((s) => s.id === id)!
  const doy = dayOfYear()
  const f = seasonFactor(sp, doy, lat)
  const peak = sp.peak + sp.latShift * (lat - 56)
  if (f > 0.45) return { label: 'Säsong nu', tone: 'now' as const }
  if (doy > peak && f > 0.12) return { label: 'Sen säsong', tone: 'soon' as const }
  if (doy < peak && peak - doy < 45) return { label: 'Snart', tone: 'soon' as const }
  return { label: doy < peak ? 'Ej än' : 'Slut för i år', tone: 'off' as const }
}

const TONE = {
  now: 'bg-[#e4efc9] text-forest-700',
  soon: 'bg-chanterelle-soft text-[#7a4f0a]',
  off: 'bg-sand-100 text-ink-muted',
}

export function TargetPicker({ target, onChange, lat }: { target: Target; onChange: (t: Target) => void; lat: number }) {
  const group = (kind: 'svamp' | 'bar') => (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-bold tracking-wide text-forest-800 uppercase">{kind === 'svamp' ? 'Svamp' : 'Bär'}</h3>
      </div>
      <ul className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={kind === 'svamp' ? 'Svampar' : 'Bär'}>
        <li>
          <TargetRow
            active={target === kind}
            onClick={() => onChange(kind)}
            icon={
              <span className="grid size-8 place-items-center rounded-full bg-forest-700 text-amber">
                {kind === 'svamp' ? <Mushroom size={18} weight="fill" /> : <Cherries size={18} weight="fill" />}
              </span>
            }
            label={kind === 'svamp' ? 'Alla svampar' : 'Alla bär'}
            sub="Bästa just nu"
          />
        </li>
        {SPECIES_MODELS.filter((s) => s.kind === kind).map((s) => {
          const st = seasonState(s.id, lat)
          return (
            <li key={s.id}>
              <TargetRow
                active={target === s.id}
                onClick={() => onChange(s.id)}
                icon={<SpeciesIcon id={s.id} size={26} className="size-8 rounded-full bg-white" />}
                label={s.name}
                sub={st.label}
                tone={TONE[st.tone]}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <div className="grid gap-4" data-tour="species">
      {group('svamp')}
      {group('bar')}
    </div>
  )
}

/** En art i väljaren: ikon, namn och säsong – två per rad så att väljaren ryms överst i panelen. */
function TargetRow({ active, onClick, icon, label, sub, tone }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string; tone?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`relative flex min-h-14 w-full items-center gap-2 rounded-2xl border py-1.5 pr-2 pl-1.5 text-left transition-[background-color,border-color,box-shadow] duration-200 ${
        active ? 'border-forest-700 bg-white shadow-[0_6px_16px_-10px_rgb(20_30_0/0.6)]' : 'border-sand-200/80 bg-white/55 hover:bg-white/90'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-tight font-semibold">{label}</span>
        <span className={`mt-0.5 inline-block rounded-full px-1.5 text-[12px] leading-[1.35] font-bold ${tone ?? 'text-ink-muted'}`}>{sub}</span>
      </span>
      {active && <Check size={14} weight="bold" className="absolute top-1.5 right-1.5 text-forest-700" aria-hidden="true" />}
    </button>
  )
}

/** Chansfilter: visa bara områden och toppar över vald procent. */
export const AREA_STEPS = [0, 0.25, 0.5, 1, 2, 5, 10]
const fmtHa = (v: number) => (v === 0 ? 'Alla' : `${v.toLocaleString('sv-SE')} ha`)

export function MinChanceCard({
  value,
  onChange,
  ceiling,
  minArea,
  onMinArea,
}: {
  value: number
  onChange: (v: number) => void
  ceiling: number
  minArea: number
  onMinArea: (v: number) => void
}) {
  const [local, setLocal] = useState(Math.round(value * 100))
  const [areaIdx, setAreaIdx] = useState(Math.max(0, AREA_STEPS.indexOf(minArea)))
  const timer = useRef(0)
  const areaTimer = useRef(0)
  useEffect(() => setLocal(Math.round(value * 100)), [value])
  useEffect(() => setAreaIdx(Math.max(0, AREA_STEPS.indexOf(minArea))), [minArea])
  const set = (v: number) => {
    setLocal(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange(v / 100), 350)
  }
  const setArea = (i: number) => {
    setAreaIdx(i)
    window.clearTimeout(areaTimer.current)
    areaTimer.current = window.setTimeout(() => onMinArea(AREA_STEPS[i]), 350)
  }
  const ha = AREA_STEPS[areaIdx]
  const max = Math.round(ceiling * 100)
  const tooHigh = local > 0 && local >= max
  return (
    <div className="card-plain" data-tour="min-chance">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor="min-chance" className="card-title !mb-0">
          Visa bara chans över
        </label>
        <span className="rounded-full bg-[#fde3cf] px-2.5 py-0.5 text-sm font-bold text-[#9a3412] tabular">{local} %</span>
      </div>
      <input
        id="min-chance"
        type="range"
        className="range"
        min={0}
        max={90}
        step={5}
        value={local}
        onChange={(e) => set(Number(e.target.value))}
        aria-describedby="min-chance-help"
        aria-valuetext={`${local} procent`}
        style={{ ['--fill' as string]: `${(local / 90) * 100}%` }}
      />
      <div className="mt-1 flex items-center gap-2" aria-hidden="true">
        <span className="text-[12px] font-semibold text-ink-muted">Låg</span>
        <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-[#ffec78] via-[#ffb81c] to-[#f04600]" />
        <span className="text-[12px] font-semibold text-ink-muted">Hög</span>
      </div>
      <p id="min-chance-help" className={`mt-2 text-[12px] leading-snug ${tooHigh ? 'font-semibold text-ember' : 'text-ink-muted'}`}>
        {tooHigh
          ? `Högsta möjliga chans just nu är ca ${max} % – sänk gränsen för att se områden.`
          : local === 0
            ? `Visar alla områden. Högsta möjliga chans just nu: ca ${max} %.`
            : `Döljer områden och toppar under ${local} %. Högsta möjliga just nu: ca ${max} %.`}
      </p>
      {local > 0 && (
        <button type="button" className="mt-2 text-[12px] font-bold text-forest-700 underline-offset-2 hover:underline" onClick={() => set(0)}>
          Visa alla igen
        </button>
      )}

      <div className="mt-4 border-t border-sand-200/70 pt-4">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <label htmlFor="min-area" className="card-title !mb-0">
            Minsta område
          </label>
          <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-sm font-bold text-forest-800 tabular">{fmtHa(ha)}</span>
        </div>
        <input
          id="min-area"
          type="range"
          className="range"
          min={0}
          max={AREA_STEPS.length - 1}
          step={1}
          value={areaIdx}
          onChange={(e) => setArea(Number(e.target.value))}
          aria-describedby="min-area-help"
          aria-valuetext={ha === 0 ? 'Alla storlekar' : `${ha} hektar`}
          style={{ ['--fill' as string]: `${(areaIdx / (AREA_STEPS.length - 1)) * 100}%` }}
        />
        <div className="mt-0.5 flex justify-between text-[12px] font-semibold text-ink-muted tabular" aria-hidden="true">
          {AREA_STEPS.map((v) => (
            <span key={v}>{v === 0 ? 'alla' : v}</span>
          ))}
        </div>
        <p id="min-area-help" className="mt-2 text-[12px] leading-snug text-ink-muted">
          {ha === 0
            ? 'Visar alla fläckar, även mycket små.'
            : `Döljer småfläckar – visar bara sammanhängande områden större än ${fmtHa(ha)} (≈ ${Math.round(Math.sqrt(ha * 10000))} × ${Math.round(Math.sqrt(ha * 10000))} m).`}
        </p>
      </div>
    </div>
  )
}

export function WeatherCard({ weather, error }: { weather: Weather | null; error: boolean }) {
  if (error) return <p className="card-plain text-sm text-ink-muted">Vädret kunde inte hämtas just nu – chansen räknas utan väder.</p>
  if (!weather) return <div className="card-plain h-28 animate-pulse" aria-hidden="true" />
  const idx = Math.round(weather.index * 100)
  return (
    <div className="card-plain">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="card-title !mb-0">Svampväder</h3>
          <p className="text-[13px] text-forest-800">{weather.verdict}</p>
        </div>
        <div
          className="grid size-14 shrink-0 place-items-center rounded-full text-sm font-bold tabular"
          style={{ background: `conic-gradient(#e0662b ${idx * 3.6}deg, #f5edd3 0)` }}
          aria-label={`Svampväderindex ${idx} av 100`}
        >
          <span className="grid size-11 place-items-center rounded-full bg-white">{idx}</span>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: CloudRain, label: 'Regn 14 d', value: `${Math.round(weather.rain14)} mm` },
          { icon: Drop, label: 'Markfukt', value: weather.soilMoisture != null ? `${Math.round(weather.soilMoisture * 100)} %` : '–' },
          { icon: Thermometer, label: 'Temp 10 d', value: `${weather.t10.toFixed(0)}°` },
        ].map(({ icon: I, label, value }) => (
          <div key={label} className="rounded-xl bg-sand-100/70 px-1 py-2">
            <dt className="flex items-center justify-center gap-1 text-[12px] font-semibold text-ink-muted">
              <I size={12} aria-hidden="true" /> {label}
            </dt>
            <dd className="tabular text-sm font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function HotspotList({
  spots,
  progress,
  center,
  onPick,
  zoomTooLow,
  target,
  minChance = 0,
}: {
  spots: Hotspot[]
  progress: { done: number; total: number }
  center: { lat: number; lng: number }
  onPick: (h: Hotspot) => void
  zoomTooLow: boolean
  target: Target
  minChance?: number
}) {
  const loading = progress.total > 0
  return (
    <div className="card-plain" data-tour="hotspots">
      <h3 className="card-title flex items-center gap-2">
        <Sparkle size={14} weight="fill" className="text-amber" /> Bästa områdena i vyn
      </h3>
      {zoomTooLow ? (
        <p className="text-sm text-ink-muted">Zooma in närmare för att algoritmen ska leta efter {targetLabel(target).toLowerCase()}.</p>
      ) : !spots.length ? (
        <p className="text-sm text-ink-muted">
          {loading
            ? 'Algoritmen analyserar skogen…'
            : minChance > 0
              ? `Inga områden över ${Math.round(minChance * 100)} % i vyn. Sänk gränsen eller flytta kartan.`
              : 'Inga starka områden i vyn just nu. Prova att flytta kartan eller välja en annan art.'}
        </p>
      ) : (
        <ol className="grid gap-1.5">
          {spots.slice(0, 6).map((h, i) => (
            <li key={`${h.lat},${h.lng}`}>
              <button type="button" onClick={() => onPick(h)} className="flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left hover:bg-white">
                <span className="w-4 text-center text-xs font-bold text-ink-muted tabular">{i + 1}</span>
                <SpeciesIcon id={h.species} size={24} className="size-8 rounded-full bg-white" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{SPECIES_MODELS.find((s) => s.id === h.species)!.name}</span>
                  <span className="block text-[12px] text-ink-muted tabular">
                    {formatDistance(haversine(center, h))} bort · {h.areaHa < 1 ? h.areaHa.toFixed(1) : Math.round(h.areaHa)} ha
                  </span>
                </span>
                <span className="rounded-full bg-[#fde3cf] px-2 py-0.5 text-xs font-bold text-[#9a3412] tabular">{Math.round(h.score * 100)}&nbsp;%</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {loading && spots.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-muted tabular">
          Analyserar fler rutor… {progress.done}/{progress.total}
        </p>
      )}
    </div>
  )
}

export function ChanceSettings({
  mode,
  onMode,
  learned,
}: {
  mode: 'nu' | 'potential'
  onMode: (m: 'nu' | 'potential') => void
  learned: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-3">
      <Toggle
        label="Säsong och väder"
        description={mode === 'nu' ? 'Visar chansen just nu' : 'Visar markens potential oavsett tid'}
        checked={mode === 'nu'}
        onChange={(v) => onMode(v ? 'nu' : 'potential')}
      />
      <div className="card-plain">
        <button type="button" className="-my-2 flex min-h-11 w-full items-center justify-between text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="text-sm font-bold">Så fungerar algoritmen</span>
          <CaretDown size={16} className={open ? 'rotate-180' : ''} />
        </button>
        {open && (
          <div className="mt-3 grid gap-2 text-[13px] leading-relaxed text-forest-800">
            <p>För varje 5–20 meters ruta i kartan väger modellen ihop:</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                <b>Skogstyp</b> – trädslag, fastmark/våtmark och hyggen (NMD 2023, Naturvårdsverket).
              </li>
              <li>
                <b>Jordart</b> – sand, morän, lera, torv eller berg (SGU).
              </li>
              <li>
                <b>Terräng</b> – svackor och krön, sol- och skuggsluttningar (höjdmodell).
              </li>
              <li>
                <b>Omgivning</b> – kanter mot hyggen, närhet till myr och vatten, ek och bok i närheten.
              </li>
              <li>
                <b>Sammanhang</b> – större sammanhängande lämplig skog ger högre chans.
              </li>
              <li>
                <b>Skogsålder</b> – t.ex. kantarell i medelålders och äldre skog, smörsopp i ung tallskog (SLU skogsålder 2025).
              </li>
              <li>
                <b>Stigar</b> – stigkanter och skogsbilvägar (OpenStreetMap).
              </li>
              <li>
                <b>Säsong</b> – artens säsong, förskjuten efter breddgrad.
              </li>
              <li>
                <b>Väder</b> – regn 1–2 veckor bakåt, markfukt, temperatur och frost (Open-Meteo).
              </li>
              <li>
                <b>Dina fynd</b> – {learned ? `${learned} egna fynd och markeringar används` : 'sparade platser och knapparna "Hittade"/"Hittade inget"'} – chansen höjs i liknande skog nära dina fynd och sänks där du inte hittat något.
              </li>
            </ol>
            <TrainingSummary />
            <p className="text-ink-muted">Topparna markeras med artikon och procent. Klicka på kartan för att se exakt varför ett område får sin chans.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Hur väl modellen träffar riktiga fynd (från träningen på GBIF/Artportalen). */
function TrainingSummary() {
  const rows = Object.values(TRAINED).filter((t) => !!t)
  if (!rows.length) return null
  const n = rows.reduce((s, t) => s + t.n, 0)
  const extra = rows.reduce((s, t) => s + (t.extra ?? 0), 0)
  // testet görs på GBIF-fynd – varje art väger lika
  const avg = (f: (t: (typeof rows)[number]) => number) => rows.reduce((s, t) => s + f(t), 0) / rows.length
  const hit = avg((t) => (t.used ? t.hitTrained : t.hitExpert))
  const hitExpert = avg((t) => t.hitExpert)
  const hitForest = avg((t) => t.hitForest)
  const trained = rows.filter((t) => t.used).length
  return (
    <div className="rounded-2xl bg-[#e4efc9] p-3 text-[13px] text-forest-800">
      <p className="font-bold">Tränad på {n.toLocaleString('sv-SE')} riktiga fynd</p>
      <p className="mt-1">
        Testat på platser modellen aldrig sett: <b>{Math.round(hit * 100)} %</b> av fynden låg i den bästa femtedelen av marken
        {Math.abs(hit - hitExpert) > 0.005 ? ` (${Math.round(hitExpert * 100)} % före träning)` : ''}. Att bara gå till närmaste skog gav{' '}
        {Math.round(hitForest * 100)} %, slumpen 20 %.
      </p>
      <p className="mt-1 text-ink-muted">
        {trained} av {rows.length} arter fick nya vikter. Källa: GBIF (bl.a. Artportalen){extra ? ` och ${extra.toLocaleString('sv-SE')} fynd från svampkarta.se` : ''}{TRAINING_DATE ? `, ${TRAINING_DATE}` : ''}.
      </p>
    </div>
  )
}
