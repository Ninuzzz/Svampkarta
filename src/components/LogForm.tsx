import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Camera, Cloud, CloudFog, CloudRain, CloudSun, Plus, Snowflake, SpinnerGap, Sun, Trash, X, type Icon } from '@phosphor-icons/react'
import { Sheet } from './ui'
import { actions, uid, useData } from '../lib/store'
import { deletePhoto, savePhoto, usePhotoUrl } from '../lib/photos'
import { todayISO } from '../lib/geo'
import { SPECIES } from '../lib/season'
import type { Finding, LogEntry, Weather } from '../lib/types'
import { useToast } from './Toast'

export const WEATHER: { value: Weather; label: string; icon: Icon }[] = [
  { value: 'sol', label: 'Sol', icon: Sun },
  { value: 'halvklart', label: 'Halvklart', icon: CloudSun },
  { value: 'moln', label: 'Mulet', icon: Cloud },
  { value: 'regn', label: 'Regn', icon: CloudRain },
  { value: 'dimma', label: 'Dimma', icon: CloudFog },
  { value: 'snö', label: 'Snö', icon: Snowflake },
]

export function PhotoThumb({ id, className = '', alt }: { id: string; className?: string; alt: string }) {
  const url = usePhotoUrl(id)
  return url ? (
    <img src={url} alt={alt} className={`object-cover ${className}`} loading="lazy" />
  ) : (
    <div className={`animate-pulse bg-sage-100 ${className}`} aria-hidden="true" />
  )
}

