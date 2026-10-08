import { useSyncExternalStore } from 'react'

export type View = 'hem' | 'karta' | 'guide' | 'platser' | 'dagbok' | 'rutter'

const VIEWS: View[] = ['hem', 'karta', 'guide', 'platser', 'dagbok', 'rutter']

function parse(hash: string) {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const view = (VIEWS.includes(path as View) ? path : 'hem') as View
  return { view, params: new URLSearchParams(query) }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Enkel hash-router: varje vy har en delbar länk, t.ex. #/karta?lat=55.87&lng=12.83&z=14 */
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parse(hash)
}

export function href(view: View, params?: Record<string, string | number | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
  const s = q.toString()
  return `#/${view === 'hem' ? '' : view}${s ? `?${s}` : ''}`
}

export function navigate(view: View, params?: Record<string, string | number | undefined>) {
  window.location.hash = href(view, params)
}
