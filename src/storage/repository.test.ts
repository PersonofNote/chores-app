import { afterEach, describe, expect, it } from 'vitest'
import { recordDone, recordVoid } from '../domain'
import type { Repository } from './repository'
import { openTestRepository, smallHouse } from './test-fixtures'

let repo: Repository
afterEach(() => repo?.close())

async function seeded() {
  repo = await openTestRepository()
  const house = smallHouse()
  const { home, rooms, items, tasks, events } = house
  await repo.save({ homes: [home], rooms, items, tasks, events })
  return house
}

const sortIds = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

describe('IndexedDB repository', () => {
  it('round-trips a house', async () => {
    const h = await seeded()
    const loaded = await repo.loadHouse('home')
    expect(loaded?.home).toEqual(h.home)
    expect(sortIds(loaded!.rooms)).toEqual(sortIds(h.rooms))
    expect(sortIds(loaded!.items)).toEqual(sortIds(h.items))
    expect(sortIds(loaded!.tasks)).toEqual(sortIds(h.tasks))
    expect(sortIds(loaded!.events)).toEqual(sortIds(h.events))
    expect(await repo.listHomes()).toEqual([h.home])
  })

  it('returns null for an unknown home', async () => {
    await seeded()
    expect(await repo.loadHouse('nope')).toBeNull()
  })

  it('only loads the requested home', async () => {
    const h = await seeded()
    await repo.save({
      homes: [{ id: 'cabin', name: 'Cabin', gridSize: { w: 4, h: 4 } }],
      rooms: [{ id: 'loft', homeId: 'cabin', name: 'Loft', cells: [{ x: 0, y: 0, w: 2, h: 2 }] }],
    })
    const loaded = await repo.loadHouse('home')
    expect(sortIds(loaded!.rooms)).toEqual(sortIds(h.rooms))
  })

  it('upserts entities in place', async () => {
    const h = await seeded()
    await repo.save({ items: [{ ...h.items[0]!, notes: 'Queen, memory foam' }] })
    const loaded = await repo.loadHouse('home')
    expect(loaded!.items.find((i) => i.id === 'bed')?.notes).toBe('Queen, memory foam')
  })

  it('appends events idempotently: a duplicate id keeps the original and does not abort the batch', async () => {
    const h = await seeded()
    const original = h.events[0]!
    const tampered = { ...original, note: 'rewritten' }
    const fresh = recordDone(h.tasks[0]!.id, h)
    await repo.appendEvents([tampered, fresh])

    const { events } = (await repo.loadHouse('home'))!
    expect(events).toHaveLength(h.events.length + 1)
    expect(events.find((e) => e.id === original.id)).toEqual(original)
  })

  it('stores voids alongside their targets', async () => {
    const h = await seeded()
    const v = recordVoid(h.events[0]!, h)
    await repo.appendEvents([v])
    const { events } = (await repo.loadHouse('home'))!
    expect(events.find((e) => e.id === v.id)?.voids).toBe(h.events[0]!.id)
  })

  it('deleting a room cascades to its items and tasks but keeps events as history', async () => {
    const h = await seeded()
    await repo.deleteRoom('bedroom')
    const loaded = (await repo.loadHouse('home'))!
    expect(loaded.rooms.map((r) => r.id)).toEqual(['kitchen'])
    expect(loaded.items.map((i) => i.id)).toEqual(['fridge'])
    expect(loaded.tasks.every((t) => t.itemId === 'fridge')).toBe(true)

    const all = await repo.exportAll()
    expect(all.events).toHaveLength(h.events.length)
  })

  it('deleting an item removes its tasks only', async () => {
    const h = await seeded()
    await repo.deleteItem('bed')
    const loaded = (await repo.loadHouse('home'))!
    expect(loaded.items.map((i) => i.id).sort()).toEqual(['fridge', 'plant'])
    expect(loaded.tasks).toHaveLength(h.tasks.filter((t) => t.itemId !== 'bed').length)
  })

  it('deleting a task leaves its item', async () => {
    const h = await seeded()
    const target = h.tasks.find((t) => t.itemId === 'bed')!
    await repo.deleteTask(target.id)
    const loaded = (await repo.loadHouse('home'))!
    expect(loaded.tasks.find((t) => t.id === target.id)).toBeUndefined()
    expect(loaded.items.find((i) => i.id === 'bed')).toBeDefined()
  })

  it('a save with a bad entity writes nothing', async () => {
    const h = await seeded()
    const bad = { ...h.items[0]!, id: undefined } as unknown as typeof h.items[number]
    await expect(repo.save({ items: [{ ...h.items[0]!, notes: 'changed' }, bad] })).rejects.toBeDefined()
    const loaded = (await repo.loadHouse('home'))!
    expect(loaded.items.find((i) => i.id === 'bed')?.notes).toBeUndefined()
  })
})
