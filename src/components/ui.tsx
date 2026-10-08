import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Cherries, X, type IconProps } from '@phosphor-icons/react'
import type { Kind } from '../lib/types'

/** Svamp-ikon ritad i samma stil som Phosphor (256-viewBox, 16px linje). */
export function Mushroom({ size = 24, weight = 'regular', className, ...rest }: IconProps) {
  const sw = weight === 'bold' ? 20 : weight === 'light' ? 12 : 16
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" className={className} aria-hidden="true" {...(rest as object)}>
      <path
        d="M32 128a96 96 0 0 1 192 0 8 8 0 0 1-8 8H40a8 8 0 0 1-8-8Z"
        fill={weight === 'fill' || weight === 'duotone' ? 'currentColor' : 'none'}
        fillOpacity={weight === 'duotone' ? 0.2 : 1}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M96 136v64a24 24 0 0 0 24 24h16a24 24 0 0 0 24-24v-64" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="100" cy="88" r="10" fill="currentColor" />
      <circle cx="152" cy="76" r="8" fill="currentColor" />
      <circle cx="176" cy="108" r="7" fill="currentColor" />
    </svg>
  )
}

export function KindIcon({ kind, ...p }: { kind: Kind } & IconProps) {
  return kind === 'svamp' ? <Mushroom {...p} /> : <Cherries {...p} />
}

export function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        kind === 'svamp' ? 'bg-chanterelle-soft text-[#7a4f0a]' : 'bg-lingon-soft text-lingon'
      }`}
    >
      <KindIcon kind={kind} size={14} weight="bold" />
      {kind === 'svamp' ? 'Svamp' : 'Bär'}
    </span>
  )
}

export function YieldDots({ value }: { value: 1 | 2 | 3 }) {
  const label = ['Några få', 'Bra', 'Fantastiskt'][value - 1]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted" title={`Avkastning: ${label}`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`size-1.5 rounded-full ${n <= value ? 'bg-forest-600' : 'bg-sage-300/60'}`} />
        ))}
      </span>
      {label}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  icon,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  icon?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center gap-3">
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sage-100 text-forest-700">{icon}</span>}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-forest-900">
          {label}
        </label>
        {description && <p className="text-xs text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] ${
          checked ? 'bg-forest-600' : 'bg-sage-300/70'
        }`}
        style={{ boxShadow: 'inset 0 1px 3px rgb(23 42 31 / 0.18)' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform duration-300 ease-[var(--ease-soft)] ${
            checked ? 'translate-x-5' : ''
          }`}
          style={{ boxShadow: '0 2px 6px rgb(23 42 31 / 0.3)' }}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="glass-inset grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-[0.8rem] px-2 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${
              active ? 'bg-white text-forest-900 shadow-[0_4px_12px_-6px_rgb(20_30_0/0.35)]' : 'text-ink-muted hover:text-forest-800'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  format?: (v: number) => string
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-forest-900">
          {label}
        </label>
        <span className="tabular text-xs font-semibold text-ink-muted">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${pct}%` }}
      />
    </div>
  )
}

export function DualRange({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  labelMin,
  labelMax,
}: {
  value: [number, number]
  onChange: (v: [number, number]) => void
  min?: number
  max?: number
  step?: number
  labelMin: string
  labelMax: string
}) {
  const [lo, hi] = value
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <div className="dual-range">
      <div className="track">
        <div className="track-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      </div>
      <input
        type="range"
        className="range"
        aria-label={labelMin}
        min={min}
        max={max}
        step={step}
        value={lo}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
        aria-valuetext={`${lo} %`}
      />
      <input
        type="range"
        className="range"
        aria-label={labelMax}
        min={min}
        max={max}
        step={step}
        value={hi}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
        aria-valuetext={`${hi} %`}
      />
    </div>
  )
}

/** Modal byggd på <dialog>: inbyggd fokusfälla, Esc stänger, bottenark på mobil. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // fokusera första fältet på datorer; på mobil vill vi inte fälla upp tangentbordet direkt
      if (window.matchMedia('(pointer: fine)').matches) {
        d.querySelector<HTMLElement>('input:not(.sr-only), select, textarea')?.focus()
      }
    }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="glass-strong flex max-h-[inherit] flex-col overflow-hidden max-sm:rounded-b-none">
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-sage-300/80 sm:hidden" aria-hidden="true" />
          <header className="flex items-center justify-between gap-4 px-6 pt-4 pb-2 sm:pt-6">
            <h2 id={titleId} className="text-xl font-semibold text-forest-900">
              {title}
            </h2>
            <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Stäng">
              <X size={20} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-6">{children}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-white/70 bg-white/30 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="glass glass-sheen flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sage-100 text-forest-700">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text?: string; actions?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {text && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-muted">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
