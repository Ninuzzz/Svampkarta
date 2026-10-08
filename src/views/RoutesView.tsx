import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Clock, Footprints, MapTrifold, Path, PencilSimple, Record, Stop, Trash, UploadSimple } from '@phosphor-icons/react'
import { actions, uid, useData } from '../lib/store'
import { href } from '../lib/router'
import { formatDate, formatDistance, formatDuration, haversine, parseGpx, pathLength, todayISO } from '../lib/geo'
import { EmptyState, PageHeader, Sheet } from '../components/ui'
import { RoutePreview } from '../components/RoutePreview'
import { useToast } from '../components/Toast'
import type { Route } from '../lib/types'

type Draft = Omit<Route, 'createdAt'>

const clock = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n, i) => (i ? String(n).padStart(2, '0') : String(n))).join(':')

export default function RoutesView() {
  const { routes } = useData()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [recording, setRecording] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted = [...routes].sort((a, b) => b.date.localeCompare(a.date))
  const total = routes.reduce((s, r) => s + r.distance, 0)
  const totalTime = routes.reduce((s, r) => s + (r.duration ?? 0), 0)

  async function importGpx(file: File | undefined) {
    if (!file) return
    try {
      const g = parseGpx(await file.text())
      setDraft({
        id: uid(),
        name: g.name ?? file.name.replace(/\.gpx$/i, ''),
        date: g.date ?? todayISO(),
        points: g.points,
        distance: pathLength(g.points),
        duration: g.duration,
      })
    } catch (e) {
      toast({ text: (e as Error).message })
    }
  }

  function remove(r: Route) {
    const before = actions.snapshot()
    actions.deleteRoute(r.id)
    toast({ text: `”${r.name}” togs bort`, action: { label: 'Ångra', run: () => actions.restore(before) } })
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-36 sm:px-6 lg:pt-32 lg:pb-20">
      <PageHeader
        eyebrow="Samling"
        title="Rutt-spårning"
        text="Dina tidigare promenadstråk. Spela in direkt i mobilen eller importera från klockan via GPX."
        actions={
          <>
            <button type="button" className="btn btn-glass" onClick={() => fileRef.current?.click()}>
              <UploadSimple size={18} /> Importera GPX
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setRecording(true)} disabled={recording}>
              <Record size={18} weight="fill" /> Spela in
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                importGpx(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        }
      />

      {recording && (
        <Recorder
          onCancel={() => setRecording(false)}
          onDone={(points, duration) => {
            setRecording(false)
            if (points.length < 2) return toast({ text: 'För få positioner registrerades – rutten sparades inte.' })
            setDraft({ id: uid(), name: 'Ny runda', date: todayISO(), points, distance: pathLength(points), duration })
          }}
        />
      )}

      {routes.length > 0 && (
        <dl className="mb-8 grid grid-cols-3 gap-3">
          {[
            { label: 'Stråk', value: routes.length, icon: Path },
            { label: 'Totalt', value: formatDistance(total), icon: Footprints },
            { label: 'Tid ute', value: formatDuration(totalTime), icon: Clock },
          ].map(({ label, value, icon: I }) => (
            <div key={label} className="glass flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-3 sm:p-5">
              <I size={22} className="text-sage-600" aria-hidden="true" />
              <div>
                <dt className="text-xs font-medium text-ink-muted">{label}</dt>
                <dd className="tabular text-lg font-semibold sm:text-xl">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}

      {routes.length === 0 && !recording ? (
        <EmptyState
          icon={<Path size={28} />}
          title="Inga stråk sparade"
          text="Starta en inspelning nästa gång du går ut, eller importera en GPX-fil från din klocka eller app."
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r, i) => (
            <li key={r.id} className="glass glass-sheen card-hover rise flex flex-col overflow-hidden" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="relative m-2 mb-0 grid place-items-center rounded-[1.1rem] bg-[radial-gradient(circle_at_30%_20%,var(--color-sage-100),var(--color-sand-100))]">
                <RoutePreview points={r.points} className="aspect-[4/3] w-full max-w-64 p-2" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-semibold text-ink-muted">{formatDate(r.date)}</p>
                <h2 className="mt-1 text-lg font-semibold">{r.name}</h2>
                <p className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-forest-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Footprints size={16} className="text-sage-600" aria-hidden="true" /> {formatDistance(r.distance)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={16} className="text-sage-600" aria-hidden="true" /> {formatDuration(r.duration)}
                  </span>
                </p>
                <div className="mt-auto flex items-center gap-1 pt-5">
                  <a href={href('karta', { route: r.id })} className="btn btn-primary flex-1 !min-h-10">
                    <MapTrifold size={18} /> Visa på karta
                  </a>
                  <button type="button" className="icon-btn" aria-label={`Byt namn på ${r.name}`} onClick={() => setDraft(r)}>
                    <PencilSimple size={18} />
                  </button>
                  <button type="button" className="icon-btn !text-danger" aria-label={`Ta bort ${r.name}`} onClick={() => remove(r)}>
                    <Trash size={18} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RouteSheet draft={draft} onClose={() => setDraft(null)} />
    </main>
  )
}

function RouteSheet({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const toast = useToast()
  const formId = useId()
  const nameId = useId()
  const dateId = useId()
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO())

  useEffect(() => {
    if (draft) {
      setName(draft.name)
      setDate(draft.date)
    }
  }, [draft])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    actions.saveRoute({ ...draft, name: name.trim() || 'Namnlös runda', date: date || todayISO() })
    toast({ text: 'Rutten är sparad' })
    onClose()
  }

  return (
    <Sheet
      open={!!draft}
      onClose={onClose}
      title="Spara rutt"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            Spara
          </button>
        </>
      }
    >
      {draft && (
        <form id={formId} onSubmit={submit} className="grid gap-5">
          <div className="glass-inset grid place-items-center p-3">
            <RoutePreview points={draft.points} className="h-40 w-full" />
            <p className="tabular mt-1 text-sm font-medium text-ink-muted">
              {formatDistance(draft.distance)} · {formatDuration(draft.duration)} · {draft.points.length} punkter
            </p>
          </div>
          <div>
            <label htmlFor={nameId} className="field-label">
              Namn
            </label>
            <input id={nameId} className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor={dateId} className="field-label">
              Datum
            </label>
            <input id={dateId} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </form>
      )}
    </Sheet>
  )
}

/** Live-inspelning med Geolocation API. Kräver https (eller localhost) och att sidan är öppen. */
function Recorder({ onDone, onCancel }: { onDone: (points: [number, number][], duration: number) => void; onCancel: () => void }) {
  const [points, setPoints] = useState<[number, number][]>([])
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const start = useRef(Date.now())
  const pts = useRef<[number, number][]>([])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Din webbläsare stöder inte platstjänster.')
      return
    }
    let lock: { release: () => Promise<void> } | undefined
    ;(navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})

    const watch = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy > 60) return
        const next: [number, number] = [p.coords.latitude, p.coords.longitude]
        const last = pts.current[pts.current.length - 1]
        if (last && haversine({ lat: last[0], lng: last[1] }, { lat: next[0], lng: next[1] }) < 5) return
        pts.current = [...pts.current, next]
        setPoints(pts.current)
        setError('')
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'Platsåtkomst nekades. Tillåt plats i webbläsaren för att spela in.' : 'Söker GPS-signal…'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    const tick = window.setInterval(() => setElapsed(Math.round((Date.now() - start.current) / 1000)), 1000)
    return () => {
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(tick)
      lock?.release().catch(() => {})
    }
  }, [])

  return (
    <section className="glass-strong rise mb-8 grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6" aria-live="polite" aria-label="Inspelning pågår">
      <div className="grid size-28 place-items-center rounded-3xl bg-sage-100/80">
        {points.length > 1 ? (
          <RoutePreview points={points} className="size-24" />
        ) : (
          <span className="relative flex size-4">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-lingon/60" />
            <span className="relative inline-flex size-4 rounded-full bg-lingon" />
          </span>
        )}
      </div>
      <div>
        <p className="eyebrow flex items-center gap-2 !text-lingon">
          <span className="size-2 animate-pulse rounded-full bg-lingon" aria-hidden="true" /> Spelar in
        </p>
        <p className="tabular mt-1 text-3xl font-semibold">{clock(elapsed)}</p>
        <p className="tabular text-sm text-ink-muted">
          {formatDistance(pathLength(points))} · {points.length} punkter
        </p>
        {error && <p className="mt-1 text-sm font-medium text-danger">{error}</p>}
        <p className="mt-2 text-xs text-ink-muted">Håll sidan öppen – webbläsare pausar GPS när fliken ligger i bakgrunden.</p>
      </div>
      <div className="flex gap-2 sm:flex-col">
        <button type="button" className="btn btn-primary flex-1" onClick={() => onDone(pts.current, elapsed)}>
          <Stop size={18} weight="fill" /> Avsluta
        </button>
        <button type="button" className="btn btn-ghost flex-1" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </section>
  )
}
