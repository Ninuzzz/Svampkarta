import { SPECIES_MODELS, dayOfYear, seasonFactor, type SpeciesId } from './species'

/** Säsongsetikett för en art just nu (används av kartpanelen och artguiden). */
export function seasonState(id: SpeciesId, lat: number) {
  const sp = SPECIES_MODELS.find((s) => s.id === id)!
  const doy = dayOfYear()
  const f = seasonFactor(sp, doy, lat)
  const peak = sp.peak + sp.latShift * (lat - 56)
  if (f > 0.45) return { label: 'Säsong nu', tone: 'now' as const }
  if (doy > peak && f > 0.12) return { label: 'Sen säsong', tone: 'soon' as const }
  if (doy < peak && peak - doy < 45) return { label: 'Snart', tone: 'soon' as const }
  return { label: doy < peak ? 'Ej än' : 'Slut för i år', tone: 'off' as const }
}
