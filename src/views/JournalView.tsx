import { useMemo, useState } from 'react'
import { BookOpenText, MapPin, PencilSimple, Plus, Thermometer, Trash } from '@phosphor-icons/react'
import { actions, useData } from '../lib/store'
import { href } from '../lib/router'
import { formatDate } from '../lib/geo'
import { EmptyState, PageHeader } from '../components/ui'
import { LogForm, PhotoThumb, WEATHER } from '../components/LogForm'
import { useToast } from '../components/Toast'
import type { LogEntry } from '../lib/types'

export default function JournalView() {
  const { logs, places } = useData()
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<LogEntry> | null>(null)

  // gruppera per månad för en dagbokskänsla
  const groups = useMemo(() => {
    const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date))
    const map = new Map<string, LogEntry[]>()
    for (const l of sorted) {
      const key = l.date.slice(0, 7)
      map.set(key, [...(map.get(key) ?? []), l])
    }
    return [...map.entries()]
  }, [logs])

  function remove(l: LogEntry) {
    const before = actions.snapshot()
    actions.deleteLog(l.id)
    // fotona ligger kvar i IndexedDB tills vidare så att "Ångra" fungerar
    toast({ text: 'Anteckningen togs bort', action: { label: 'Ångra', run: () => actions.restore(before) } })
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-36 sm:px-6 lg:pt-32 lg:pb-20">
      <PageHeader
        eyebrow="Samling"
        title="Anteckningar & bilder"
        text="Datum, väder och vad du hittade på dina rundor."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={18} weight="bold" /> Logga runda
          </button>
        }
      />

      {logs.length === 0 ? (
        <EmptyState
          icon={<BookOpenText size={28} />}
          title="Dagboken är tom"
          text="Efter nästa runda: logga väder, fynd och ta med några bilder."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
              <Plus size={18} weight="bold" /> Logga runda
            </button>
          }
        />
      ) : (
        <div className="grid gap-12">
          {groups.map(([month, entries]) => (
            <section key={month} aria-label={formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}>
              <h2 className="eyebrow mb-4">{formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
              <ol className="relative grid gap-5 border-l border-sage-300/70 pl-6 sm:pl-8">
                {entries.map((l) => {
                  const W = WEATHER.find((w) => w.value === l.weather)!
                  const place = places.find((p) => p.id === l.placeId)
                  return (
                    <li key={l.id} className="relative">
                      <span
                        className="absolute top-7 -left-[31px] grid size-3.5 place-items-center rounded-full border-2 border-bone bg-forest-600 shadow sm:-left-[39px]"
                        aria-hidden="true"
                      />
                      <article className="glass glass-sheen p-5 sm:p-6">
                        <header className="flex items-start justify-between gap-3">
                          <div>
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-muted">
                              <time dateTime={l.date}>{formatDate(l.date, { weekday: 'long', day: 'numeric', month: 'long' })}</time>
                              <span className="inline-flex items-center gap-1">
                                <W.icon size={15} aria-hidden="true" /> {W.label}
                              </span>
                              {l.temperature != null && (
                                <span className="tabular inline-flex items-center gap-1">
                                  <Thermometer size={15} aria-hidden="true" /> {l.temperature}°C
                                </span>
                              )}
                            </p>
                            <h3 className="mt-1.5 text-xl font-semibold">{l.title}</h3>
                          </div>
                          <div className="-mt-1 -mr-2 flex shrink-0">
                            <button type="button" className="icon-btn" aria-label={`Redigera ${l.title}`} onClick={() => setEditing(l)}>
                              <PencilSimple size={18} />
                            </button>
                            <button type="button" className="icon-btn !text-danger" aria-label={`Ta bort ${l.title}`} onClick={() => remove(l)}>
                              <Trash size={18} />
                            </button>
                          </div>
                        </header>

                        {l.findings.length > 0 && (
                          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Fynd">
                            {l.findings.map((f, i) => (
                              <li key={i} className="glass-inset !rounded-full px-3 py-1.5 text-[13px]">
                                <span className="font-semibold">{f.species}</span>
                                {f.amount && <span className="text-ink-muted"> · {f.amount}</span>}
                              </li>
                            ))}
                          </ul>
                        )}

                        {l.notes && <p className="mt-4 text-[15px] leading-relaxed text-forest-800">{l.notes}</p>}

                        {l.photoIds.length > 0 && (
                          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {l.photoIds.map((id, i) => (
                              <PhotoThumb key={id} id={id} alt={`${l.title}, bild ${i + 1}`} className="aspect-square w-full rounded-2xl" />
                            ))}
                          </div>
                        )}

                        {place && (
                          <a
                            href={href('karta', { place: place.id })}
                            className="mt-5 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-sage-100/80 px-3 text-[13px] font-semibold text-forest-700 hover:bg-sage-200/80"
                          >
                            <MapPin size={15} weight="fill" /> {place.name}
                          </a>
                        )}
                      </article>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <LogForm open={!!editing} entry={editing} onClose={() => setEditing(null)} />
    </main>
  )
}
