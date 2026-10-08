import type { AppData } from './types'

/**
 * Höj när startdatan ändras. Version 3: ingen exempeldata längre – gammal
 * exempeldata (markerad `demo`) tas bort automatiskt, egna poster behålls.
 */
export const SEED_VERSION = 3

/** Startläge för en ny användare: helt tomt. */
export function seedData(): AppData {
  return { version: 1, seed: SEED_VERSION, places: [], logs: [], routes: [] }
}
