// Öppen mark: bara arter som växer på gräsmark (openLand) får poäng utan skog omkring.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TREE_KEYS, lut, score, type Parts, type PixelFeatures } from '../src/analysis/model.ts'
import { EXPERT_MODELS, SPECIES_BY_ID, targetSpecies } from '../src/analysis/species.ts'

const scratch = {} as Parts
const at = (tree: string, forest: number): PixelFeatures => ({
  tree: TREE_KEYS.indexOf(tree as never),
  wet: 0,
  soil: 3,
  tpi: null,
  south: 0,
  edge: 0,
  wetNb: 0,
  urban: 1,
  noble: 1,
  forest,
  age: 0,
  path: null,
})
const points = (id: string, fv: PixelFeatures) => {
  const sp = EXPERT_MODELS.find((s) => s.id === id)!
  return score(sp, lut(sp), fv, scratch)
}

test('ängschampinjon får poäng på öppen mark utan skog omkring', () => {
  assert.ok(points('champinjon', at('oppen', 0)) > 0)
})

test('bär spärras på öppen mark bland åkrar men inte i skogsbygd', () => {
  assert.equal(points('blabar', at('oppen', 0)), 0)
  assert.ok(points('blabar', at('oppen', 1)) > 0)
})

test('ängschampinjon växer inte i granskog', () => {
  assert.equal(points('champinjon', at('gran', 1)), 0)
})

test('arten finns i de modeller som appen använder', () => {
  assert.equal(SPECIES_BY_ID.champinjon.name, 'Ängschampinjon')
  assert.equal(SPECIES_BY_ID.champinjon.openLand, true)
})

test('ängschampinjon ingår inte i "Alla svampar" men går att välja själv', () => {
  assert.ok(!targetSpecies('svamp').some((s) => s.id === 'champinjon'))
  assert.deepEqual(targetSpecies('champinjon').map((s) => s.id), ['champinjon'])
  // övriga svampar är kvar i gruppen
  assert.ok(targetSpecies('svamp').some((s) => s.id === 'kantarell'))
})
