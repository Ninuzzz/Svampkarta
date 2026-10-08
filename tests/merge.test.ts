// Synkens sammanslagning: senaste ändringen vinner, per sak.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeRemote, type RemoteRow } from '../src/lib/merge.ts'
import type { Changes } from '../src/lib/changes.ts'
import type { AppData } from '../src/lib/types.ts'

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const ms = (iso: string) => Date.parse(iso)

const empty = (): AppData => ({ places: [], logs: [], routes: [], feedback: [] }) as unknown as AppData
const place = (id: string, name: string, updatedAt = T1) => ({ id, name, updatedAt, lat: 56, lng: 13 })
const nameOf = (d: AppData, i = 0) => (d.places[i] as unknown as { name: string }).name
const row = (id: string, data: object | null, changedAt: string, kind: RemoteRow['kind'] = 'place'): RemoteRow => ({
  kind,
  id,
  data: data as RemoteRow['data'],
  deleted: data === null,
  changed_at: changedAt,
  updated_at: changedAt,
})
const changes = (c: Partial<Changes> = {}): Changes => ({ t: {}, del: {}, photosDel: [], ...c })
const withPlace = (name: string, updatedAt: string) => {
  const d = empty()
  d.places.push(place('a', name, updatedAt) as never)
  return d
}

test('ny sak från servern läggs till och markeras som skickad', () => {
  const c = changes()
  const sent: Record<string, number> = {}
  const { data } = mergeRemote(empty(), c, sent, [row('a', place('a', 'Mossen'), T1)])
  assert.equal(data?.places.length, 1)
  assert.equal(nameOf(data!), 'Mossen')
  assert.equal(c.t['place:a'], ms(T1))
  assert.equal(sent['place:a'], ms(T1))
})

test('nyare lokal ändring vinner över äldre från servern', () => {
  const c = changes({ t: { 'place:a': ms(T2) } })
  const sent: Record<string, number> = {}
  const { data } = mergeRemote(withPlace('Lokalt namn', T2), c, sent, [row('a', place('a', 'Gammalt namn'), T1)])
  assert.equal(data, null, 'inget ska ändras')
  assert.equal(c.t['place:a'], ms(T2))
  assert.equal(sent['place:a'], undefined, 'den lokala ändringen är inte skickad än')
})

test('nyare ändring från servern ersätter den lokala', () => {
  const c = changes({ t: { 'place:a': ms(T1) } })
  const { data } = mergeRemote(withPlace('Gammalt', T1), c, {}, [row('a', place('a', 'Nytt', T2), T2)])
  assert.equal(data?.places.length, 1)
  assert.equal(nameOf(data!), 'Nytt')
  assert.equal(c.t['place:a'], ms(T2))
})

test('radering från servern tar bort saken och sparas som radering', () => {
  const c = changes({ t: { 'place:a': ms(T1) } })
  const { data } = mergeRemote(withPlace('Bort', T1), c, {}, [row('a', null, T2)])
  assert.equal(data?.places.length, 0)
  assert.equal(c.del['place:a'], ms(T2))
  assert.equal(c.t['place:a'], undefined)
})

test('nyare lokal radering står sig mot en äldre ändring från servern', () => {
  const c = changes({ del: { 'place:a': ms(T2) } })
  const { data } = mergeRemote(empty(), c, {}, [row('a', place('a', 'Gammal'), T1)])
  assert.equal(data, null)
  assert.equal(c.del['place:a'], ms(T2))
})

test('samma tid: inget skrivs över, men saken räknas som skickad', () => {
  const c = changes({ t: { 'place:a': ms(T1) } })
  const sent: Record<string, number> = {}
  const { data } = mergeRemote(withPlace('Här', T1), c, sent, [row('a', place('a', 'Där'), T1)])
  assert.equal(data, null)
  assert.equal(sent['place:a'], ms(T1))
})

test('foton i dagboksinlägg från servern ska hämtas', () => {
  const log = { id: 'l', date: '2026-09-01', photoIds: ['p1', 'p2'] }
  const { wantPhotos } = mergeRemote(empty(), changes(), {}, [row('l', log, T1, 'log')])
  assert.deepEqual([...wantPhotos].sort(), ['p1', 'p2'])
})

test('okända sorter från servern ignoreras', () => {
  const { data } = mergeRemote(empty(), changes(), {}, [{ ...row('x', { id: 'x' }, T1), kind: 'okänd' as never }])
  assert.equal(data, null)
})

test('datan på enheten ändras inte på plats', () => {
  const snap = withPlace('Orörd', T1)
  mergeRemote(snap, changes({ t: { 'place:a': ms(T1) } }), {}, [row('a', place('a', 'Ny'), T2)])
  assert.equal(nameOf(snap), 'Orörd')
})
