import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { actions, applyRemote } from './store'
import { getPhoto, putPhoto } from './photos'
import { KINDS, SYNC_USER_KEY, loadChanges, onLocalChange, saveChanges, type SyncKind } from './changes'
import type { AppData } from './types'

/*
 * Frivillig synk mellan enheter via Supabase (inloggning med e-post eller Google).
 *
 * Allt fungerar som vanligt utan konto. Supabase-biblioteket laddas först när
 * någon loggar in, eller om enheten redan är inloggad.
 *
 * Synk: hämta det som ändrats på servern sedan sist, slå ihop (senaste ändring
 * vinner, per sak), skicka upp det som ändrats här. Foton går till en privat lagring.
 */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined
export const syncAvailable = !!(URL_ && KEY)
const AUTH_KEY = URL_ ? `sb-${new URL(URL_).hostname.split('.')[0]}-auth-token` : ''

let clientP: Promise<SupabaseClient> | null = null
const client = () =>
  (clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  ))

/* ------------------------------------------------------------------ */
/*  Tillstånd för gränssnittet                                         */
/* ------------------------------------------------------------------ */

export interface SyncState {
  user: { id: string; email: string | null } | null
  status: 'av' | 'synkar' | 'klar' | 'offline' | 'fel'
  lastSync: number | null
  message: string | null
}

let state: SyncState = { user: null, status: 'av', lastSync: null, message: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export const useSync = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => state,
  )

/* ------------------------------------------------------------------ */
/*  Inloggning                                                         */
/* ------------------------------------------------------------------ */

const redirectTo = () => `${location.origin}/`

export async function sendEmailLogin(email: string) {
  const { error } = await (await client()).auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } })
  if (error) throw new Error(friendly(error.message))
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await (await client()).auth.verifyOtp({ email, token: token.replace(/\s/g, ''), type: 'email' })
  if (error) throw new Error(friendly(error.message))
}

