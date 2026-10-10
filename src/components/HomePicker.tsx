import { useMemo, useState } from 'react'
import { Crosshair, MagnifyingGlass, MapPinArea, SpinnerGap, X } from '@phosphor-icons/react'
import { kommunOf, useKommunIndex, type Kommun } from '../lib/kommuner'
import { getCurrentPosition } from '../lib/geo'

/**
 * Välj hemområde: sök bland landets kommuner eller använd positionen. Kommunen räknas ut i
 * webbläsaren ur de sparade gränserna – positionen skickas inte någonstans.
 */
export function HomePicker({ current, onPick, onClose, className = '' }: { current?: string | null; onPick: (k: Kommun) => void; onClose?: () => void; className?: string }) {
  const index = useKommunIndex()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t || !index) return []
    const by = (a: Kommun, b: Kommun) => a.name.localeCompare(b.name, 'sv')
    const starts = index.filter((k) => k.name.toLowerCase().startsWith(t)).sort(by)
    const inside = t.length > 2 ? index.filter((k) => !starts.includes(k) && k.name.toLowerCase().includes(t)).sort(by) : []
    return [...starts, ...inside].slice(0, 6)
  }, [q, index])

  async function locate() {
    setBusy(true)
    setError('')
    try {
      const p = await getCurrentPosition()
      const k = await kommunOf(p.lat, p.lng)
      if (k) onPick(k)
      else setError('Positionen ligger inte i någon svensk kommun. Sök efter kommunen i stället.')
    } catch (e) {
      setError((e as Error).message || 'Positionen gick inte att läsa av. Sök efter kommunen i stället.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`glass-strong !rounded-3xl p-4 ${className}`} data-home-picker>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-forest-700 text-amber" aria-hidden="true">
          <MapPinArea size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight font-bold">{current ? 'Byt område' : 'Var letar du?'}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
            {current ? `Nu: ${current}. Välj en annan kommun.` : 'Välj din kommun, så visar vi svampväder och karta där.'}
          </p>
        </div>
        {onClose && (
          <button type="button" className="icon-btn -mt-1.5 -mr-1.5" aria-label="Stäng" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <label htmlFor="home-search" className="sr-only">
          Sök kommun
        </label>
        <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sage-600" aria-hidden="true" />
        <input
          id="home-search"
          className="field !min-h-11 !rounded-full !py-1.5 !pl-10 !text-base"
          placeholder={index ? 'Sök kommun, t.ex. Umeå' : 'Laddar kommuner…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && matches[0] && onPick(matches[0])}
          autoComplete="off"
          enterKeyHint="done"
        />
      </div>
      {matches.length > 0 && (
        <ul className="mt-2 grid gap-0.5" aria-label="Kommuner">
          {matches.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => onPick(k)} className="flex min-h-11 w-full items-center rounded-2xl px-3.5 text-left text-sm font-semibold hover:bg-white/80">
                {k.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length > 1 && index && !matches.length && <p className="mt-2 px-1 text-[13px] text-ink-muted">Ingen kommun heter så. Prova början av namnet.</p>}

      <button type="button" className="chip mt-2.5 !min-h-11 w-full justify-center !text-[14px]" onClick={locate} disabled={busy}>
        {busy ? <SpinnerGap size={16} className="animate-spin" /> : <Crosshair size={16} weight="bold" />} Använd min position
      </button>
      {error && (
        <p className="mt-2 px-1 text-[13px] text-lingon" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 px-1 text-[12px] leading-snug text-ink-muted">Valet sparas bara på den här enheten, och positionen skickas inte någonstans.</p>
    </div>
  )
}
