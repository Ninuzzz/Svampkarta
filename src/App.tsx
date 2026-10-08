import { Suspense, lazy, useEffect, useRef } from 'react'
import { SpinnerGap } from '@phosphor-icons/react'
import { Nav } from './components/Nav'
import { ToastProvider } from './components/Toast'
import { TourProvider } from './components/Tour'
import { useRoute } from './lib/router'
import { BRAND } from './lib/brand'
import Dashboard from './views/Dashboard'
import PlacesView from './views/PlacesView'
import JournalView from './views/JournalView'
import RoutesView from './views/RoutesView'
import GuideView from './views/GuideView'

// Kartan (Leaflet) laddas först när den behövs
const MapView = lazy(() => import('./views/MapView'))

const TITLES = { hem: `${BRAND.name} – ${BRAND.tagline.toLowerCase()}`, karta: 'Karta', guide: 'Artguide', platser: 'Mina platser', dagbok: 'Dagbok', rutter: 'Rutter' } as const

export default function App() {
  const { view } = useRoute()
  const main = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useEffect(() => {
    document.title = view === 'hem' ? TITLES.hem : `${TITLES[view]} · ${BRAND.name}`
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo({ top: 0 })
    main.current?.focus({ preventScroll: true })
  }, [view])

  return (
    <ToastProvider>
      <a
        href="#main"
        onClick={(e) => (e.preventDefault(), main.current?.focus())}
        className="glass fixed top-3 left-3 z-[2000] -translate-y-24 px-4 py-2 text-sm font-semibold focus:translate-y-0"
      >
        Hoppa till innehållet
      </a>
      <TourProvider>
        <Nav current={view} />
        <div id="main" ref={main} tabIndex={-1} className="outline-none">
          {view === 'hem' && <Dashboard />}
          {view === 'karta' && (
            <Suspense
              fallback={
                <div className="grid min-h-dvh place-items-center text-sage-600">
                  <SpinnerGap size={32} className="animate-spin" aria-label="Laddar kartan" />
                </div>
              }
            >
              <MapView />
            </Suspense>
          )}
          {view === 'guide' && <GuideView />}
          {view === 'platser' && <PlacesView />}
          {view === 'dagbok' && <JournalView />}
          {view === 'rutter' && <RoutesView />}
        </div>
      </TourProvider>
    </ToastProvider>
  )
}