export async function googleLogin() {
  const { error } = await (await client()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
  if (error) throw new Error(friendly(error.message))
}

export async function signOut() {
  await (await client()).auth.signOut().catch(() => {})
  try {
    localStorage.removeItem(SYNC_USER_KEY)
  } catch {
    /* ignorera */
  }
  set({ user: null, status: 'av', message: null })
}

function friendly(msg: string) {
  if (/rate limit|too many|security purposes/i.test(msg)) return 'För många försök just nu – vänta en stund och försök igen.'
  if (/expired|invalid/i.test(msg)) return 'Koden stämmer inte eller har gått ut. Be om en ny.'
  if (/provider is not enabled|unsupported provider/i.test(msg)) return 'Inloggning med Google är inte påslagen än.'
  if (/code verifier|both auth code/i.test(msg)) return 'Länken öppnades i en annan webbläsare än där du bad om den. Skriv in koden från mejlet i stället.'
  if (/fetch|network/i.test(msg)) return 'Ingen kontakt med servern. Kontrollera nätet.'
  return msg
}

/** Startas när appen laddas. Rör inget nätverk om ingen är inloggad. */
export function initSync() {
  if (!syncAvailable) return
  const params = new URLSearchParams(location.search)
  const returning = params.has('code') || params.has('error_description')
  let stored = false
  try {
    stored = !!localStorage.getItem(AUTH_KEY)
  } catch {
    /* privat läge */
  }
  if (!returning && !stored) return
  void start(params)
}

let started = false
async function start(params?: URLSearchParams) {
  if (started) return
  started = true
  const sb = await client()
  const urlError = params?.get('error_description')
  sb.auth.onAuthStateChange((event, session) => {
    // körs synkront i Supabase – resten görs utanför
    setTimeout(() => {
      if (session?.user) onSignedIn(session.user.id, session.user.email ?? null)
      else if (event === 'SIGNED_OUT') set({ user: null, status: 'av' })
    })
  })
  const { data, error } = await sb.auth.getSession()
  // städa bort ?code=… ur adressen efter inloggning
  if (params && (params.has('code') || params.has('error_description'))) history.replaceState(null, '', `${location.pathname}${location.hash || '#/hem'}`)
  if (urlError || error) set({ status: 'fel', message: friendly(urlError ?? error!.message) })
  if (data.session?.user) onSignedIn(data.session.user.id, data.session.user.email ?? null)
}

/** Laddar biblioteket vid behov (när någon öppnar inloggningen). */
export const ensureStarted = () => (syncAvailable ? start() : Promise.resolve())

function onSignedIn(id: string, email: string | null) {
  if (state.user?.id === id) return
  try {
    localStorage.setItem(SYNC_USER_KEY, id)
  } catch {
    /* ignorera */
  }
  firstTimeOnDevice(id)
  set({ user: { id, email }, status: 'synkar', message: null })
  watch()
  void syncNow()
}

/* ------------------------------------------------------------------ */
/*  Synk                                                               */
/* ------------------------------------------------------------------ */

interface Meta {
  /** senaste updated_at som hämtats från servern */
  pulled: string | null
  /** vad som skickats upp: nyckel → ändringstid */
  sent: Record<string, number>
  /** foton som finns i molnet */
  photosUp: string[]
  init: boolean
}
const metaKey = (uid: string) => `mycel:sync:${uid}`
const loadMeta = (uid: string): Meta => {
  try {
    return { pulled: null, sent: {}, photosUp: [], init: false, ...JSON.parse(localStorage.getItem(metaKey(uid)) ?? '{}') }
  } catch {
    return { pulled: null, sent: {}, photosUp: [], init: false }
  }
}
const saveMeta = (uid: string, m: Meta) => {
  try {
    localStorage.setItem(metaKey(uid), JSON.stringify(m))
  } catch {
    /* ignorera */
  }
}

type AnyItem = { id: string; demo?: boolean; updatedAt?: string; createdAt?: string; date?: string; photoIds?: string[] }
const itemsOf = (d: AppData, field: (typeof KINDS)[number]['field']) => ((d[field] ?? []) as AnyItem[]).filter((x) => !x.demo)

/** Första inloggningen på den här enheten: allt som redan finns här ska med upp. */
function firstTimeOnDevice(uid: string) {
  const meta = loadMeta(uid)
  if (meta.init) return
  const c = loadChanges()
  const d = actions.snapshot()
  for (const { kind, field } of KINDS)
    for (const it of itemsOf(d, field)) {
      const key = `${kind}:${it.id}`
      if (!c.t[key]) c.t[key] = Date.parse(it.updatedAt ?? it.createdAt ?? it.date ?? '') || 1
    }
  saveChanges(c)
  saveMeta(uid, { ...meta, init: true })
}

let running: Promise<void> | null = null
let again = false
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = doSync()
    .catch((e: Error) => set({ status: navigator.onLine ? 'fel' : 'offline', message: navigator.onLine ? friendly(e.message) : null }))
    .finally(() => {
      running = null
      if (again) {
        again = false
        void syncNow()
      }
    })
  return running
}

