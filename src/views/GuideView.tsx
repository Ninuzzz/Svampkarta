import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle, MapTrifold, Phone, Skull, WarningOctagon } from '@phosphor-icons/react'
import { href, navigate, useRoute } from '../lib/router'
import { DEFAULT_LAT, getHome } from '../lib/home'
import { DANGER_LABEL, DEADLY, DIFFICULTY_LABEL, GUIDE, SAFETY_RULES, guideFor, type Danger, type GuideEntry, type LookAlike } from '../lib/guide'
import { IMAGES } from '../lib/guideImages'
import { SPECIES_BY_ID, type SpeciesId } from '../analysis/species'
import { seasonState } from '../analysis/seasonState'
import { PageHeader, Segmented } from '../components/ui'
import { SpeciesIcon } from '../components/SpeciesIcon'

const DANGER_STYLE: Record<Danger, string> = {
  dodlig: 'bg-[#7f1d1d] text-white',
  giftig: 'bg-[#fde2e1] text-[#9b1c1c]',
  oatlig: 'bg-sand-100 text-forest-800',
  atlig: 'bg-[#e4efc9] text-forest-700',
}

const SEASON_STYLE = {
  now: 'bg-[#e4efc9] text-forest-700',
  soon: 'bg-chanterelle-soft text-[#7a4f0a]',
  off: 'bg-sand-100 text-ink-muted',
}

const hasDanger = (g: GuideEntry) => g.lookAlikes.some((l) => l.danger === 'dodlig' || l.danger === 'giftig')
const worst = (g: GuideEntry): Danger | null =>
  g.lookAlikes.some((l) => l.danger === 'dodlig') ? 'dodlig' : g.lookAlikes.some((l) => l.danger === 'giftig') ? 'giftig' : null

/** Bild från Wikimedia Commons med fotograf och licens. */
function Photo({ imgKey, alt, className = '', credit = true }: { imgKey?: string; alt: string; className?: string; credit?: boolean }) {
  const img = imgKey ? IMAGES[imgKey] : undefined
  const [failed, setFailed] = useState(false)
  if (!img || failed)
    return (
      <div className={`grid place-items-center bg-sand-100 text-xs text-ink-muted ${className}`} role="img" aria-label={alt}>
        Ingen bild
      </div>
    )
  return (
    <figure className={`relative overflow-hidden bg-sand-100 ${className}`}>
      <img src={img.src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      {credit && (
        <figcaption className="absolute right-1.5 bottom-1.5 max-w-[90%] truncate rounded-full bg-black/45 px-2 py-0.5 text-[12px] text-white backdrop-blur">
          <a href={img.page} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Foto: {img.artist} · {img.license}
          </a>
        </figcaption>
      )}
    </figure>
  )
}

export default function GuideView() {
  const { params } = useRoute()
  const art = params.get('art') as SpeciesId | null
  const entry = art && GUIDE.some((g) => g.id === art) ? guideFor(art) : null

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [art])

  return entry ? <Detail entry={entry} /> : <Overview />
}

/* ------------------------------------------------------------------ */

