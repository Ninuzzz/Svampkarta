import { speciesSvg } from '../analysis/icons'
import type { SpeciesId } from '../analysis/species'

export function SpeciesIcon({ id, size = 28, className = '' }: { id: SpeciesId; size?: number; className?: string }) {
  return <span className={`inline-grid shrink-0 place-items-center ${className}`} dangerouslySetInnerHTML={{ __html: speciesSvg(id, size) }} aria-hidden="true" />
}
