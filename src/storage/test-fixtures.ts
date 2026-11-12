// Fixtures for storage tests: a fresh in-memory IndexedDB per repository, and a small house.
import { IDBFactory } from 'fake-indexeddb'
import { createDefaultTasks, fixedClock, recordDone, sequentialIds, type Home, type Item, type Room } from '../domain'
import { openIdbRepository } from './repository'

export const openTestRepository = () => openIdbRepository({ factory: new IDBFactory() })

export function smallHouse() {
  const newId = sequentialIds('x')
  const clock = fixedClock('2026-03-01T09:00:00.000Z')
  const home: Home = { id: 'home', name: 'Home', gridSize: { w: 12, h: 8 } }
  const rooms: Room[] = [
    { id: 'bedroom', homeId: 'home', name: 'Bedroom', cells: [{ x: 0, y: 0, w: 4, h: 4 }] },
    { id: 'kitchen', homeId: 'home', name: 'Kitchen', cells: [{ x: 4, y: 0, w: 4, h: 3 }, { x: 4, y: 3, w: 2, h: 2 }] },
  ]
  const item = (id: string, roomId: string, type: string, x: number, y: number): Item => ({
    id, roomId, type, skin: `${type}.icon`, cell: { x, y }, size: { w: 1, h: 1 }, rotation: 0,
  })
  const items = [item('bed', 'bedroom', 'bed', 0, 0), item('plant', 'bedroom', 'plant', 3, 3), item('fridge', 'kitchen', 'fridge', 4, 0)]
  const tasks = items.flatMap((i) => createDefaultTasks(i.id, i.type, newId))
  const events = tasks.map((t) => recordDone(t.id, { clock, newId }))
  return { home, rooms, items, tasks, events, clock, newId }
}
