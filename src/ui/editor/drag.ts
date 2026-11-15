/**
 * Editor drags, pure: what's being dragged + how many cells → a proposed layout,
 * then validated against the layout rules. The editor previews valid proposals
 * and commits the last valid one on release.
 */
import {
  checkItem,
  checkRoom,
  footprint,
  isFloorItem,
  moveItem,
  moveRoom,
  type GridRect,
  type Home,
  type Item,
  type LayoutProblem,
  type Room,
} from '../../domain'

export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

export type DragTarget =
  /** `items` are the room's items, which move with it. */
  | { kind: 'move-room'; room: Room; items: readonly Item[] }
  | { kind: 'resize'; room: Room; rectIndex: number; corner: Corner; floor: Item | undefined }
  | { kind: 'move-item'; item: Item }
  | { kind: 'resize-item'; item: Item; corner: Corner }

export interface Proposal {
  rooms: Room[]
  items: Item[]
}

/** Resizes from a corner, keeping the opposite corner fixed and at least 1 × 1. */
export function resizeRect(r: GridRect, corner: Corner, dx: number, dy: number): GridRect {
  let x1 = r.x
  let y1 = r.y
  let x2 = r.x + r.w
  let y2 = r.y + r.h
  if (corner === 'nw' || corner === 'sw') x1 = Math.min(x1 + dx, x2 - 1)
  else x2 = Math.max(x2 + dx, x1 + 1)
  if (corner === 'nw' || corner === 'ne') y1 = Math.min(y1 + dy, y2 - 1)
  else y2 = Math.max(y2 + dy, y1 + 1)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function propose(t: DragTarget, dx: number, dy: number): Proposal {
  switch (t.kind) {
    case 'move-room':
      return { rooms: [moveRoom(t.room, dx, dy)], items: t.items.map((i) => moveItem(i, dx, dy)) }
    case 'resize': {
      const cells = t.room.cells.map((r, i) => (i === t.rectIndex ? resizeRect(r, t.corner, dx, dy) : r))
      const room = { ...t.room, cells }
      // Keep the (invisible) floor item anchored inside its room.
      const floor = t.floor && { ...t.floor, cell: { x: cells[0]!.x, y: cells[0]!.y } }
      return { rooms: [room], items: floor ? [floor] : [] }
    }
    case 'move-item':
      return { rooms: [], items: [moveItem(t.item, dx, dy)] }
    case 'resize-item':
      return { rooms: [], items: [resizeItem(t.item, t.corner, dx, dy)] }
  }
}

/**
 * Resizes an item from a corner of its footprint (what's on screen). `size` is the
 * unrotated footprint, so a quarter-turned item stores the result swapped back.
 */
export function resizeItem(item: Item, corner: Corner, dx: number, dy: number): Item {
  const r = resizeRect(footprint(item), corner, dx, dy)
  const turned = item.rotation === 90 || item.rotation === 270
  return { ...item, cell: { x: r.x, y: r.y }, size: turned ? { w: r.h, h: r.w } : { w: r.w, h: r.h } }
}

export type Checked = { ok: true; proposal: Proposal } | { ok: false; problem: LayoutProblem }

/** Validates a proposal against the rest of the house; fixes up items' rooms. */
export function check(
  home: Pick<Home, 'gridSize'>,
  rooms: readonly Room[],
  items: readonly Item[],
  proposal: Proposal,
): Checked {
  const nextRooms = rooms.map((r) => proposal.rooms.find((x) => x.id === r.id) ?? r)
  const nextItems = items.map((i) => proposal.items.find((x) => x.id === i.id) ?? i)
  for (const room of proposal.rooms) {
    const problem = checkRoom(home, nextRooms, nextItems, room)
    if (problem) return { ok: false, problem }
  }
  const placed: Item[] = []
  for (const item of proposal.items) {
    if (isFloorItem(item)) {
      placed.push(item)
      continue
    }
    const result = checkItem(home, nextRooms, nextItems, item)
    if (!result.ok) return { ok: false, problem: result.problem }
    placed.push(result.roomId === item.roomId ? item : { ...item, roomId: result.roomId })
  }
  return { ok: true, proposal: { rooms: proposal.rooms, items: placed } }
}
