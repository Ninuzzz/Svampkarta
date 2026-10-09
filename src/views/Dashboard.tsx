import { SyncPanel } from '../components/SyncPanel'
import { useRef, useState, type ReactNode } from 'react'
import { ArrowRight, BookOpenText, Books, DownloadSimple, MapPin, Path, Plus, Question, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { actions, hasDemoData, isAppData, useData } from '../lib/store'
import { href } from '../lib/router'
import { formatDate, formatDistance, todayISO } from '../lib/geo'
import { MONTHS } from '../lib/season'
import { HOME } from '../lib/home'
import { BRAND } from '../lib/brand'
import { KindIcon, YieldDots } from '../components/ui'
import { RoutePreview } from '../components/RoutePreview'
import { LogForm, WEATHER } from '../components/LogForm'
import { useToast } from '../components/Toast'
import { SpeciesIcon } from '../components/SpeciesIcon'
import { useWeather } from '../analysis/weather'
import { SPECIES_MODELS, dayOfYear, seasonFactor, type SpeciesId } from '../analysis/species'
import { useTour } from '../components/Tour'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'God natt'
  if (h < 10) return 'God morgon'
  if (h < 18) return 'God eftermiddag'
  return 'God kväll'
}

/** Öppna kartan med en viss art vald */
function openMapFor(id: SpeciesId) {
  try {
    const prev = JSON.parse(localStorage.getItem('mycel:map') ?? '{}')
    localStorage.setItem('mycel:map', JSON.stringify({ ...prev, tab: 'chans', target: id }))
  } catch {
    /* ignorera */
  }
}

