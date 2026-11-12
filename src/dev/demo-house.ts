/**
 * Dev-only sample house, so the map has something to show before the editor (M7)
 * exists. Seeds are spread on purpose so every decay stage is visible at once.
 * Only loaded via dynamic import under `import.meta.env.DEV`.
 */
import {
  createDefaultTasks,
  daysBefore,
  defaultLibrary,
  FLOOR_TYPE,
  recordSeed,
  type Clock,
  type GridCell,
  type Home,
  type IdGenerator,
  type Item,
  type Rotation,
  type Room,
} from '../domain'
import type { Changes } from '../storage'

/** Pressures cycled across tasks: fresh, fine, due soon, overdue (two), neglected. */
const DEMO_PRESSURES = [0.2, 0.6, 0.9, 1.1, 1.4, 2.0]

export function buildDemoHouse(clock: Clock, newId: IdGenerator): Changes {
  const home: Home = { id: newId(), name: 'Demo house', gridSize: { w: 14, h: 10 } }
  const room = (name: string, cells: Room['cells']): Room => ({ id: newId(), homeId: home.id, name, cells })
  const bedroom = room('Bedroom', [{ x: 0, y: 0, w: 5, h: 5 }])
  const bathroom = room('Bathroom', [{ x: 5, y: 0, w: 3, h: 3 }])
  const kitchen = room('Kitchen', [{ x: 8, y: 0, w: 6, h: 3 }, { x: 11, y: 3, w: 3, h: 3 }])
  const living = room('Living room', [{ x: 0, y: 5, w: 11, h: 5 }])
  const rooms = [bedroom, bathroom, kitchen, living]

  const item = (r: Room, type: string, cell: GridCell, rotation: Rotation = 0): Item => ({
    id: newId(),
    roomId: r.id,
    type,
    skin: `${type}.icon`,
    cell,
    size: defaultLibrary.items[type]?.size ?? { w: 1, h: 1 },
    rotation,
  })
  const items: Item[] = [
    ...rooms.map((r) => item(r, FLOOR_TYPE, { x: r.cells[0]!.x, y: r.cells[0]!.y })),
    item(bedroom, 'bed', { x: 1, y: 1 }),
    item(bedroom, 'plant', { x: 4, y: 4 }),
    item(bedroom, 'smoke-detector', { x: 4, y: 0 }),
    item(bathroom, 'toilet', { x: 5, y: 0 }),
    item(bathroom, 'shower', { x: 7, y: 0 }),
    item(bathroom, 'sink', { x: 6, y: 2 }),
    item(kitchen, 'sink', { x: 9, y: 0 }),
    item(kitchen, 'stove', { x: 10, y: 0 }),
    item(kitchen, 'fridge', { x: 13, y: 0 }),
    item(kitchen, 'washing-machine', { x: 12, y: 4 }),
    item(living, 'sofa', { x: 2, y: 7 }),
    item(living, 'sofa', { x: 5, y: 8 }, 90),
    item(living, 'plant', { x: 0, y: 9 }),
    item(living, 'hvac-filter', { x: 10, y: 5 }),
    item(living, 'water-heater', { x: 10, y: 9 }),
  ]

  const tasks = items.flatMap((i) => createDefaultTasks(i.id, i.type, newId))
  const now = clock.now()
  const events = tasks.map((t, i) =>
    recordSeed(t.id, daysBefore(now, t.intervalDays * DEMO_PRESSURES[i % DEMO_PRESSURES.length]!), { clock, newId }),
  )
  return { homes: [home], rooms, items, tasks, events }
}
