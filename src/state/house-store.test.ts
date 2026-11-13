import { afterEach, describe, expect, it } from 'vitest'
import { daysBefore } from '../domain'
import type { Repository } from '../storage'
import { openTestRepository, smallHouse } from '../storage/test-fixtures'
import { HouseStore, type StoreChange } from './house-store'

let repo: Repository
afterEach(() => repo?.close())

async function setup() {
  repo = await openTestRepository()
  const h = smallHouse()
  await repo.save({ homes: [h.home], rooms: h.rooms, items: h.items, tasks: h.tasks, events: h.events })
  const data = (await repo.loadHouse('home'))!
  const store = new HouseStore(repo, data, h)
  const changes: StoreChange[] = []
  store.subscribe((c) => changes.push(c))
  return { store, h, changes }
}

describe('HouseStore', () => {
  it('completes tasks: persists, updates memory, notifies, and decay resets', async () => {
    const { store, h, changes } = await setup()
    const sheets = h.tasks.find((t) => t.itemId === 'bed')!
    h.clock.advanceDays(30)
    expect(store.status().tasks.get(sheets.id)?.stage).toBe('neglected')

    const events = await store.complete([sheets.id])

    expect(store.status().tasks.get(sheets.id)?.stage).toBe('fresh')
    expect(changes).toEqual([{ kind: 'events', events }])
    expect((await repo.loadHouse('home'))!.events.map((e) => e.id)).toContain(events[0]!.id)
  })

  it('backdates with "done earlier"', async () => {
    const { store, h } = await setup()
    h.clock.advanceDays(10)
    const at = daysBefore(store.now(), 2)
    const [e] = await store.complete([h.tasks[0]!.id], { at })
    expect(e!.at).toBe(at.toISOString())
  })

  it('undo voids events and decay falls back to before', async () => {
    const { store, h } = await setup()
    const task = h.tasks[0]!
    h.clock.advanceDays(30)
    const before = store.status().tasks.get(task.id)!.pressure
    const done = await store.complete([task.id])
    const voids = await store.undo(done)
    expect(voids).toHaveLength(1)
    expect(store.status().tasks.get(task.id)!.pressure).toBeCloseTo(before)
  })

  it('undo is idempotent: undoing twice adds nothing', async () => {
    const { store, h } = await setup()
    const done = await store.complete([h.tasks[0]!.id])
    await store.undo(done)
    expect(await store.undo(done)).toEqual([])
  })

  it('skip resets decay but is recorded as a skip', async () => {
    const { store, h } = await setup()
    h.clock.advanceDays(30)
    const [e] = await store.skip(h.tasks[0]!.id)
    expect(e!.kind).toBe('skip')
    expect(store.status().tasks.get(h.tasks[0]!.id)?.stage).toBe('fresh')
  })

  it('history: newest first, voided hidden, only this item', async () => {
    const { store, h } = await setup()
    const [sheets, mattress] = h.tasks.filter((t) => t.itemId === 'bed')
    h.clock.advanceDays(1)
    const [a] = await store.complete([sheets!.id])
    h.clock.advanceDays(1)
    const [b] = await store.complete([mattress!.id])
    await store.undo([b!])

    const history = store.history('bed')
    expect(history[0]!.event.id).toBe(a!.id)
    expect(history.map((x) => x.event.id)).not.toContain(b!.id)
    expect(history.every((x) => x.task.itemId === 'bed')).toBe(true)
  })

  it('updates item notes and notifies', async () => {
    const { store, changes } = await setup()
    const bed = { ...store.item('bed')!, notes: 'Queen' }
    await store.updateItem(bed)
    expect(store.item('bed')?.notes).toBe('Queen')
    expect(changes.at(-1)).toEqual({ kind: 'item', item: bed })
    expect((await repo.loadHouse('home'))!.items.find((i) => i.id === 'bed')?.notes).toBe('Queen')
  })

  it('a failing listener does not stop the others', async () => {
    const { store, h, changes } = await setup()
    store.subscribe(() => {
      throw new Error('boom')
    })
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    try {
      await store.complete([h.tasks[0]!.id])
    } finally {
      console.error = original
    }
    expect(changes).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })
})
