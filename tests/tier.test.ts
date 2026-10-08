// Bäst/Bra/Möjlig jämfört med den bästa toppen i vyn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hotspotTier } from '../src/map/tier.ts'

test('nivåer i förhållande till den bästa', () => {
  assert.equal(hotspotTier(0.4, 0.4), 'Bäst')
  assert.equal(hotspotTier(0.36, 0.4), 'Bäst')
  assert.equal(hotspotTier(0.3, 0.4), 'Bra')
  assert.equal(hotspotTier(0.2, 0.4), 'Möjlig')
})

test('ingen bästa topp ger Möjlig', () => {
  assert.equal(hotspotTier(0.3, 0), 'Möjlig')
})
