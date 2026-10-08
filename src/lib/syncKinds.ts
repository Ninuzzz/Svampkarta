/** Vilka sorters saker som synkas, och var de ligger i appens data. Inga beroenden (testas i node). */
export type SyncKind = 'place' | 'log' | 'route' | 'feedback'
export const KINDS: { kind: SyncKind; field: 'places' | 'logs' | 'routes' | 'feedback' }[] = [
  { kind: 'place', field: 'places' },
  { kind: 'log', field: 'logs' },
  { kind: 'route', field: 'routes' },
  { kind: 'feedback', field: 'feedback' },
]
