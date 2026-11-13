/**
 * Layout rules for the grid, pure. The editor proposes a change and asks these
 * whether it's allowed; nothing invalid reaches storage.
 *
 * - Everything stays inside the home's grid.
 * - Rooms don't overlap each other (a room's own rectangles may overlap; that's
 *   how L-shapes are built).
 * - A drawn item sits entirely inside one room and doesn't overlap other items.
 *   Floor items aren't drawn and are exempt.
 */
import { isFloorItem } from './library'
import type { GridCell, GridRect, GridSize, Home, Id, Item, Room } from './types'

export type LayoutProblem =
  | { kind: 'out-of-bounds' }
  | { kind: 'overlaps-room'; roomId: Id }
  | { kind: 'outside-room' }
  | { kind: 'overlaps-item'; itemId: Id }
  /** A room change would leave one of its items outside it. */
  | { kind: 'strands-item'; itemId: Id }
  | { kind: 'empty-room' }

export const cellKey = (x: number, y: number) => `${x},${y}`

export function rectCells(r: GridRect): GridCell[] {
  const cells: GridCell[] = []
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) cells.push({ x, y })
  return cells
}

export function roomCellSet(room: Pick<Room, 'cells'>): Set<string> {
  return new Set(room.cells.flatMap(rectCells).map((c) => cellKey(c.x, c.y)))
}

/**
 * Cells an item occupies. `size` is the unrotated footprint; a quarter turn swaps it.
 * `cell` is always the top-left of the occupied area.
 */
export function footprint(item: Pick<Item, 'cell' | 'size' | 'rotation'>): GridRect {
  const turned = item.rotation === 90 || item.rotation === 270
  return {
    x: item.cell.x,
    y: item.cell.y,
    w: turned ? item.size.h : item.size.w,
    h: turned ? item.size.w : item.size.h,
  }
}

const inBounds = (r: GridRect, size: GridSize) => r.x >= 0 && r.y >= 0 && r.x + r.w <= size.w && r.y + r.h <= size.h

export function roomAt(rooms: readonly Room[], cell: GridCell): Room | undefined {
  const key = cellKey(cell.x, cell.y)
  return rooms.find((r) => roomCellSet(r).has(key))
}

export function boundingBox(rects: readonly GridRect[]): GridRect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  }
}

/**
 * Checks `room` (new, or an edited version of an existing one) against the rest of
 * the house. `items` are all items; those in this room must still fit inside it.
 */
export function checkRoom(
  home: Pick<Home, 'gridSize'>,
  rooms: readonly Room[],
  items: readonly Item[],
  room: Room,
): LayoutProblem | null {
  if (room.cells.length === 0) return { kind: 'empty-room' }
  if (!room.cells.every((r) => inBounds(r, home.gridSize))) return { kind: 'out-of-bounds' }
  const mine = roomCellSet(room)
  for (const other of rooms) {
    if (other.id === room.id) continue
    for (const key of roomCellSet(other)) if (mine.has(key)) return { kind: 'overlaps-room', roomId: other.id }
  }
  for (const item of items) {
    if (item.roomId !== room.id || isFloorItem(item)) continue
    if (!rectCells(footprint(item)).every((c) => mine.has(cellKey(c.x, c.y)))) return { kind: 'strands-item', itemId: item.id }
  }
  return null
}

export type ItemPlacement = { ok: true; roomId: Id } | { ok: false; problem: LayoutProblem }

/**
 * Checks `item` (new, or moved/rotated) and finds the room it lands in. The item's
 * current `roomId` is ignored: moving across a wall changes rooms.
 */
export function checkItem(
  home: Pick<Home, 'gridSize'>,
  rooms: readonly Room[],
  items: readonly Item[],
  item: Item,
): ItemPlacement {
  const area = footprint(item)
  if (!inBounds(area, home.gridSize)) return { ok: false, problem: { kind: 'out-of-bounds' } }
  const cells = rectCells(area)
  const room = roomAt(rooms, cells[0]!)
  if (!room) return { ok: false, problem: { kind: 'outside-room' } }
  const roomCells = roomCellSet(room)
  if (!cells.every((c) => roomCells.has(cellKey(c.x, c.y)))) return { ok: false, problem: { kind: 'outside-room' } }
  const mine = new Set(cells.map((c) => cellKey(c.x, c.y)))
  for (const other of items) {
    if (other.id === item.id || isFloorItem(other)) continue
    if (rectCells(footprint(other)).some((c) => mine.has(cellKey(c.x, c.y)))) {
      return { ok: false, problem: { kind: 'overlaps-item', itemId: other.id } }
    }
  }
  return { ok: true, roomId: room.id }
}

const distance = (a: GridCell, b: GridCell) => Math.hypot(a.x - b.x, a.y - b.y)

/** The free spot for a new w × h room nearest `near`, or null if none fits. */
export function findRoomSpot(
  home: Pick<Home, 'gridSize'>,
  rooms: readonly Room[],
  size: GridSize,
  near: GridCell = { x: 0, y: 0 },
): GridRect | null {
  const taken = new Set(rooms.flatMap((r) => [...roomCellSet(r)]))
  let best: GridRect | null = null
  for (let y = 0; y + size.h <= home.gridSize.h; y++) {
    for (let x = 0; x + size.w <= home.gridSize.w; x++) {
      const rect = { x, y, ...size }
      if (rectCells(rect).some((c) => taken.has(cellKey(c.x, c.y)))) continue
      if (!best || distance(rect, near) < distance(best, near)) best = rect
    }
  }
  return best
}

/** The first free top-left cell for an item of `size` in `room` (reading order), or null. */
export function findItemSpot(
  home: Pick<Home, 'gridSize'>,
  rooms: readonly Room[],
  items: readonly Item[],
  room: Room,
  size: GridSize,
): GridCell | null {
  const box = boundingBox(room.cells)
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const probe: Item = { id: '\0probe', roomId: room.id, type: '', skin: '', cell: { x, y }, size, rotation: 0 }
      const placed = checkItem(home, rooms, items, probe)
      if (placed.ok && placed.roomId === room.id) return { x, y }
    }
  }
  return null
}

export function moveRoom(room: Room, dx: number, dy: number): Room {
  return { ...room, cells: room.cells.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) }
}

export function moveItem<T extends Pick<Item, 'cell'>>(item: T, dx: number, dy: number): T {
  return { ...item, cell: { x: item.cell.x + dx, y: item.cell.y + dy } }
}

/** Human-readable reason, for the editor to show. */
export function describeProblem(p: LayoutProblem): string {
  switch (p.kind) {
    case 'out-of-bounds':
      return 'That goes past the edge of the house.'
    case 'overlaps-room':
      return 'Rooms can’t overlap.'
    case 'outside-room':
      return 'Items need to sit inside a room.'
    case 'overlaps-item':
      return 'Something is already there.'
    case 'strands-item':
      return 'That would leave an item outside the room.'
    case 'empty-room':
      return 'A room needs at least one section.'
  }
}
