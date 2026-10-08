import type { AppData } from './types'
import { onDataChange } from './store'

/*
 * Ändringsspårning för synken. Liten och alltid laddad, så att ändringar som
 * görs utan nät (eller innan Supabase-biblioteket hunnit laddas) inte glöms.
 * Spåras bara på enheter där någon har loggat in för att synka.
 */

import { KINDS } from './syncKinds'
export { KINDS, type SyncKind } from './syncKinds'

export const SYNC_USER_KEY = 'mycel:sync-user'
/** kontot som datan på den här enheten hör till (finns kvar efter utloggning) */
export const OWNER_KEY = 'mycel:sync-owner'
const CHANGES_KEY = 'mycel:changes'

export interface Changes {
  /** senaste lokala ändring per sak, `${kind}:${id}` → ms */
  t: Record<string, number>
  /** raderade saker → ms */
  del: Record<string, number>
  /** foton att ta bort ur molnet (dagboksinlägget är raderat) */
  photosDel: string[]
}

export function loadChanges(): Changes {
  try {
    const c = JSON.parse(localStorage.getItem(CHANGES_KEY) ?? '') as Changes
    return { t: c.t ?? {}, del: c.del ?? {}, photosDel: c.photosDel ?? [] }
  } catch {
    return { t: {}, del: {}, photosDel: [] }
  }
}

export function saveChanges(c: Changes) {
  try {
    localStorage.setItem(CHANGES_KEY, JSON.stringify(c))
  } catch {
    /* fullt eller privat läge */
  }
}

/** Spåra ändringar på enheter som har synkat – även medan man är utloggad, så att allt kommer med vid nästa inloggning. */
export const syncEnabled = () => {
  try {
    return !!(localStorage.getItem(SYNC_USER_KEY) || localStorage.getItem(OWNER_KEY))
  } catch {
    return false
  }
}

type Item = { id: string; demo?: boolean; photoIds?: string[] }
const listOf = (d: AppData, field: (typeof KINDS)[number]['field']) => ((d[field] ?? []) as Item[]).filter((x) => !x.demo)

const localListeners = new Set<() => void>()
/** Anropas efter varje lokal ändring (synken skickar upp efter en kort paus). */
export const onLocalChange = (l: () => void) => {
  localListeners.add(l)
  return () => void localListeners.delete(l)
}

onDataChange((prev, next, remote) => {
  if (remote || !syncEnabled()) return
  const c = loadChanges()
  const now = Date.now()
  let changed = false
  for (const { kind, field } of KINDS) {
    const before = new Map(listOf(prev, field).map((x) => [x.id, x]))
    for (const item of listOf(next, field)) {
      const old = before.get(item.id)
      before.delete(item.id)
      if (old && JSON.stringify(old) === JSON.stringify(item)) continue
      const key = `${kind}:${item.id}`
      c.t[key] = now
      delete c.del[key]
      changed = true
    }
    // kvar i `before` = raderade
    for (const [id, old] of before) {
      const key = `${kind}:${id}`
      c.del[key] = now
      delete c.t[key]
      if (old.photoIds?.length) c.photosDel.push(...old.photoIds)
      changed = true
    }
  }
  if (!changed) return
  saveChanges(c)
  localListeners.forEach((l) => l())
})
