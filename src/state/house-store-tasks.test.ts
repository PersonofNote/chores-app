import { afterEach, describe, expect, it } from 'vitest'
import { recordSeed, type Task } from '../domain'
import type { Repository } from '../storage'
import { openTestRepository, smallHouse } from '../storage/test-fixtures'
import { ChoreError, HouseStore, type StoreChange } from './house-store'

let repo: Repository
afterEach(() => repo?.close())

async function setup() {
  repo = await openTestRepository()
  const h = smallHouse()
  await repo.save({ homes: [h.home], rooms: h.rooms, items: h.items, tasks: h.tasks, events: h.events })
  const store = new HouseStore(repo, (await repo.loadHouse('home'))!, h)
  const changes: StoreChange[] = []
  store.subscribe((c) => changes.push(c))
  const saved = async () => (await repo.loadHouse('home'))!
  return { store, h, changes, saved }
}

const newTask = (over: Partial<Task> = {}): Task => ({ id: 'new', itemId: 'bed', name: 'Wash duvet', intervalDays: 90, kind: 'interval', ...over })

describe('HouseStore chores', () => {
  it('adds a chore with its seed in one write, and tells subscribers', async () => {
    const { store, h, changes, saved } = await setup()
    const seed = recordSeed('new', h.clock.now(), h)
    const task = await store.addTask(newTask({ name: '  Wash   duvet ' }), [seed])

    expect(task.name).toBe('Wash duvet')
    expect(store.tasksForItem('bed').map((t) => t.name)).toContain('Wash duvet')
    expect(store.status().tasks.get('new')?.stage).toBe('fresh')
    expect(changes).toEqual([{ kind: 'tasks', itemId: 'bed' }])
    const data = await saved()
    expect(data.tasks.find((t) => t.id === 'new')?.name).toBe('Wash duvet')
    expect(data.events.some((e) => e.id === seed.id)).toBe(true)
  })

  it('refuses a duplicate name on the same item, and saves nothing', async () => {
    const { store, changes, saved } = await setup()
    await expect(store.addTask(newTask({ name: 'wash SHEETS' }))).rejects.toThrow(ChoreError)
    expect(changes).toEqual([])
    expect((await saved()).tasks.some((t) => t.id === 'new')).toBe(false)
  })

  it('allows the same name on a different item', async () => {
    const { store } = await setup()
    await expect(store.addTask(newTask({ itemId: 'plant', name: 'Wash sheets' }))).resolves.toBeDefined()
  })

  it('refuses a chore for an unknown item, or seeds for another task', async () => {
    const { store, h } = await setup()
    await expect(store.addTask(newTask({ itemId: 'nope' }))).rejects.toThrow('Unknown item')
    await expect(store.addTask(newTask(), [recordSeed('other', h.clock.now(), h)])).rejects.toThrow('Seed events')
  })

  it('renames a chore and changes how often, keeping its history', async () => {
    const { store, h, changes, saved } = await setup()
    const sheets = store.tasksForItem('bed').find((t) => t.name === 'Wash sheets')!
    h.clock.advanceDays(10)
    expect(store.status().tasks.get(sheets.id)?.pressure).toBeCloseTo(10 / 7)

    await store.updateTask({ ...sheets, name: 'Change sheets', intervalDays: 14 })

    expect(store.task(sheets.id)?.name).toBe('Change sheets')
    expect(store.status().tasks.get(sheets.id)?.pressure).toBeCloseTo(10 / 14)
    expect(store.history('bed').some((e) => e.task.id === sheets.id)).toBe(true)
    expect(changes).toEqual([{ kind: 'tasks', itemId: 'bed' }])
    expect((await saved()).tasks.find((t) => t.id === sheets.id)).toMatchObject({ name: 'Change sheets', intervalDays: 14 })
  })

  it('refuses edits that break the rules or move a chore', async () => {
    const { store } = await setup()
    const [sheets, mattress] = store.tasksForItem('bed') as [Task, Task]
    await expect(store.updateTask({ ...sheets, name: mattress.name })).rejects.toThrow(ChoreError)
    await expect(store.updateTask({ ...sheets, intervalDays: 0 })).rejects.toThrow(ChoreError)
    await expect(store.updateTask({ ...sheets, itemId: 'plant' })).rejects.toThrow('another item')
    await expect(store.updateTask(newTask())).rejects.toThrow('Unknown task')
  })

  it('removes a chore but keeps its events', async () => {
    const { store, changes, saved } = await setup()
    const sheets = store.tasksForItem('bed')[0]!
    await store.deleteTask(sheets.id)

    expect(store.task(sheets.id)).toBeUndefined()
    expect(changes).toEqual([{ kind: 'tasks', itemId: 'bed' }])
    expect((await saved()).tasks.some((t) => t.id === sheets.id)).toBe(false)
    // Kept in the database and in backups, though not loaded with the house.
    expect((await repo.exportAll()).events.some((e) => e.taskId === sheets.id)).toBe(true)
    // Its leftover events don't break decay.
    expect(() => store.status()).not.toThrow()
  })

  it('ignores removing a chore that isn’t there', async () => {
    const { store, changes } = await setup()
    await store.deleteTask('nope')
    expect(changes).toEqual([])
  })
})

describe('HouseStore item names', () => {
  it('names an item (tidied), saves it, and redraws the map', async () => {
    const { store, changes, saved } = await setup()
    const item = await store.renameItem('bed', '  Guest   bed ')
    expect(item.name).toBe('Guest bed')
    expect(store.item('bed')?.name).toBe('Guest bed')
    expect((await saved()).items.find((i) => i.id === 'bed')?.name).toBe('Guest bed')
    expect(changes).toContainEqual({ kind: 'layout' })
  })

  it('an empty name goes back to the type label', async () => {
    const { store, saved } = await setup()
    await store.renameItem('bed', 'Guest bed')
    await store.renameItem('bed', '   ')
    expect(store.item('bed')).not.toHaveProperty('name')
    expect((await saved()).items.find((i) => i.id === 'bed')).not.toHaveProperty('name')
  })
})
