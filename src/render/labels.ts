/**
 * Where a room's name goes: the first corner of the room not covered by an item,
 * so labels don't sit under icons. Pure.
 */
import { cellKey, footprint, isFloorItem, rectCells, type Item, type Room } from '../domain'
import { CELL } from './geometry'

export interface LabelPlacement {
  x: number
  y: number
  anchor: 'start' | 'end'
  baseline: 'hanging' | 'text-after-edge'
}

const PADDING = 6
/** Cells a label typically spans, inward from its corner. */
const LABEL_CELLS = 2

export function labelPlacement(room: Room, items: readonly Item[]): LabelPlacement {
  const occupied = new Set(
    items.filter((i) => i.roomId === room.id && !isFloorItem(i)).flatMap((i) => rectCells(footprint(i))).map((c) => cellKey(c.x, c.y)),
  )
  const free = (cx: number, cy: number, dir: 1 | -1, span: number) =>
    Array.from({ length: span }, (_, k) => cellKey(cx + dir * k, cy)).every((k) => !occupied.has(k))

  for (const r of room.cells) {
    const span = Math.min(LABEL_CELLS, r.w)
    const corners: [number, number, 1 | -1, LabelPlacement][] = [
      [r.x, r.y, 1, { x: r.x * CELL + PADDING, y: r.y * CELL + PADDING, anchor: 'start', baseline: 'hanging' }],
      [r.x + r.w - 1, r.y, -1, { x: (r.x + r.w) * CELL - PADDING, y: r.y * CELL + PADDING, anchor: 'end', baseline: 'hanging' }],
      [r.x, r.y + r.h - 1, 1, { x: r.x * CELL + PADDING, y: (r.y + r.h) * CELL - PADDING, anchor: 'start', baseline: 'text-after-edge' }],
      [r.x + r.w - 1, r.y + r.h - 1, -1, { x: (r.x + r.w) * CELL - PADDING, y: (r.y + r.h) * CELL - PADDING, anchor: 'end', baseline: 'text-after-edge' }],
    ]
    for (const [cx, cy, dir, placement] of corners) if (free(cx, cy, dir, span)) return placement
  }
  const r = room.cells[0]!
  return { x: r.x * CELL + PADDING, y: r.y * CELL + PADDING, anchor: 'start', baseline: 'hanging' }
}
