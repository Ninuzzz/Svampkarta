import { useMemo, useState } from 'react'
import { Copy, MagnifyingGlass, MapPin, MapTrifold, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { actions, useData } from '../lib/store'
import { href } from '../lib/router'
import { formatCoord, formatDate } from '../lib/geo'
import { EmptyState, KindBadge, PageHeader, Segmented, YieldDots } from '../components/ui'
import { PlaceForm, type PlaceDraft } from '../components/PlaceForm'
import { useToast } from '../components/Toast'
import type { Kind, Place } from '../lib/types'

type KindFilter = 'alla' | Kind
type Sort = 'senast' | 'namn' | 'avkastning'

export default function PlacesView() {
  const { places, logs } = useData()
  const toast = useToast()
  const [draft, setDraft] = useState<PlaceDraft | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('alla')
  const [sort, setSort] = useState<Sort>('senast')

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return places
      .filter((p) => kind === 'alla' || p.kind === kind)
      .filter((p) => !needle || `${p.name} ${p.species} ${p.notes}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === 'namn' ? a.name.localeCompare(b.name, 'sv') : sort === 'avkastning' ? b.yield - a.yield : b.updatedAt.localeCompare(a.updatedAt),
      )
  }, [places, q, kind, sort])

  function remove(p: Place) {
    const before = actions.snapshot()
    actions.deletePlace(p.id)
    toast({ text: `”${p.name}” togs bort`, action: { label: 'Ångra', run: () => actions.restore(before) } })
  }

  const visitsFor = (id: string) => logs.filter((l) => l.placeId === id).length

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-36 sm:px-6 lg:pt-32 lg:pb-20">
      <PageHeader
        eyebrow="Samling"
        title="Mina platser"
        text="Dina hemliga svamp- och bärställen med exakta koordinater."
        // tom lista: knappen finns redan i den tomma rutan nedanför
        actions={
          places.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => setDraft({})}>
              <Plus size={18} weight="bold" /> Ny plats
            </button>
          )
        }
      />

      {places.length > 0 && (
        <div className="glass mb-6 grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div className="relative">
            <label htmlFor="place-search" className="sr-only">
              Sök bland platser
            </label>
            <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sage-600" aria-hidden="true" />
            <input
              id="place-search"
              type="search"
              className="field !rounded-full !pl-11"
              placeholder="Sök namn, art eller anteckning"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="sm:w-64">
            <Segmented
              label="Typ"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'alla', label: 'Alla' },
                { value: 'svamp', label: 'Svamp' },
                { value: 'bar', label: 'Bär' },
              ]}
            />
          </div>
          <div>
            <label htmlFor="place-sort" className="sr-only">
              Sortera
            </label>
            <select id="place-sort" className="field !rounded-full sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="senast">Senast ändrad</option>
              <option value="namn">Namn A–Ö</option>
              <option value="avkastning">Bäst avkastning</option>
            </select>
          </div>
        </div>
      )}

      {places.length === 0 ? (
        <EmptyState
          icon={<MapPin size={28} />}
          title="Inga platser ännu"
          text="Spara ditt första smultronställe – ange koordinater eller klicka direkt på kartan."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setDraft({})}>
                <Plus size={18} weight="bold" /> Ny plats
              </button>
              <a href={href('karta')} className="btn btn-glass">
                <MapTrifold size={18} /> Till kartan
              </a>
            </div>
          }
        />
      ) : visible.length === 0 ? (
        <p className="glass p-6 text-center text-sm text-ink-muted">Inga platser matchar filtret.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p, i) => (
            <li key={p.id} className="glass glass-sheen card-hover rise flex flex-col p-6" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <KindBadge kind={p.kind} />
                <YieldDots value={p.yield} />
              </div>
              <h2 className="mt-4 text-xl font-semibold">{p.name}</h2>
              {p.species && <p className="text-sm font-medium text-sage-600">{p.species}</p>}
              {p.notes && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-forest-800">{p.notes}</p>}

              <div className="glass-inset mt-5 flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
                <span className="tabular truncate text-xs font-medium text-ink-muted">{formatCoord(p.lat, p.lng)}</span>
                <button
                  type="button"
                  className="icon-btn !size-9"
                  aria-label={`Kopiera koordinater för ${p.name}`}
                  onClick={() => navigator.clipboard?.writeText(formatCoord(p.lat, p.lng)).then(() => toast({ text: 'Koordinaterna är kopierade' }))}
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                {visitsFor(p.id) ? `${visitsFor(p.id)} loggade besök · ` : ''}Ändrad {formatDate(p.updatedAt, { day: 'numeric', month: 'short' })}
              </p>

              <div className="mt-auto flex items-center gap-1 pt-5">
                <a href={href('karta', { place: p.id })} className="btn btn-primary flex-1 !min-h-10">
                  <MapTrifold size={18} /> Visa på karta
                </a>
                <button type="button" className="icon-btn" aria-label={`Redigera ${p.name}`} onClick={() => setDraft(p)}>
                  <PencilSimple size={18} />
                </button>
                <button type="button" className="icon-btn !text-danger" aria-label={`Ta bort ${p.name}`} onClick={() => remove(p)}>
                  <Trash size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PlaceForm open={!!draft} draft={draft} onClose={() => setDraft(null)} />
    </main>
  )
}
