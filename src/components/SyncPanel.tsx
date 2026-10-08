import { useState } from 'react'
import { ArrowsClockwise, CheckCircle, CloudSlash, EnvelopeSimple, GoogleLogo, SignOut, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { ensureStarted, googleLogin, sendEmailLogin, signOut, syncAvailable, syncNow, useSync, verifyEmailCode } from '../lib/sync'

const time = (ms: number) => new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

/** Frivillig inloggning för synk mellan enheter – visas på plats, aldrig som popup. */
export function SyncPanel() {
  const sync = useSync()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!syncAvailable) return null

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Inloggad
  if (sync.user)
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage-100 text-forest-700" aria-hidden="true">
            <ArrowsClockwise size={20} weight="bold" />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-forest-900">Synkas mellan dina enheter</p>
            <p className="text-ink-muted">{sync.user.email ?? 'Inloggad'}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold" role="status" aria-live="polite">
              {sync.status === 'synkar' && (
                <>
                  <SpinnerGap size={14} className="animate-spin text-sage-600" /> Synkar …
                </>
              )}
              {sync.status === 'klar' && (
                <>
                  <CheckCircle size={14} weight="fill" className="text-forest-600" /> Synkat {sync.lastSync ? time(sync.lastSync) : ''}
                </>
              )}
              {sync.status === 'offline' && (
                <>
                  <CloudSlash size={14} className="text-sage-600" /> Offline – synkas när nätet är tillbaka
                </>
              )}
              {sync.status === 'fel' && (
                <span className="flex items-center gap-1.5 text-[#9a3412]">
                  <WarningCircle size={14} weight="fill" /> {sync.message ?? 'Synken misslyckades'}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn border border-forest-700/70 bg-white/60 text-forest-800" onClick={() => void syncNow()} disabled={sync.status === 'synkar'}>
            <ArrowsClockwise size={18} /> Synka nu
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            <SignOut size={18} /> Logga ut
          </button>
        </div>
      </div>
    )

  // Utloggad, stängd
  if (!open)
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage-100 text-forest-700" aria-hidden="true">
            <ArrowsClockwise size={20} weight="bold" />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-forest-900">Synka mellan mobil och dator</p>
            <p className="text-ink-muted">Helt frivilligt. Logga in med e-post eller Google så följer platser, dagbok och rutter med.</p>
            {sync.status === 'fel' && sync.message && <p className="mt-1 text-[13px] font-semibold text-[#9a3412]">{sync.message}</p>}
          </div>
        </div>
        <button
          type="button"
          className="btn border border-forest-700/70 bg-white/60 text-forest-800"
          onClick={() => {
            setOpen(true)
            void ensureStarted()
          }}
          aria-expanded={false}
        >
          Logga in
        </button>
      </div>
    )

  // Utloggad, inloggning öppen (på plats i kortet)
  return (
    <div className="rounded-2xl bg-sand-100/60 p-4 sm:p-5" aria-label="Logga in för att synka">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-forest-900">Logga in för att synka</p>
        <button type="button" className="text-sm font-semibold text-sage-600 hover:underline" onClick={() => setOpen(false)}>
          Avbryt
        </button>
      </div>

      {!sentTo ? (
        <>
          <button type="button" className="btn mt-3 w-full justify-center border border-forest-700/40 bg-white text-forest-900" disabled={!!busy} onClick={() => run('google', googleLogin)}>
            {busy === 'google' ? <SpinnerGap size={18} className="animate-spin" /> : <GoogleLogo size={18} weight="bold" />} Fortsätt med Google
          </button>
          <div className="my-3 flex items-center gap-3 text-[13px] text-ink-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-sand-300" /> eller <span className="h-px flex-1 bg-sand-300" />
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              const to = email.trim()
              void run('mail', async () => {
                await sendEmailLogin(to)
                setSentTo(to)
              })
            }}
          >
            <label htmlFor="sync-email" className="sr-only">
              E-postadress
            </label>
            <input
              id="sync-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="field flex-1"
              placeholder="din@epost.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn-primary justify-center" disabled={!!busy}>
              {busy === 'mail' ? <SpinnerGap size={18} className="animate-spin" /> : <EnvelopeSimple size={18} />} Skicka inloggning
            </button>
          </form>
        </>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run('kod', () => verifyEmailCode(sentTo, code))
          }}
        >
          <p className="text-sm text-forest-900">
            Vi har skickat ett mejl till <b>{sentTo}</b>. Tryck på länken i mejlet – eller skriv in koden här:
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="sync-code" className="sr-only">
              Kod från mejlet
            </label>
            <input
              id="sync-code"
              className="field flex-1 tracking-[0.3em] tabular"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary justify-center" disabled={!!busy}>
              {busy === 'kod' ? <SpinnerGap size={18} className="animate-spin" /> : null} Logga in
            </button>
          </div>
          <button
            type="button"
            className="mt-2 text-[13px] font-semibold text-sage-600 hover:underline"
            onClick={() => {
              setSentTo(null)
              setCode('')
            }}
          >
            Byt e-post eller skicka igen
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-[#9a3412]" role="alert">
          <WarningCircle size={16} weight="fill" /> {error}
        </p>
      )}
      <p className="mt-3 text-[12px] leading-snug text-ink-muted">
        Bara du kommer åt det du sparar. Kartan och allt annat fungerar precis som vanligt utan konto.
      </p>
    </div>
  )
}
