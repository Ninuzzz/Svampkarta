import { BookOpenText, Books, House, MapPin, MapTrifold, Path, Question, type Icon } from '@phosphor-icons/react'
import { useTour } from './Tour'
import { href, type View } from '../lib/router'
import { BRAND } from '../lib/brand'

const ITEMS: { view: View; label: string; icon: Icon }[] = [
  { view: 'hem', label: 'Hem', icon: House },
  { view: 'karta', label: 'Karta', icon: MapTrifold },
  { view: 'guide', label: 'Arter', icon: Books },
  { view: 'platser', label: 'Platser', icon: MapPin },
  { view: 'dagbok', label: 'Dagbok', icon: BookOpenText },
  { view: 'rutter', label: 'Rutter', icon: Path },
]

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href={href('hem')} className="flex items-center gap-2.5 rounded-full" aria-label={`${BRAND.name} – till startsidan`}>
      <img src="/favicon.svg" alt="" width={36} height={36} className="size-9 rounded-xl shadow-[0_6px_14px_-6px_rgb(20_30_0/0.6)]" />
      {!compact && <span className="text-[17px] font-bold tracking-tight">{BRAND.name}</span>}
    </a>
  )
}

/** Flytande glas-navigering: toppill på desktop, flikfält i botten på mobil. */
export function Nav({ current }: { current: View }) {
  const tour = useTour()
  return (
    <>
      {/* Desktop */}
      <nav aria-label="Huvudmeny" className="pointer-events-none fixed inset-x-0 top-4 z-[1000] hidden justify-center px-6 lg:flex">
        <div className="glass pointer-events-auto flex items-center gap-1 !rounded-full p-1.5 pr-1.5 pl-3">
          <Logo />
          <span className="mx-3 h-6 w-px bg-sage-300/70" aria-hidden="true" />
          {ITEMS.map(({ view, label, icon: I }) => {
            const active = view === current
            return (
              <a
                key={view}
                href={href(view)}
                data-tour={`nav-${view}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${
                  active
                    ? 'bg-forest-700 text-bone shadow-[0_8px_18px_-8px_rgb(20_30_0/0.6)]'
                    : 'text-forest-800 hover:bg-white/70'
                }`}
              >
                <I size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {label}
              </a>
            )
          })}
          <span className="mx-1 h-6 w-px bg-sage-300/70" aria-hidden="true" />
          <button type="button" onClick={tour.start} className="icon-btn !size-10" aria-label="Visa guiden" title="Visa guiden">
            <Question size={20} />
          </button>
        </div>
      </nav>

      {/* Mobil */}
      <nav
        aria-label="Huvudmeny"
        className="fixed inset-x-0 bottom-0 z-[1000] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="glass-strong mx-auto grid max-w-md grid-cols-6 !rounded-[1.75rem] p-1.5">
          {ITEMS.map(({ view, label, icon: I }) => {
            const active = view === current
            return (
              <a
                key={view}
                href={href(view)}
                data-tour={`nav-${view}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.2rem] text-[11px] font-semibold transition-[background-color,color] duration-200 ${
                  active ? 'bg-forest-700 text-bone' : 'text-forest-800 active:bg-white/70'
                }`}
              >
                <I size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {label}
              </a>
            )
          })}
        </div>
      </nav>
    </>
  )
}
