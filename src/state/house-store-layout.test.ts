import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultTasks, moveItem, moveRoom, sequentialIds, type Item, type Room } from '../domain'
import type { Repository } from '../storage'
import { openTestRepository, smallHouse } from '../storage/test-fixtures'
import { HouseStore, LayoutError, type StoreChange } from './house-store'

// smallHouse: home 12×8; bedroom 4×4 at origin (bed 0,0; plant 3,3); kitchen L at x 4–7 (fridge 4,0).
let repo: Repository
afterEach(() => repo?.close())

async function setup() {
  repo = await openTestRepository()
  const h = smallHouse()
  await repo.save({ homes: [h.home], rooms: h.rooms, items: h.items, tasks: h.tasks, events: h.events })
  const store = new HouseStore(repo, (await repo.loadHouse('home'))!, h)
  const changes: StoreChange[] = []
  store.subscribe((c) => changes.push(c))
  const reload = async () => (await repo.loadHouse('home'))!
  return { store, h, changes, reload, newId: sequentialIds('n') }
}

const floorFor = (room: Room): Item => ({
  id: `${room.id}-floor`, roomId: room.id, type: 'floor', skin: 'floor.icon', cell: { x: room.cells[0]!.x, y: room.cells[0]!.y }, size: { w: 1, h: 1 }, rotation: 0,
})

describe('HouseStore layout', () => {
  it('adds a room with its floor and floor chores, and announces a layout change', async () => {
    const { store, changes, reload, newId } = await setup()
    const office: Room = { id: 'office', homeId: 'home', name: 'Office', cells: [{ x: 0, y: 5, w: 3, h: 3 }] }
    const floor = floorFor(office)
    await store.addRoom(office, floor, createDefaultTasks(floor.id, 'floor', newId))
    expect(changes).toEqual([{ kind: 'layout' }])
    const saved = await reload()
    expect(saved.rooms.map((r) => r.id)).toContain('office')
    expect(saved.tasks.filter((t) => t.itemId === floor.id)).toHaveLength(2)
  })

  it('refuses an overlapping room and stores nothing', async () => {
    const { store, reload, changes } = await setup()
    const bad: Room = { id: 'bad', homeId: 'home', name: 'Bad', cells: [{ x: 2, y: 2, w: 3, h: 3 }] }
    await expect(store.addRoom(bad, floorFor(bad), [])).rejects.toThrow(LayoutError)
    expect((await reload()).rooms.map((r) => r.id)).not.toContain('bad')
    expect(changes).toEqual([])
  })

  it('moves a room together with its items, atomically', async () => {
    const { store, reload } = await setup()
    const bedroom = store.house.rooms.find((r) => r.id === 'bedroom')!
    const items = store.itemsInRoom('bedroom').map((i) => moveItem(i, 0, 4))
    await store.updateLayout([moveRoom(bedroom, 0, 4)], items)
    const saved = await reload()
    expect(saved.rooms.find((r) => r.id === 'bedroom')!.cells[0]).toMatchObject({ x: 0, y: 4 })
    expect(saved.items.find((i) => i.id === 'bed')!.cell).toEqual({ x: 0, y: 4 })
  })

  it('refuses a room move that leaves its items behind', async () => {
    const { store } = await setup()
    const bedroom = store.house.rooms.find((r) => r.id === 'bedroom')!
    await expect(store.updateLayout([moveRoom(bedroom, 0, 4)])).rejects.toThrow(LayoutError)
  })

  it('adds an item and moving it across a wall changes its room', async () => {
    const { store, reload, newId } = await setup()
    const lamp: Item = { id: 'lamp', roomId: 'bedroom', type: 'plant', skin: 'plant.icon', cell: { x: 1, y: 3 }, size: { w: 1, h: 1 }, rotation: 0 }
    await store.addItem(lamp, createDefaultTasks('lamp', 'plant', newId))
    const moved = await store.placeItem({ ...lamp, cell: { x: 5, y: 1 } })
    expect(moved.roomId).toBe('kitchen')
    expect((await reload()).items.find((i) => i.id === 'lamp')?.roomId).toBe('kitchen')
  })

  it('refuses an item on top of another', async () => {
    const { store } = await setup()
    const bed = store.item('bed')!
    await expect(store.placeItem({ ...bed, cell: { x: 3, y: 3 } })).rejects.toThrow('Something is already there')
  })

  it('deletes a room with its items and tasks; deletes a single item with its tasks', async () => {
    const { store, reload } = await setup()
    await store.deleteItem('fridge')
    expect(store.tasksForItem('fridge')).toEqual([])
    await store.deleteRoom('bedroom')
    const saved = await reload()
    expect(saved.rooms.map((r) => r.id)).toEqual(['kitchen'])
    expect(saved.items).toEqual([])
    expect(store.house.items).toEqual([])
  })

  it('refuses shrinking the home below its rooms', async () => {
    const { store } = await setup()
    await expect(store.updateHome({ ...store.house.home, gridSize: { w: 6, h: 8 } })).rejects.toThrow(LayoutError)
    await store.updateHome({ ...store.house.home, name: 'Flat', gridSize: { w: 9, h: 6 } })
    expect(store.house.home.name).toBe('Flat')
  })
})
