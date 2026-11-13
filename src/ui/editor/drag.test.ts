import { describe, expect, it } from 'vitest'
import type { Item, Room } from '../../domain'
import { check, propose, resizeRect } from './drag'

const home = { gridSize: { w: 10, h: 8 } }
const a: Room = { id: 'a', homeId: 'h', name: 'A', cells: [{ x: 0, y: 0, w: 4, h: 4 }] }
const b: Room = { id: 'b', homeId: 'h', name: 'B', cells: [{ x: 5, y: 0, w: 4, h: 4 }] }
const bed: Item = { id: 'bed', roomId: 'a', type: 'bed', skin: '', cell: { x: 1, y: 1 }, size: { w: 2, h: 2 }, rotation: 0 }
const floor: Item = { id: 'fa', roomId: 'a', type: 'floor', skin: '', cell: { x: 0, y: 0 }, size: { w: 1, h: 1 }, rotation: 0 }

describe('resizeRect', () => {
  const r = { x: 2, y: 2, w: 3, h: 3 }
  it.each([
    ['se', 1, 2, { x: 2, y: 2, w: 4, h: 5 }],
    ['nw', -1, -2, { x: 1, y: 0, w: 4, h: 5 }],
    ['ne', 2, 1, { x: 2, y: 3, w: 5, h: 2 }],
    ['sw', 1, -1, { x: 3, y: 2, w: 2, h: 2 }],
  ] as const)('%s by (%i, %i)', (corner, dx, dy, expected) => {
    expect(resizeRect(r, corner, dx, dy)).toEqual(expected)
  })
  it('never collapses below 1 × 1', () => {
    expect(resizeRect(r, 'se', -10, -10)).toEqual({ x: 2, y: 2, w: 1, h: 1 })
    expect(resizeRect(r, 'nw', 10, 10)).toEqual({ x: 4, y: 4, w: 1, h: 1 })
  })
})

describe('propose + check', () => {
  it('moving a room carries its items', () => {
    const p = propose({ kind: 'move-room', room: a, items: [bed, floor] }, 0, 4)
    const c = check(home, [a, b], [bed, floor], p)
    expect(c.ok && c.proposal.items.find((i) => i.id === 'bed')?.cell).toEqual({ x: 1, y: 5 })
  })

  it('a room cannot be moved onto another', () => {
    const c = check(home, [a, b], [bed], propose({ kind: 'move-room', room: a, items: [bed] }, 3, 0))
    expect(c).toEqual({ ok: false, problem: { kind: 'overlaps-room', roomId: 'b' } })
  })

  it('a resize cannot strand an item', () => {
    const c = check(home, [a, b], [bed], propose({ kind: 'resize', room: a, rectIndex: 0, corner: 'se', floor: undefined }, -2, 0))
    expect(c).toEqual({ ok: false, problem: { kind: 'strands-item', itemId: 'bed' } })
  })

  it('a resize re-anchors the floor item', () => {
    const c = check(home, [a, b], [bed, floor], propose({ kind: 'resize', room: a, rectIndex: 0, corner: 'nw', floor }, 0, 0))
    expect(c.ok && c.proposal.items).toEqual([{ ...floor, cell: { x: 0, y: 0 } }])
  })

  it('moving an item into another room changes its room', () => {
    const c = check(home, [a, b], [bed], propose({ kind: 'move-item', item: bed }, 5, 0))
    expect(c.ok && c.proposal.items[0]!.roomId).toBe('b')
  })
})