function Overview() {
  const [kind, setKind] = useState<'alla' | 'svamp' | 'bar'>('alla')
  const list = useMemo(() => GUIDE.filter((g) => kind === 'alla' || SPECIES_BY_ID[g.id].kind === kind), [kind])

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-36 sm:px-6 lg:pt-32 lg:pb-20">
      <PageHeader eyebrow="Artguide" title="Svampar & bär" text="Bilder, fakta, kännetecken och vad du ska se upp med så att du inte plockar fel." />

      <SafetyCard />

      <section className="mt-10" aria-labelledby="deadly-h">
        <h2 id="deadly-h" className="flex items-center gap-2 text-2xl">
          <Skull size={24} weight="duotone" className="text-[#9b1c1c]" /> Lär dig dessa först
        </h2>
        <p className="mt-1 text-sm text-ink-muted">De farligaste svamparna i svensk skog. Några av dem liknar matsvampar.</p>
        <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {DEADLY.map((d) => (
            <li key={d.name} className="card-plain w-64 shrink-0 snap-start overflow-hidden !p-0 sm:w-auto">
              <Photo imgKey={d.image} alt={d.name} className="aspect-[4/3] w-full" />
              <div className="p-3.5">
                <DangerBadge danger={d.danger} />
                <p className="mt-1.5 font-bold">{d.name}</p>
                <p className="text-xs text-ink-muted italic">{d.latin}</p>
                <ul className="mt-2 grid gap-1 text-[13px] leading-snug text-forest-900">
                  {d.diff.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="arter-h">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="arter-h" className="text-2xl">
            Arterna
          </h2>
          <div className="sm:w-72">
            <Segmented
              label="Visa"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'alla', label: 'Alla' },
                { value: 'svamp', label: 'Svampar' },
                { value: 'bar', label: 'Bär' },
              ]}
            />
          </div>
        </div>
        <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => {
            const sp = SPECIES_BY_ID[g.id]
            const st = seasonState(g.id, getHome()?.lat ?? DEFAULT_LAT)
            const w = worst(g)
            return (
              <li key={g.id}>
                <a href={href('guide', { art: g.id })} className="card-plain card-hover group flex h-full flex-col overflow-hidden !p-0">
                  <Photo imgKey={g.id} alt={sp.name} className="aspect-[16/10] w-full" credit={false} />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center gap-2.5">
                      <SpeciesIcon id={g.id} size={26} className="size-9 rounded-full bg-white ring-1 ring-sand-200" />
                      <div className="min-w-0">
                        <p className="font-bold">{sp.name}</p>
                        <p className="truncate text-xs text-ink-muted italic">{g.latin}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-forest-900">{g.intro}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${SEASON_STYLE[st.tone]}`}>{st.label}</span>
                      <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[12px] font-bold text-forest-800">{DIFFICULTY_LABEL[g.difficulty]}</span>
                      {w && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${DANGER_STYLE[w]}`}>
                          <WarningOctagon size={12} weight="fill" /> {w === 'dodlig' ? 'Dödlig förväxling finns' : 'Giftig förväxling finns'}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      </section>

      <Credits />
    </main>
  )
}

/* ------------------------------------------------------------------ */

function Detail({ entry }: { entry: GuideEntry }) {
  const sp = SPECIES_BY_ID[entry.id]
  const st = seasonState(entry.id, getHome()?.lat ?? DEFAULT_LAT)
  const danger = hasDanger(entry)

  const showOnMap = () => {
    try {
      const prev = JSON.parse(localStorage.getItem('mycel:map') ?? '{}')
      localStorage.setItem('mycel:map', JSON.stringify({ ...prev, tab: 'chans', target: entry.id }))
    } catch {
      /* ignorera */
    }
    navigate('karta')
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pt-6 pb-36 sm:px-6 lg:pt-28 lg:pb-20">
      <a href={href('guide')} className="btn btn-ghost -ml-3 !px-3">
        <ArrowLeft size={18} weight="bold" /> Alla arter
      </a>

      <article className="mt-3">
        <Photo imgKey={entry.id} alt={sp.name} className="aspect-[16/10] w-full rounded-[1.75rem] shadow-[0_30px_60px_-40px_rgb(20_30_0/0.6)] sm:aspect-[16/8]" />

        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <SpeciesIcon id={entry.id} size={40} className="size-14 rounded-full bg-white shadow-sm ring-1 ring-sand-200" />
            <div>
              <h1 className="text-3xl sm:text-4xl">{sp.name}</h1>
              <p className="text-ink-muted italic">{entry.latin}</p>
            </div>
          </div>
          <button type="button" className="btn btn-primary shrink-0" onClick={showOnMap}>
            <MapTrifold size={18} /> Visa chansen på kartan
          </button>
        </header>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEASON_STYLE[st.tone]}`}>{st.label}</span>
          <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-bold text-forest-800">{DIFFICULTY_LABEL[entry.difficulty]}</span>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-forest-900">{entry.intro}</p>

        <section className="card-plain mt-6" aria-labelledby="fakta-h">
          <h2 id="fakta-h" className="card-title !text-base">
            Fakta
          </h2>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {entry.facts.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[90px_1fr] gap-2 text-sm">
                <dt className="font-semibold text-ink-muted">{k}</dt>
                <dd className="text-forest-900">{v}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[90px_1fr] gap-2 text-sm">
              <dt className="font-semibold text-ink-muted">Trivs</dt>
              <dd className="text-forest-900">{sp.habitat}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6" aria-labelledby="signs-h">
          <h2 id="signs-h" className="text-xl">
            Så känner du igen den
          </h2>
          <ul className="mt-3 grid gap-2">
            {entry.signs.map((s) => (
              <li key={s} className="card-plain flex items-start gap-3 !py-3">
                <CheckCircle size={22} weight="fill" className="mt-px shrink-0 text-forest-600" aria-hidden="true" />
                <span className="text-[15px] leading-snug">{s}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="look-h">
          <h2 id="look-h" className="flex items-center gap-2 text-xl">
            <WarningOctagon size={24} weight="fill" className={danger ? 'text-[#b91c1c]' : 'text-sand-500'} /> Se upp för – förväxlingsrisker
          </h2>
          <ul className="mt-3 grid gap-4">
            {entry.lookAlikes.map((l) => (
              <LookAlikeCard key={l.name} l={l} />
            ))}
          </ul>
        </section>

        {entry.tips.length > 0 && (
          <section className="card-plain mt-8" aria-labelledby="tips-h">
            <h2 id="tips-h" className="card-title !text-base">
              Tips
            </h2>
            <ul className="grid gap-1.5 text-[15px]">
              {entry.tips.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <SafetyCard compact />
        </div>
      </article>
    </main>
  )
}

function LookAlikeCard({ l }: { l: LookAlike }) {
  const danger = l.danger === 'dodlig' || l.danger === 'giftig'
  return (
    <li className={`card-plain grid gap-4 overflow-hidden !p-0 sm:grid-cols-[220px_1fr] ${danger ? '!border-[#f3b4b4] ring-1 ring-[#f3b4b4]/60' : ''}`}>
      <Photo imgKey={l.image} alt={l.name} className="aspect-[4/3] w-full sm:aspect-auto sm:h-full sm:min-h-44" />
      <div className="p-4 sm:pl-0">
        <DangerBadge danger={l.danger} />
        <p className="mt-1.5 text-lg font-bold">{l.name}</p>
        <p className="text-xs text-ink-muted italic">{l.latin}</p>
        <p className="mt-3 text-[13px] font-bold text-forest-800">Skillnad:</p>
        <ul className="mt-1 grid gap-1 text-[14px] leading-snug">
          {l.diff.map((d) => (
            <li key={d}>• {d}</li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function DangerBadge({ danger }: { danger: Danger }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${DANGER_STYLE[danger]}`}>
      {(danger === 'dodlig' || danger === 'giftig') && <WarningOctagon size={12} weight="fill" />}
      {DANGER_LABEL[danger]}
    </span>
  )
}

function SafetyCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className="rounded-[1.5rem] border border-[#f3b4b4] bg-[#fff4f2] p-5" aria-labelledby={compact ? undefined : 'safety-h'}>
      <h2 id={compact ? undefined : 'safety-h'} className="flex items-center gap-2 text-lg text-[#7f1d1d]">
        <WarningOctagon size={22} weight="fill" /> Säkerhet först
      </h2>
      {!compact && (
        <ol className="mt-2 grid gap-1 text-[14px] text-forest-900 sm:grid-cols-2">
          {SAFETY_RULES.map((r, i) => (
            <li key={r}>
              {i + 1}. {r}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[14px] text-forest-900">
        {compact ? 'Ät aldrig något du inte är 100 % säker på. ' : ''}Vid misstänkt förgiftning: ring <b>112</b>. Frågor:{' '}
        <a href="tel:0104566700" className="inline-flex items-center gap-1 font-bold text-[#7f1d1d] underline underline-offset-2">
          <Phone size={14} weight="bold" /> Giftinformationscentralen 010-456 67 00
        </a>
      </p>
      <p className="mt-2 text-[12px] text-ink-muted">Guiden är ett stöd – inte en ersättning för en svampbok eller en kunnig person.</p>
    </section>
  )
}

function Credits() {
  return (
    <details className="mt-12 text-xs text-ink-muted">
      <summary className="font-semibold">Bildkällor</summary>
      <p className="mt-2">Alla foton kommer från Wikimedia Commons och används under respektive licens. Fotograf och licens visas på varje bild.</p>
    </details>
  )
}
