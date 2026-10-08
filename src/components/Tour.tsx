import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpenText, Cherries, Crosshair, MapPin, NavigationArrow, Path, ShieldCheck, SlidersHorizontal, Sparkle, X } from '@phosphor-icons/react'
import { navigate, useRoute, type View } from '../lib/router'
import { BRAND } from '../lib/brand'
import { HOME } from '../lib/home'
import { SpeciesIcon } from './SpeciesIcon'
import { Mushroom } from './ui'

/* ------------------------------------------------------------------ */
/*  Stegen                                                             */
/* ------------------------------------------------------------------ */

interface Step {
  view?: View
  /** CSS-väljare i prioritetsordning – första synliga elementet lyses upp */
  targets?: string[]
  title: string
  text: ReactNode
  art?: ReactNode
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#fde3cf] px-2 py-0.5 text-xs font-bold text-[#9a3412]">{children}</span>
)

const STEPS: Step[] = [
  {
    view: 'hem',
    title: `Välkommen till ${BRAND.name}`,
    text: (
      <>
        {BRAND.name} visar var chansen är störst att hitta svamp och bär, utifrån skog, jordart, terräng och väder. Dina egna ställen stannar hemliga hos dig.
        Den här guiden tar ungefär en minut.
      </>
    ),
    art: (
      <div className="flex items-center justify-center gap-3 py-2">
        <img src="/favicon.svg" alt="" className="size-16 rounded-2xl shadow-[0_12px_24px_-12px_rgb(20_30_0/0.6)]" />
        <div className="flex -space-x-2">
          {(['kantarell', 'trattkantarell', 'karljohan', 'lingon'] as const).map((id) => (
            <SpeciesIcon key={id} id={id} size={30} className="size-11 rounded-full bg-white ring-2 ring-bone" />
          ))}
        </div>
      </div>
    ),
  },
  {
    view: 'hem',
    targets: ['[data-tour="season"]'],
    title: 'Vad finns just nu?',
    text: `Startsidan visar dagens svampväder och vilka arter som är bäst just nu runt ${HOME.name}. Tryck på en art för att leta efter den på kartan.`,
  },
  {
    view: 'karta',
    targets: ['[data-tour="species"]', '[data-tour="species-pill"]'],
    title: 'Välj vad du letar efter',
    text: (
      <>
        Välj en art, alla svampar eller alla bär. Kartan färgas där chansen är hög – ju mer orange, desto bättre. Etiketten <Chip>Säsong nu</Chip> visar vad som
        växer just nu.
        <span className="mt-1 block text-ink-muted lg:hidden">Tryck på knappen längst ner för att byta art.</span>
      </>
    ),
  },
  {
    view: 'karta',
    targets: ['[data-tour="area"]', '[data-tour="filter-btn"]'],
    title: 'Välj område',
    text: (
      <>
        Algoritmen analyserar bara de kommuner du valt – det gör kartan snabb. Lägg till grannkommuner med <b>＋</b>-knapparna på kartan, sök fram valfri kommun,
        eller välj <b>Hela kartvyn</b>.
      </>
    ),
  },
  {
    view: 'karta',
    targets: ['[data-tour="min-chance"]', '[data-tour="species-pill"]'],
    title: 'Filtrera på chans',
    text: (
      <>
        Dra reglaget <b>Visa bara chans över</b> för att dölja allt under en viss procent, och <b>Minsta område</b> för att slippa småfläckar – då
        syns bara stora, sammanhängande och lovande områden.
        <span className="mt-1 block text-ink-muted lg:hidden">På mobilen hittar du reglaget när du trycker på knappen längst ner.</span>
      </>
    ),
    art: (
      <div className="rounded-2xl bg-sand-100/70 p-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>Visa bara chans över</span>
          <Chip>40 %</Chip>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-[#ffec78] via-[#ffb81c] to-[#f04600]" />
      </div>
    ),
  },
  {
    view: 'karta',
    targets: ['[data-tour="hotspots"]'],
    title: 'De bästa områdena',
    text: 'Algoritmen markerar topparna med artikon och procent direkt på kartan. Tryck i listan för att flyga dit.',
    art: (
      <div className="flex flex-wrap justify-center gap-2 py-1">
        {(
          [
            ['trattkantarell', 62],
            ['kantarell', 54],
            ['karljohan', 47],
          ] as const
        ).map(([id, p], i) => (
          <span key={id} className={`hs ${i === 0 ? 'hs-top' : ''}`} style={{ cursor: 'default' }}>
            <span className="hs-ico">
              <SpeciesIcon id={id} size={24} />
            </span>
            <b>{p}%</b>
          </span>
        ))}
      </div>
    ),
  },
  {
    view: 'karta',
    title: 'Tryck var som helst i skogen',
    text: (
      <>
        Då analyserar {BRAND.name} just den platsen: skogstyp, jordart, höjd och avstånd till väg, samt vilka arter som trivs där. Under <b>Varför?</b> ser du
        exakt vad som höjer eller sänker chansen – även skogens ålder och närhet till stig. Efter rundan trycker du <b>Hittade</b> eller{' '}
        <b>Hittade inget</b>, så lär sig algoritmen av dig.
      </>
    ),
    art: (
      <div className="rounded-2xl border border-sand-200 bg-white/80 p-3 text-left">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#26523a]" />
          <b className="text-sm">Granskog</b>
          <span className="text-xs text-ink-muted">· Fuktig · Morän</span>
        </div>
        <div className="mt-2 grid gap-1.5 text-[11px]">
          {[
            ['Skogstyp', 95],
            ['Jordart', 100],
            ['Terräng', 80],
            ['Väder', 70],
          ].map(([l, v]) => (
            <div key={l} className="grid grid-cols-[60px_1fr] items-center gap-2">
              <span className="font-semibold">{l}</span>
              <span className="h-1.5 rounded-full bg-sand-100">
                <span className="block h-full rounded-full bg-forest-600" style={{ width: `${v}%` }} />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <span className="grid h-7 place-items-center rounded-full bg-forest-700 text-[11px] font-bold text-bone">Spara</span>
          <span className="flex h-7 items-center justify-center gap-1 rounded-full border border-forest-700 text-[11px] font-bold">
            <NavigationArrow size={11} weight="bold" className="rotate-90" /> Hitta hit
          </span>
        </div>
      </div>
    ),
  },
  {
    view: 'karta',
    targets: ['[data-tour="tabs"]', '[data-tour="filter-btn"]'],
    title: 'Filtrera skogar själv',
    text: 'Under Skogsfilter väljer du själv till exempel äldre granskog på fuktig mark, torr tallskog eller lövskog. Där finns också flygfoto, terrängskuggning och dina rutter som kartlager.',
    art: (
      <div className="flex justify-center gap-2 py-1 text-forest-700">
        <SlidersHorizontal size={28} />
        <Crosshair size={28} />
      </div>
    ),
  },
  {
    targets: ['[data-tour="nav-guide"]'],
    title: 'Artguiden',
    text: 'Under Arter finns bilder, fakta och kännetecken för alla svampar och bär – och vilka giftiga arter du ska se upp för, med tydliga skillnader.',
    art: (
      <div className="flex justify-center gap-2 py-1">
        {(['kantarell', 'trattkantarell', 'blabar'] as const).map((id) => (
          <SpeciesIcon key={id} id={id} size={30} className="size-11 rounded-full bg-white ring-2 ring-bone" />
        ))}
      </div>
    ),
  },
  {
    targets: ['[data-tour="nav-platser"]'],
    title: 'Dina guldställen',
    text: `Spara platser med art och avkastning. De visas på kartan med artikon, och algoritmen lär sig av dem: chansen höjs i liknande skog nära dina fynd.`,
    art: (
      <div className="flex justify-center gap-3 py-1 text-forest-700">
        <MapPin size={28} weight="duotone" />
        <Sparkle size={28} weight="duotone" className="text-amber" />
      </div>
    ),
  },
  {
    targets: ['[data-tour="nav-dagbok"]'],
    title: 'Dagbok och rutter',
    text: 'Logga rundor med datum, väder, fynd och bilder. Under Rutter spelar du in promenader med GPS eller importerar GPX från klockan, så att du hittar tillbaka.',
    art: (
      <div className="flex justify-center gap-3 py-1 text-forest-700">
        <BookOpenText size={28} weight="duotone" />
        <Path size={28} weight="duotone" />
        <Cherries size={28} weight="duotone" className="text-lingon" />
      </div>
    ),
  },
  {
    title: 'Klart – lycka till i skogen!',
    text: (
      <>
        Allt du sparar stannar i den här webbläsaren – inga konton, inga prenumerationer. Du hittar guiden igen under <b>?</b>-knappen.
      </>
    ),
    art: (
      <div className="flex items-center justify-center gap-3 py-1 text-forest-700">
        <ShieldCheck size={30} weight="duotone" />
        <Mushroom size={30} weight="duotone" />
      </div>
    ),
  },
]

/* ------------------------------------------------------------------ */
/*  Kontext                                                            */
/* ------------------------------------------------------------------ */

const DONE_KEY = 'mycel:tour-done'
const Ctx = createContext<{ start: () => void }>({ start: () => {} })
export const useTour = () => useContext(Ctx)

function visible(el: Element) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

function findTarget(selectors: string[] | undefined) {
  for (const sel of selectors ?? []) {
    for (const el of document.querySelectorAll(sel)) if (visible(el)) return el as HTMLElement
  }
  return null
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null)
  const start = useCallback(() => setStep(0), [])

  // Visa guiden automatiskt första gången
  useEffect(() => {
    let seen = true
    try {
      seen = !!localStorage.getItem(DONE_KEY)
    } catch {
      /* privat läge */
    }
    if (seen) return
    const t = window.setTimeout(() => setStep(0), 900)
    return () => window.clearTimeout(t)
  }, [])

  const close = useCallback(() => {
    setStep(null)
    try {
      localStorage.setItem(DONE_KEY, '1')
    } catch {
      /* ignorera */
    }
  }, [])

  return (
    <Ctx.Provider value={{ start }}>
      {children}
      {step !== null && <TourOverlay step={step} setStep={setStep} onClose={close} />}
    </Ctx.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  Spotlight + kort                                                   */
/* ------------------------------------------------------------------ */

type Box = { left: number; top: number; width: number; height: number }
const same = (a: Box | null, b: Box | null) =>
  !!a && !!b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5

function TourOverlay({ step, setStep, onClose }: { step: number; setStep: (n: number) => void; onClose: () => void }) {
  const s = STEPS[step]
  const { view } = useRoute()
  // Målets ruta. Behålls mellan stegen så att spotlighten glider till nästa mål i stället för att blinka.
  const [rect, setRect] = useState<Box | null>(null)
  const [cardH, setCardH] = useState(0)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const card = useRef<HTMLDivElement>(null)
  // sant medan sidan rullar till nästa mål – då ligger kortet kvar där det är
  const [waiting, setWaiting] = useState(false)
  const lastPos = useRef<{ left: number; top: number } | null>(null)
  const last = step === STEPS.length - 1

  // Byt vy vid behov och följ målet varje bildruta (kartan laddas lat, sidan kan scrollas)
  useEffect(() => {
    const switching = !!s.view && s.view !== view
    if (switching) navigate(s.view!)
    let scrolled = false
    let raf = 0
    let current: Box | null | undefined
    const started = performance.now()
    // Vid vybyte: släpp spotlighten direkt och vänta tills nya vyn hunnit lägga sig, så att den inte hoppar runt
    if (switching) {
      current = null
      setRect(null)
    }
    const settleAt = started + (switching ? 700 : 0)
    // Medan sidan rullar till målet står spotlight och kort still – annars jagar de målet
    // och studsar fram och tillbaka. När rullningen stannat glider de dit i ett drag.
    let moving = false
    setWaiting(false)
    let lastTop = NaN
    let still = 0
    const follow = () => {
      const el = s.targets && performance.now() >= settleAt ? findTarget(s.targets) : null
      let next: Box | null | undefined = current
      if (el) {
        const r = el.getBoundingClientRect()
        if (!scrolled) {
          scrolled = true
          const vh = window.innerHeight
          // stora mål (högre än halva skärmen) visas från toppen, så att rubriken syns
          const big = r.height > vh * 0.5
          if (r.top < 8 || r.bottom > vh - 8) {
            el.scrollIntoView({ block: big ? 'start' : 'nearest', behavior: 'smooth' })
            moving = true
            setWaiting(true)
          }
        }
        if (moving) {
          still = Math.abs(r.top - lastTop) < 0.5 ? still + 1 : 0
          lastTop = r.top
          // stilla i fyra bildrutor (eller nödstopp efter 1,5 s) = framme
          if (still >= 4 || performance.now() - started > 1500) {
            moving = false
            setWaiting(false)
          }
        }
        if (!moving) next = { left: r.left, top: r.top, width: r.width, height: r.height }
      } else if (!s.targets || performance.now() - started > 1200) next = null
      // tills målet hittats ligger förra stegets spotlight kvar
      if (next !== undefined && (next ? !same(next, current ?? null) : current !== null)) {
        current = next
        setRect(next)
      }
      raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Kortets höjd styr placeringen – mät den när innehållet byts
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    setCardH(el.offsetHeight)
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    card.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') last ? onClose() : setStep(step + 1)
      if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, last, onClose, setStep])

  // Placera kortet: bredvid målet (dator), under, över, längst ner – eller mitt på skärmen.
  const { w: vw, h: vh } = vp
  const W = Math.min(380, vw - 32)
  const H = Math.min(cardH, vh - 32)
  const pad = 10
  const gap = pad + 14
  let left = (vw - W) / 2
  let top = (vh - H) / 2
  if (rect) {
    const centered = Math.min(Math.max(16, rect.left + rect.width / 2 - W / 2), vw - W - 16)
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height
    if (right + gap + W < vw - 16 && (rect.height > vh * 0.4 || (vw >= 1024 && right < vw * 0.35))) {
      left = right + gap
      top = Math.min(Math.max(16, Math.min(rect.top, vh * 0.35)), vh - H - 16)
    } else if (vh - bottom - gap - 16 >= H) {
      left = centered
      top = bottom + gap
    } else if (rect.top - gap - 16 >= H) {
      left = centered
      top = rect.top - gap - H
    } else {
      left = centered
      top = vh - H - 16
    }
  }
  if (waiting && lastPos.current) ({ left, top } = lastPos.current)
  else lastPos.current = { left, top }

  // Utan mål krymper hålet till en punkt mitt på skärmen – samma element, så allt glider
  const hole = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : { left: vw / 2, top: vh / 2, width: 0, height: 0 }

  return (
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div
        className="tour-glide pointer-events-none fixed top-0 left-0 rounded-[1.4rem]"
        style={{
          width: hole.width,
          height: hole.height,
          transform: `translate3d(${hole.left}px, ${hole.top}px, 0)`,
          boxShadow: `0 0 0 ${rect ? 3 : 0}px rgb(242 177 36 / 0.95), 0 0 0 9999px rgb(9 14 0 / ${rect ? 0.55 : 0.6})`,
        }}
        aria-hidden="true"
      />
      {/* fångar klick utanför kortet */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={card}
        tabIndex={-1}
        className={`glass-strong pointer-events-auto fixed top-0 left-0 flex flex-col overflow-y-auto overscroll-contain !rounded-[1.75rem] p-5 outline-none ${cardH ? 'tour-glide' : 'invisible'}`}
        style={{ width: W, maxHeight: 'calc(100dvh - 32px)', transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)` }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-wide text-sage-600 uppercase tabular">
            {step + 1} av {STEPS.length}
          </span>
          <button type="button" className="icon-btn -mt-1 -mr-2 !size-9" aria-label="Stäng guiden" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {/* bara innehållet tonas in – kortet själv ligger kvar och glider */}
        <div key={step} className="tour-fade">
          <h2 id="tour-title" className="mt-1 text-xl leading-tight">
            {s.title}
          </h2>
          {s.art && <div className="mt-3">{s.art}</div>}
          <p className="mt-3 text-[14px] leading-relaxed text-forest-900">{s.text}</p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-forest-700' : 'w-1.5 bg-sand-300'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {step === 0 ? (
            <button type="button" className="btn btn-ghost !px-3" onClick={onClose}>
              Hoppa över
            </button>
          ) : (
            <button type="button" className="btn btn-ghost !px-3" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} weight="bold" /> Tillbaka
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary ml-auto"
            onClick={() => {
              if (last) {
                onClose()
                navigate('karta')
              } else setStep(step + 1)
            }}
          >
            {last ? 'Börja leta' : step === 0 ? 'Visa mig' : 'Nästa'}
            {!last && <ArrowRight size={16} weight="bold" />}
          </button>
        </div>
      </div>
    </div>
  )
}
