import { useMemo, useState } from 'react'
import L from 'leaflet'
import { Marker, Polygon } from 'react-leaflet'
import { Globe, MagnifyingGlass, MapPinArea, Plus, X } from '@phosphor-icons/react'
import { useShapes, type Kommun } from '../lib/kommuner'

/** Ett valt områdes gräns (streckad, som på svampkarta.se) + grannarna som klickbara knappar. */
export function AreaOutlines({
  index,
  selected,
  onAdd,
}: {
  index: Kommun[]
  selected: string[]
  onAdd: (id: string) => void
}) {
  const shapes = useShapes(selected)
  const neighbors = useMemo(() => {
    const ids = new Set(selected.flatMap((id) => index.find((k) => k.id === id)?.neighbors ?? []))
    selected.forEach((id) => ids.delete(id))
    return index.filter((k) => ids.has(k.id))
  }, [index, selected])

  return (
    <>
      {shapes.map((s) =>
        s.polygons.map((poly, i) => (
          <Polygon
            key={`${s.id}-${i}`}
            positions={poly.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]))}
            interactive={false}
            pathOptions={{ color: '#fffbeb', weight: 2.5, opacity: 0.95, dashArray: '7 6', fill: false }}
          />
        )),
      )}
      {neighbors.map((k) => (
        <Marker
          key={k.id}
          position={k.center}
          icon={L.divIcon({ className: '', html: `<button type="button" class="area-chip">＋ ${k.name}</button>`, iconSize: [0, 0], iconAnchor: [0, 0] })}
          title={`Lägg till ${k.name}`}
          eventHandlers={{ click: () => onAdd(k.id) }}
          zIndexOffset={300}
        />
      ))}
    </>
  )
}

/** Panelkort: valda områden, grannar och sök efter valfri kommun. */
export function AreaCard({
  index,
  selected,
  wholeView,
  onChange,
  onWholeView,
  onFocus,
}: {
  index: Kommun[] | null
  selected: string[]
  wholeView: boolean
  onChange: (ids: string[]) => void
  onWholeView: (v: boolean) => void
  onFocus: (k: Kommun) => void
}) {
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map((index ?? []).map((k) => [k.id, k])), [index])
  const chosen = selected.map((id) => byId.get(id)).filter((k): k is Kommun => !!k)
  const neighbors = useMemo(() => {
    const ids = new Set(chosen.flatMap((k) => k.neighbors))
    selected.forEach((id) => ids.delete(id))
    return [...ids].map((id) => byId.get(id)).filter((k): k is Kommun => !!k).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [chosen, selected, byId])
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2 || !index) return []
    return index.filter((k) => k.name.toLowerCase().startsWith(t) && !selected.includes(k.id)).slice(0, 6)
  }, [q, index, selected])

  const add = (k: Kommun) => {
    onChange([...selected, k.id])
    onWholeView(false)
    setQ('')
    onFocus(k)
  }

  return (
    <div className="card-plain" data-tour="area">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="card-title !mb-0 flex items-center gap-1.5">
          <MapPinArea size={16} weight="bold" className="text-sage-600" /> Område
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={wholeView}
          onClick={() => onWholeView(!wholeView)}
          className={`chip !min-h-8 !px-3 !text-[12px] ${wholeView ? '' : ''}`}
          title="Analysera allt som syns på kartan i stället för valda kommuner"
        >
          <Globe size={14} /> Hela kartvyn
        </button>
      </div>

      {wholeView ? (
        <p className="text-[12px] text-ink-muted">Analyserar allt som syns på kartan. Välj kommuner för att begränsa och göra kartan snabbare.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label="Valda områden">
            {chosen.map((k) => (
              <li key={k.id} className="inline-flex items-center gap-1 rounded-full bg-forest-700 py-1 pr-1 pl-3 text-[13px] font-semibold text-bone">
                <button type="button" onClick={() => onFocus(k)} className="hover:underline" title={`Visa ${k.name}`}>
                  {k.name}
                </button>
                <button
                  type="button"
                  aria-label={`Ta bort ${k.name}`}
                  className="grid size-6 place-items-center rounded-full hover:bg-white/15"
                  onClick={() => onChange(selected.filter((id) => id !== k.id))}
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            ))}
            {!chosen.length && <li className="text-[12px] text-ink-muted">Inget område valt – välj en kommun nedan.</li>}
          </ul>

          {neighbors.length > 0 && (
            <>
              <p className="mt-3 mb-1.5 text-[11px] font-bold tracking-wide text-ink-muted uppercase">Närliggande</p>
              <div className="flex flex-wrap gap-1.5">
                {neighbors.map((k) => (
                  <button key={k.id} type="button" className="chip !min-h-8 !px-2.5 !text-[12px]" onClick={() => add(k)}>
                    <Plus size={12} weight="bold" /> {k.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="relative mt-3">
        <label htmlFor="kommun-search" className="sr-only">
          Lägg till kommun
        </label>
        <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sage-600" aria-hidden="true" />
        <input
          id="kommun-search"
          className="field !min-h-10 !rounded-full !py-1.5 !pl-10 !text-sm"
          placeholder={index ? 'Lägg till valfri kommun…' : 'Laddar kommuner…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && matches[0] && add(matches[0])}
          autoComplete="off"
        />
        {matches.length > 0 && (
          <ul className="glass-strong absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden !rounded-2xl p-1">
            {matches.map((k) => (
              <li key={k.id}>
                <button type="button" onClick={() => add(k)} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-white/80">
                  {k.name} kommun
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