export function LogForm({ open, entry, onClose }: { open: boolean; entry: Partial<LogEntry> | null; onClose: () => void }) {
  const { places } = useData()
  const toast = useToast()
  const formId = useId()
  const ids = { date: useId(), title: useId(), temp: useId(), place: useId(), notes: useId(), list: useId(), photos: useId() }

  const [date, setDate] = useState(todayISO())
  const [title, setTitle] = useState('')
  const [weather, setWeather] = useState<Weather>('halvklart')
  const [temp, setTemp] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [findings, setFindings] = useState<Finding[]>([])
  const [notes, setNotes] = useState('')
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [dateError, setDateError] = useState('')
  const added = useRef<string[]>([])

  useEffect(() => {
    if (!open) return
    setDate(entry?.date ?? todayISO())
    setTitle(entry?.title ?? '')
    setWeather(entry?.weather ?? 'halvklart')
    setTemp(entry?.temperature != null ? String(entry.temperature) : '')
    setPlaceId(entry?.placeId ?? '')
    setFindings(entry?.findings?.length ? entry.findings : [{ species: '', amount: '' }])
    setNotes(entry?.notes ?? '')
    setPhotoIds(entry?.photoIds ?? [])
    setDateError('')
    added.current = []
  }, [open, entry])

  function cancel() {
    added.current.forEach(deletePhoto)
    added.current = []
    onClose()
  }

  async function addPhotos(files: File[]) {
    if (!files.length) return
    setUploading(true)
    try {
      const newIds = await Promise.all(files.map(savePhoto))
      added.current.push(...newIds)
      setPhotoIds((p) => [...p, ...newIds])
    } catch {
      toast({ text: 'En bild kunde inte läsas in' })
    } finally {
      setUploading(false)
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!date) {
      setDateError('Välj vilket datum rundan gjordes.')
      document.getElementById(ids.date)?.focus()
      return
    }
    // ta bort foton som plockats bort ur en befintlig post
    entry?.photoIds?.filter((p) => !photoIds.includes(p)).forEach(deletePhoto)
    const t = temp.trim() === '' ? null : Number(temp.replace(',', '.'))
    actions.saveLog({
      id: entry?.id ?? uid(),
      createdAt: entry?.createdAt,
      date,
      title: title.trim() || 'Skogsrunda',
      weather,
      temperature: Number.isFinite(t) ? t : null,
      placeId: placeId || null,
      findings: findings.filter((f) => f.species.trim()).map((f) => ({ species: f.species.trim(), amount: f.amount.trim() })),
      notes: notes.trim(),
      photoIds,
    })
    added.current = []
    toast({ text: entry?.id ? 'Anteckningen är uppdaterad' : 'Rundan är loggad' })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={cancel}
      title={entry?.id ? 'Redigera anteckning' : 'Logga en runda'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Avbryt
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={uploading}>
            Spara
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_1.4fr]">
          <div>
            <label htmlFor={ids.date} className="field-label">
              Datum <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id={ids.date}
              type="date"
              className="field"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? `${ids.date}-err` : undefined}
            />
            {dateError && (
              <p id={`${ids.date}-err`} role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
                {dateError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={ids.title} className="field-label">
              Rubrik
            </label>
            <input id={ids.title} className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dimmig morgon i granskogen" />
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Väder</legend>
          <div role="radiogroup" aria-label="Väder" className="flex flex-wrap gap-2">
            {WEATHER.map(({ value, label, icon: I }) => (
              <button key={value} type="button" role="radio" aria-checked={weather === value} onClick={() => setWeather(value)} className="chip">
                <I size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[1fr_1.6fr]">
          <div>
            <label htmlFor={ids.temp} className="field-label">
              Temperatur (°C)
            </label>
            <input id={ids.temp} className="field tabular" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="12" />
          </div>
          <div>
            <label htmlFor={ids.place} className="field-label">
              Plats
            </label>
            <select id={ids.place} className="field" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">Ingen sparad plats</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Vad hittade du?</legend>
          <datalist id={ids.list}>
            {SPECIES.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
          <div className="grid gap-2">
            {findings.map((f, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Art ${i + 1}`}
                  className="field flex-[1.4]"
                  list={ids.list}
                  value={f.species}
                  placeholder="Art"
                  onChange={(e) => setFindings((all) => all.map((x, j) => (j === i ? { ...x, species: e.target.value } : x)))}
                />
                <input
                  aria-label={`Mängd ${i + 1}`}
                  className="field min-w-0 flex-1"
                  value={f.amount}
                  placeholder="Mängd"
                  onChange={(e) => setFindings((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Ta bort fynd ${i + 1}`}
                  onClick={() => setFindings((all) => all.filter((_, j) => j !== i))}
                >
                  <Trash size={18} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost mt-2 !px-3" onClick={() => setFindings((a) => [...a, { species: '', amount: '' }])}>
            <Plus size={16} weight="bold" /> Lägg till fynd
          </button>
        </fieldset>

        <div>
          <label htmlFor={ids.notes} className="field-label">
            Anteckningar
          </label>
          <textarea id={ids.notes} className="field min-h-28 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Hur var marken? Något du vill minnas till nästa år?" />
        </div>

        <div>
          <span className="field-label">Bilder</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoIds.map((id, i) => (
              <div key={id} className="group relative aspect-square overflow-hidden rounded-2xl">
                <PhotoThumb id={id} alt={`Bild ${i + 1}`} className="size-full" />
                <button
                  type="button"
                  aria-label={`Ta bort bild ${i + 1}`}
                  onClick={() => setPhotoIds((p) => p.filter((x) => x !== id))}
                  className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-white/80 text-forest-900 backdrop-blur"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
            <label
              htmlFor={ids.photos}
              className="glass-inset flex aspect-square flex-col items-center justify-center gap-1 border-dashed text-xs font-semibold text-forest-700 transition-colors hover:bg-white/70"
            >
              {uploading ? <SpinnerGap size={22} className="animate-spin" /> : <Camera size={22} />}
              {uploading ? 'Sparar…' : 'Lägg till'}
            </label>
            <input id={ids.photos} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : []
                e.target.value = ''
                addPhotos(files)
              }} />
          </div>
          <p className="field-help">Bilderna komprimeras och sparas bara på den här enheten.</p>
        </div>
      </form>
    </Sheet>
  )
}
