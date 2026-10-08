import { useEffect, useId, useState, type FormEvent } from 'react'
import { Crosshair, SpinnerGap } from '@phosphor-icons/react'
import { Segmented, Sheet } from './ui'
import { actions, uid } from '../lib/store'
import { getCurrentPosition } from '../lib/geo'
import { SPECIES } from '../lib/season'
import type { Kind, Place } from '../lib/types'
import { useToast } from './Toast'

export type PlaceDraft = Partial<Place> & { lat?: number; lng?: number }

type Errors = Partial<Record<'name' | 'lat' | 'lng', string>>

export function PlaceForm({ open, draft, onClose }: { open: boolean; draft: PlaceDraft | null; onClose: () => void }) {
  const toast = useToast()
  const ids = { name: useId(), species: useId(), lat: useId(), lng: useId(), notes: useId(), list: useId() }
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('svamp')
  const [species, setSpecies] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [yieldV, setYield] = useState<'1' | '2' | '3'>('2')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(draft?.name ?? '')
    setKind(draft?.kind ?? 'svamp')
    setSpecies(draft?.species ?? '')
    setLat(draft?.lat != null ? draft.lat.toFixed(6) : '')
    setLng(draft?.lng != null ? draft.lng.toFixed(6) : '')
    setYield(String(draft?.yield ?? 2) as '1' | '2' | '3')
    setNotes(draft?.notes ?? '')
    setErrors({})
    setLocError('')
  }, [open, draft])

  const isEdit = !!draft?.id

  async function locate() {
    setLocating(true)
    setLocError('')
    try {
      const p = await getCurrentPosition()
      setLat(p.lat.toFixed(6))
      setLng(p.lng.toFixed(6))
      setErrors((e) => ({ ...e, lat: undefined, lng: undefined }))
    } catch (e) {
      setLocError((e as Error).message)
    } finally {
      setLocating(false)
    }
  }

  function validate(): Errors {
    const e: Errors = {}
    const la = Number(lat.replace(',', '.'))
    const ln = Number(lng.replace(',', '.'))
    if (!name.trim()) e.name = 'Ge platsen ett namn, t.ex. "Kantarellbacken".'
    if (lat.trim() === '' || !Number.isFinite(la) || la < -90 || la > 90) e.lat = 'Ange latitud mellan -90 och 90, t.ex. 59.3293.'
    if (lng.trim() === '' || !Number.isFinite(ln) || ln < -180 || ln > 180) e.lng = 'Ange longitud mellan -180 och 180, t.ex. 18.0686.'
    return e
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      const first = e.name ? ids.name : e.lat ? ids.lat : ids.lng
      document.getElementById(first)?.focus()
      return
    }
    actions.savePlace({
      id: draft?.id ?? uid(),
      createdAt: draft?.createdAt,
      name: name.trim(),
      kind,
      species: species.trim(),
      lat: Number(lat.replace(',', '.')),
      lng: Number(lng.replace(',', '.')),
      yield: Number(yieldV) as 1 | 2 | 3,
      notes: notes.trim(),
    })
    toast({ text: isEdit ? 'Platsen är uppdaterad' : 'Platsen är sparad' })
    onClose()
  }

  const formId = useId()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Redigera plats' : 'Ny plats'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            {isEdit ? 'Spara ändringar' : 'Spara plats'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-5">
        <div>
          <label htmlFor={ids.name} className="field-label">
            Namn <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            id={ids.name}
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && setErrors((x) => ({ ...x, name: undefined }))}
            placeholder="Kantarellbacken"
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${ids.name}-err` : undefined}
            autoComplete="off"
          />
          {errors.name && (
            <p id={`${ids.name}-err`} role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
              {errors.name}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="field-label">Typ</span>
            <Segmented
              label="Typ av plats"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'svamp', label: 'Svamp' },
                { value: 'bar', label: 'Bär' },
              ]}
            />
          </div>
          <div>
            <label htmlFor={ids.species} className="field-label">
              Art
            </label>
            <input
              id={ids.species}
              className="field"
              list={ids.list}
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder={kind === 'svamp' ? 'Kantarell' : 'Lingon'}
              autoComplete="off"
            />
            <datalist id={ids.list}>
              {SPECIES.filter((s) => s.kind === kind).map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </div>
        </div>

        <fieldset>
          <legend className="field-label">
            Koordinater (WGS84) <span className="text-danger" aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['lat', 'Latitud', lat, setLat],
                ['lng', 'Longitud', lng, setLng],
              ] as const
            ).map(([k, label, v, set]) => (
              <div key={k}>
                <label htmlFor={ids[k]} className="sr-only">
                  {label}
                </label>
                <input
                  id={ids[k]}
                  className="field tabular"
                  inputMode="decimal"
                  value={v}
                  placeholder={label}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={!!errors[k]}
                  aria-describedby={errors[k] ? `${ids[k]}-err` : undefined}
                />
                {errors[k] && (
                  <p id={`${ids[k]}-err`} role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
                    {errors[k]}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={locate} disabled={locating} className="btn btn-glass mt-3 !min-h-10 !px-4">
            {locating ? <SpinnerGap size={18} className="animate-spin" /> : <Crosshair size={18} />}
            {locating ? 'Hämtar position…' : 'Använd min position'}
          </button>
          {locError && (
            <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
              {locError}
            </p>
          )}
          <p className="field-help">Tips: klicka var som helst på kartan för att spara en plats där.</p>
        </fieldset>

        <div>
          <span className="field-label">Avkastning</span>
          <Segmented
            label="Avkastning"
            value={yieldV}
            onChange={setYield}
            options={[
              { value: '1', label: 'Några få' },
              { value: '2', label: 'Bra' },
              { value: '3', label: 'Fantastiskt' },
            ]}
          />
        </div>

        <div>
          <label htmlFor={ids.notes} className="field-label">
            Anteckningar
          </label>
          <textarea
            id={ids.notes}
            className="field min-h-28 resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terräng, hur man hittar dit, bästa tiden…"
          />
        </div>
      </form>
    </Sheet>
  )
}
