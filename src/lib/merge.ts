import { KINDS, type SyncKind } from './syncKinds.ts'
import type { Changes } from './changes'
import type { AppData } from './types'

/** Det synken behöver veta om en sparad sak. */
export type AnyItem = { id: string; demo?: boolean; updatedAt?: string; createdAt?: string; date?: string; photoIds?: string[] }

/** En rad från servern (tabellen items). */
export interface RemoteRow {
  kind: SyncKind
  id: string
  data: AnyItem | null
  deleted: boolean
  changed_at: string
  updated_at: string
}

/**
 * Slå ihop ändringar från servern med datan på enheten: senaste ändringen
 * vinner, per sak. Uppdaterar `c` (lokala ändringstider) och `sent` (det
 * servern redan har) på plats. Returnerar ny data om något ändrades, annars
 * null, och vilka foton som behöver hämtas.
 */
export function mergeRemote(snapshot: AppData, c: Changes, sent: Record<string, number>, remote: RemoteRow[]) {
  const wantPhotos = new Set<string>()
  let data: AppData | null = null
  for (const r of remote) {
    const kind = KINDS.find((k) => k.kind === r.kind)
    if (!kind) continue
    const key = `${r.kind}:${r.id}`
    const remoteT = Date.parse(r.changed_at)
    const localT = c.t[key] ?? c.del[key] ?? 0
    if (remoteT > localT) {
      data ??= structuredClone(snapshot)
      const list = ((data[kind.field] ?? []) as AnyItem[]).filter((x) => x.id !== r.id)
      if (!r.deleted && r.data && typeof r.data === 'object') {
        list.unshift({ ...r.data, id: r.id })
        r.data.photoIds?.forEach((p) => wantPhotos.add(p))
      }
      ;(data as unknown as Record<string, AnyItem[]>)[kind.field] = list
      if (r.deleted) {
        c.del[key] = remoteT
        delete c.t[key]
      } else {
        c.t[key] = remoteT
        delete c.del[key]
      }
    }
    if (remoteT >= localT) sent[key] = Math.max(sent[key] ?? 0, remoteT)
  }
  if (data) {
    // nyast först, som appen själv sorterar
    data.places.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    data.logs.sort((a, b) => b.date.localeCompare(a.date))
    data.routes.sort((a, b) => b.date.localeCompare(a.date))
  }
  return { data, wantPhotos }
}