async function doSync() {
  const user = state.user
  if (!user) return
  if (!navigator.onLine) return set({ status: 'offline' })
  set({ status: 'synkar' })
  const sb = await client()
  const meta = loadMeta(user.id)
  const c = loadChanges()

  // 1. Hämta det som ändrats på servern (med lite överlapp – dubbletter sorteras bort på ändringstid)
  let since = meta.pulled ? new Date(Date.parse(meta.pulled) - 5000).toISOString() : '1970-01-01T00:00:00Z'
  let data: AppData | null = null
  const wantPhotos = new Set<string>()
  for (;;) {
    const { data: rows, error } = await sb
      .from('items')
      .select('kind,id,data,deleted,changed_at,updated_at')
      .gt('updated_at', since)
      .order('updated_at')
      .limit(1000)
    if (error) throw new Error(error.message)
    for (const r of rows as { kind: SyncKind; id: string; data: AnyItem | null; deleted: boolean; changed_at: string; updated_at: string }[]) {
      const key = `${r.kind}:${r.id}`
      const remoteT = Date.parse(r.changed_at)
      const localT = c.t[key] ?? c.del[key] ?? 0
      if (remoteT > localT) {
        data ??= structuredClone(actions.snapshot())
        const field = KINDS.find((k) => k.kind === r.kind)!.field
        const list = ((data[field] ?? []) as AnyItem[]).filter((x) => x.id !== r.id)
        if (!r.deleted && r.data) {
          list.unshift(r.data)
          r.data.photoIds?.forEach((p) => wantPhotos.add(p))
        }
        ;(data as unknown as Record<string, AnyItem[]>)[field] = list
        if (r.deleted) {
          c.del[key] = remoteT
          delete c.t[key]
        } else {
          c.t[key] = remoteT
          delete c.del[key]
        }
      }
      if (remoteT >= localT) meta.sent[key] = Math.max(meta.sent[key] ?? 0, remoteT)
    }
    if (rows.length) since = meta.pulled = rows[rows.length - 1].updated_at
    if (rows.length < 1000) break
  }
  if (data) {
    // nyast först, som appen själv sorterar
    data.places.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    data.logs.sort((a, b) => b.date.localeCompare(a.date))
    data.routes.sort((a, b) => b.date.localeCompare(a.date))
    applyRemote(data)
  }
  saveChanges(c)

  // 2. Skicka upp det som ändrats här
  const now = actions.snapshot()
  const byKey = new Map<string, AnyItem>()
  for (const { kind, field } of KINDS) for (const it of itemsOf(now, field)) byKey.set(`${kind}:${it.id}`, it)
  const rows: { user_id: string; kind: string; id: string; data: AnyItem | null; deleted: boolean; changed_at: string }[] = []
  const sentT: [string, number][] = []
  for (const [key, t] of [...Object.entries(c.t), ...Object.entries(c.del)]) {
    if (t <= (meta.sent[key] ?? 0)) continue
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    const deleted = key in c.del
    const item = byKey.get(key)
    if (!deleted && !item) continue
    rows.push({ user_id: user.id, kind, id, data: deleted ? null : item!, deleted, changed_at: new Date(t).toISOString() })
    sentT.push([key, t])
  }
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await sb.from('items').upsert(rows.slice(i, i + 300), { onConflict: 'user_id,kind,id' })
    if (error) throw new Error(error.message)
    for (const [key, t] of sentT.slice(i, i + 300)) meta.sent[key] = t
    saveMeta(user.id, meta)
  }

  // 3. Foton: upp det som saknas i molnet, ner det som saknas här, ta bort raderade
  const bucket = sb.storage.from('photos')
  const up = new Set(meta.photosUp)
  for (const log of now.logs.filter((l) => !l.demo))
    for (const pid of log.photoIds) {
      if (!up.has(pid)) {
        const blob = await getPhoto(pid)
        if (blob) {
          const { error } = await bucket.upload(`${user.id}/${pid}`, blob, { upsert: true, contentType: blob.type || 'image/webp' })
          if (!error || /exists/i.test(error.message)) up.add(pid)
        } else wantPhotos.add(pid)
      }
    }
  for (const pid of wantPhotos) {
    if (await getPhoto(pid)) continue
    const { data: blob } = await bucket.download(`${user.id}/${pid}`)
    if (blob) {
      await putPhoto(pid, blob)
      up.add(pid)
    }
  }
  if (c.photosDel.length) {
    await bucket.remove(c.photosDel.map((p) => `${user.id}/${p}`))
    c.photosDel.forEach((p) => up.delete(p))
    saveChanges({ ...loadChanges(), photosDel: [] })
  }
  meta.photosUp = [...up]
  saveMeta(user.id, meta)
  set({ status: 'klar', lastSync: Date.now(), message: null })
}

/* ------------------------------------------------------------------ */
/*  När synken körs                                                    */
/* ------------------------------------------------------------------ */

let watching = false
function watch() {
  if (watching) return
  watching = true
  let timer = 0
  // strax efter en ändring här
  onLocalChange(() => {
    clearTimeout(timer)
    timer = window.setTimeout(() => void syncNow(), 1500)
  })
  // när appen öppnas igen, när nätet kommer tillbaka och en gång i minuten
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => set({ status: 'offline' }))
  setInterval(() => document.visibilityState === 'visible' && state.user && void syncNow(), 60_000)
}