export default function Dashboard() {
  const data = useData()
  const { places, logs, routes } = data
  const [logOpen, setLogOpen] = useState(false)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const { weather } = useWeather(HOME.lat, HOME.lng)
  const tour = useTour()

  const totalKm = routes.reduce((s, r) => s + r.distance, 0)
  const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0]
  const lastRoute = [...routes].sort((a, b) => b.date.localeCompare(a.date))[0]
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  const findsThisYear = logs.filter((l) => l.date.startsWith(String(year))).reduce((s, l) => s + l.findings.length, 0)

  // Arter i säsong just nu på hemorten, rangordnade med vädret
  const doy = dayOfYear()
  const inSeason = SPECIES_MODELS.map((s) => {
    const season = seasonFactor(s, doy, HOME.lat)
    const range = s.range ? s.range(HOME.lat) : 1
    return { s, season, range, f: season * (weather?.factors[s.id] ?? 1) * range }
  })
    .filter((x) => x.season > 0.15 && x.range > 0.3)
    .sort((a, b) => b.f - a.f)

  const hasStats = places.length + logs.length + routes.length > 0
  const stats = [
    { label: 'sparade platser', value: places.length },
    { label: 'loggade rundor', value: logs.length },
    { label: 'vandrat', value: formatDistance(totalKm) },
    { label: `fynd ${year}`, value: findsThisYear },
  ]

  function exportData() {
    const blob = new Blob([JSON.stringify(actions.snapshot(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mycel-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importData(file: File | undefined) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!isAppData(parsed)) throw new Error()
      const before = actions.snapshot()
      actions.replaceAll(parsed)
      toast({ text: 'Säkerhetskopian är återställd', action: { label: 'Ångra', run: () => actions.restore(before) } })
    } catch {
      toast({ text: `Filen kunde inte läsas – är det en export från ${BRAND.name}?` })
    }
  }

  const idx = weather ? Math.round(weather.index * 100) : null

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-8 pb-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-36 lg:pb-24">
        <div className="rise">
          <p className="eyebrow">
            {greeting()} · {MONTHS[month - 1]} · {HOME.name}
          </p>
          <h1 className="mt-4 text-[2.6rem] leading-[1.04] font-bold sm:text-6xl lg:text-[4.1rem]">
            Hitta skogens{' '}
            <span className="relative whitespace-nowrap text-forest-700">
              guldställen
              <Underline />
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
            {BRAND.name} läser av skog, jordart, terräng och väder och visar var chansen är störst att hitta svamp och bär. Dina egna ställen stannar hemliga hos
            dig.
          </p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <a href={href('karta')} className="btn btn-primary !min-h-13 justify-center !px-7 !text-base">
              <Sparkle size={20} weight="fill" className="text-amber" /> Hitta svamp nu
            </a>
            <button
              type="button"
              className="btn !min-h-13 justify-center border border-forest-700/80 bg-white/60 !px-6 !text-base text-forest-800 hover:bg-white"
              onClick={() => setLogOpen(true)}
            >
              <Plus size={18} weight="bold" /> Logga en runda
            </button>
          </div>
          <button
            type="button"
            onClick={tour.start}
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-forest-700 underline-offset-4 hover:underline"
          >
            <Question size={18} weight="bold" /> Så funkar {BRAND.name} – ta guiden
          </button>

          {/* Mobil: dagens läge direkt under knapparna, så att det syns utan att scrolla */}
          <a href={href('karta')} className="glass-strong mt-6 flex items-center gap-3 !rounded-3xl p-3 lg:hidden" aria-label={`Svampväder idag ${idx ?? ''}, bäst just nu: ${inSeason.slice(0, 3).map(({ s }) => s.name).join(', ')} – öppna kartan`}>
            <WeatherRing idx={idx} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-ink-muted">Svampväder idag</span>
              <span className="block truncate text-sm font-bold">{weather ? weather.verdict.split(' – ')[0] : 'Hämtar väder…'}</span>
            </span>
            <span className="flex -space-x-2" aria-hidden="true">
              {inSeason.slice(0, 3).map(({ s }) => (
                <SpeciesIcon key={s.id} id={s.id} size={22} className="size-9 rounded-full bg-white ring-2 ring-bone" />
              ))}
            </span>
          </a>
        </div>

        {/* Bildkort med svävande glas-widgets */}
        <div className="rise relative mx-auto w-full max-w-[520px] lg:max-w-none" style={{ animationDelay: '120ms' }}>
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-40px_rgb(20_30_0/0.55)] lg:aspect-[4/3.6] lg:rounded-[2.25rem]">
            <img
              src="/img/hero-1000.webp"
              srcSet="/img/hero-1000.webp 1000w, /img/hero-2000.webp 2000w"
              sizes="(min-width: 1024px) 560px, 100vw"
              alt="Granskog som speglar sig i en stilla sjö"
              width={1000}
              height={690}
              fetchPriority="high"
              className="size-full object-cover object-[50%_45%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-900/25 via-transparent to-transparent" aria-hidden="true" />
          </div>

          {/* dator: svävande glaskort över bilden (mobilen har raden under knapparna) */}
          <div className="glass-strong absolute top-8 -left-8 hidden items-center gap-3 !rounded-3xl p-3 pr-5 lg:flex">
            <WeatherRing idx={idx} />
            <div>
              <p className="text-xs font-semibold text-ink-muted">Svampväder idag</p>
              <p className="max-w-44 text-sm leading-snug font-bold">{weather ? weather.verdict.split(' – ')[0] : 'Hämtar väder…'}</p>
            </div>
          </div>

          <div className="glass-strong absolute -right-6 -bottom-8 hidden w-[min(260px,78%)] !rounded-3xl p-4 lg:block">
            <p className="text-xs font-semibold text-ink-muted">Bäst just nu runt {HOME.name}</p>
            <ul className="mt-2 grid gap-1.5">
              {inSeason.slice(0, 3).map(({ s }) => (
                <li key={s.id} className="flex items-center gap-2.5">
                  <SpeciesIcon id={s.id} size={24} className="size-8 rounded-full bg-white" />
                  <span className="text-sm font-bold">{s.name}</span>
                </li>
              ))}
              {!inSeason.length && <li className="text-sm text-ink-muted">Vintervila – planera nästa säsong.</li>}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Siffror (visas först när det finns något att räkna) ---------- */}
      {hasStats && (
        <section className="relative overflow-hidden bg-forest-700 text-bone" aria-label="Din statistik">
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-amber/15 blur-3xl" aria-hidden="true" />
          <dl className="relative mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 md:grid-cols-4">
            {stats.map(({ label, value }) => (
              <div key={label} className="flex flex-col-reverse text-center">
                <dt className="mt-1 text-sm font-medium text-bone/75">{label}</dt>
                <dd className="text-4xl font-bold tabular sm:text-5xl">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="mx-auto max-w-6xl px-4 pb-36 sm:px-6 lg:pb-20">
        {hasDemoData(data) && (
          <div className="card-plain mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:!p-5">
            <p className="text-sm text-forest-800">
              <span className="font-bold">Exempeldata visas</span> så att du ser hur appen fungerar. Dina egna platser blir kvar när du rensar.
            </p>
            <button
              type="button"
              className="btn shrink-0 border border-forest-700/70 bg-white/60 text-forest-800"
              onClick={() => {
                const before = actions.snapshot()
                actions.clearDemo()
                toast({ text: 'Exempeldata borttagen', action: { label: 'Ångra', run: () => actions.restore(before) } })
              }}
            >
              Rensa exempeldata
            </button>
          </div>
        )}

        {/* ---------- Säsong ---------- */}
        <section className="mt-16" aria-labelledby="season-h" data-tour="season">
          <p className="eyebrow">I skogen just nu</p>
          <h2 id="season-h" className="mt-2 mb-6 text-3xl sm:text-4xl">
            Vad finns i {MONTHS[month - 1]}?
          </h2>
          {inSeason.length ? (
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {inSeason.slice(0, 8).map(({ s, f }) => (
                <li key={s.id}>
                  <a href={href('karta')} onClick={() => openMapFor(s.id)} className="card-plain card-hover flex h-full flex-col items-start gap-3 sm:flex-row">
                    <SpeciesIcon id={s.id} size={32} className="size-11 rounded-full bg-white ring-1 ring-sand-200" />
                    <div className="min-w-0">
                      <p className="font-bold">{s.name}</p>
                      <p className="text-[13px] leading-snug text-ink-muted">{s.habitat}</p>
                      <p className="mt-1.5 text-xs font-bold text-forest-600">{f > 0.5 ? 'Bra läge nu' : f > 0.25 ? 'Finns nu' : 'Sparsamt'} →</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-plain text-sm text-ink-muted">Vintervila i skogen. Planera nästa säsong på kartan!</p>
          )}
          <a href={href('guide')} className="card-plain card-hover mt-4 flex items-center gap-4 !p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-forest-700 text-amber">
              <Books size={22} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Artguide – så känner du igen dem</span>
              <span className="block text-sm text-ink-muted">Bilder, kännetecken och vilka giftiga arter du ska se upp för.</span>
            </span>
            <ArrowRight size={18} weight="bold" className="shrink-0 text-forest-700" />
          </a>
        </section>

        {/* ---------- Samlingar ---------- */}
        <section className="mt-20" aria-labelledby="coll-h">
          <p className="eyebrow">Privata samlingar</p>
          <h2 id="coll-h" className="mt-2 mb-6 text-3xl sm:text-4xl">
            Mina samlingar
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <a href={href('platser')} className="glass glass-sheen card-hover group flex flex-col p-6">
              <CollectionHead icon={<MapPin size={22} />} title="Mina platser" meta={`${places.length} sparade`} />
              <ul className="mt-5 grid gap-2">
                {places.slice(0, 3).map((p) => (
                  <li key={p.id} className="glass-inset flex items-center gap-3 px-3 py-2.5">
                    <KindIcon kind={p.kind} size={18} className={p.kind === 'svamp' ? 'text-chanterelle' : 'text-lingon'} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                    <YieldDots value={p.yield} />
                  </li>
                ))}
                {!places.length && <li className="text-sm text-ink-muted">Inga platser än – klicka på kartan för att spara din första.</li>}
              </ul>
              <CollectionLink label="Hantera platser" />
            </a>

            <a href={href('dagbok')} className="glass glass-sheen card-hover group flex flex-col p-6">
              <CollectionHead icon={<BookOpenText size={22} />} title="Anteckningar & bilder" meta={`${logs.length} rundor`} />
              {lastLog ? (
                <div className="glass-inset mt-5 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                    {(() => {
                      const W = WEATHER.find((w) => w.value === lastLog.weather)
                      return W ? <W.icon size={16} aria-hidden="true" /> : null
                    })()}
                    {formatDate(lastLog.date)}
                    {lastLog.temperature != null && <span>· {lastLog.temperature}°</span>}
                  </div>
                  <p className="mt-1.5 font-semibold">{lastLog.title}</p>
                  {lastLog.findings.length > 0 && <p className="mt-1 line-clamp-1 text-sm text-ink-muted">{lastLog.findings.map((f) => f.species).join(', ')}</p>}
                </div>
              ) : (
                <p className="mt-5 text-sm text-ink-muted">Logga datum, väder och fynd från dina rundor.</p>
              )}
              <CollectionLink label="Öppna dagboken" />
            </a>

            <a href={href('rutter')} className="glass glass-sheen card-hover group flex flex-col p-6 md:col-span-2 lg:col-span-1">
              <CollectionHead icon={<Path size={22} />} title="Rutt-spårning" meta={`${routes.length} stråk · ${formatDistance(totalKm)}`} />
              {lastRoute ? (
                <div className="glass-inset mt-5 flex items-center gap-4 p-3">
                  <RoutePreview points={lastRoute.points} className="size-20 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{lastRoute.name}</p>
                    <p className="text-sm text-ink-muted">
                      {formatDate(lastRoute.date, { day: 'numeric', month: 'short' })} · {formatDistance(lastRoute.distance)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-ink-muted">Spela in en promenad eller importera en GPX-fil.</p>
              )}
              <CollectionLink label="Se mina stråk" />
            </a>
          </div>
        </section>

        {/* ---------- Data ---------- */}
        <section className="card-plain mt-16 flex flex-col gap-5 !p-6" aria-labelledby="data-h">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="data-h" className="text-lg">
                Din data stannar hos dig
              </h2>
              <p className="mt-1 max-w-lg text-sm text-ink-muted">
                Allt sparas i den här webbläsaren – inga prenumerationer, och inget konto behövs. Ta en säkerhetskopia ibland, eller logga in nedan om du vill synka.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn border border-forest-700/70 bg-white/60 text-forest-800" onClick={exportData}>
                <DownloadSimple size={18} /> Exportera
              </button>
              <button type="button" className="btn border border-forest-700/70 bg-white/60 text-forest-800" onClick={() => fileRef.current?.click()}>
                <UploadSimple size={18} /> Importera
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  importData(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <div className="border-t border-sand-200 pt-5">
            <SyncPanel />
          </div>
        </section>
      </div>

      <LogForm open={logOpen} entry={null} onClose={() => setLogOpen(false)} />
    </>
  )
}

/** Handritad understrykning i kantarellgult */
function Underline() {
  return (
    <svg viewBox="0 0 300 14" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3 w-full text-amber" aria-hidden="true">
      <path d="M3 9c40-6 90-8 147-6 55 2 100 4 147 1" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

function CollectionHead({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-12 place-items-center rounded-2xl bg-forest-700 text-bone shadow-[0_10px_20px_-10px_rgb(20_30_0/0.7)]">{icon}</span>
      <div>
        <h3 className="text-lg">{title}</h3>
        <p className="tabular text-sm text-ink-muted">{meta}</p>
      </div>
    </div>
  )
}

function CollectionLink({ label }: { label: string }) {
  return (
    <span className="mt-auto flex items-center gap-1.5 pt-6 text-sm font-bold text-forest-700">
      {label}
      <ArrowRight size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" />
    </span>
  )
}

/** Svampvädrets index 0–100 som en ring. */
function WeatherRing({ idx, size = 'md' }: { idx: number | null; size?: 'sm' | 'md' }) {
  const outer = size === 'sm' ? 'size-11' : 'size-14'
  const inner = size === 'sm' ? 'size-8 text-xs' : 'size-11 text-sm'
  return (
    <div className={`grid ${outer} shrink-0 place-items-center rounded-full`} style={{ background: `conic-gradient(#e0662b ${(idx ?? 0) * 3.6}deg, #f5edd3 0)` }} aria-hidden="true">
      <span className={`grid ${inner} place-items-center rounded-full bg-white font-bold tabular`}>{idx ?? '–'}</span>
    </div>
  )
}
