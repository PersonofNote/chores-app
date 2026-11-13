import { describe, expect, it } from 'vitest'
import { checkItem, checkRoom, describeProblem, findItemSpot, findRoomSpot, moveRoom, roomAt } from './layout'
import type { Item, Room } from './types'

const home = { gridSize: { w: 10, h: 8 } }
const room = (id: string, cells: Room['cells']): Room => ({ id, homeId: 'h', name: id, cells })
const item = (id: string, roomId: string, x: number, y: number, w = 1, h = 1, rotation: Item['rotation'] = 0, type = 'bed'): Item => ({
  id, roomId, type, skin: '', cell: { x, y }, size: { w, h }, rotation,
})

// a: 4×4 at origin. b: an L, 3×2 at (5,0) plus 2×2 below its left part.
const a = room('a', [{ x: 0, y: 0, w: 4, h: 4 }])
const b = room('b', [{ x: 5, y: 0, w: 3, h: 2 }, { x: 5, y: 2, w: 2, h: 2 }])
const rooms = [a, b]

describe('checkRoom', () => {
  it('accepts a room in free space, and an L made of its own overlapping rects', () => {
    expect(checkRoom(home, rooms, [], room('c', [{ x: 0, y: 5, w: 3, h: 3 }]))).toBeNull()
    expect(checkRoom(home, rooms, [], room('c', [{ x: 0, y: 5, w: 3, h: 2 }, { x: 0, y: 5, w: 1, h: 3 }]))).toBeNull()
  })

  it('rejects overlap with another room, but not with its own old self', () => {
    expect(checkRoom(home, rooms, [], room('c', [{ x: 3, y: 3, w: 2, h: 2 }]))).toEqual({ kind: 'overlaps-room', roomId: 'a' })
    expect(checkRoom(home, rooms, [], moveRoom(a, 1, 0))).toBeNull()
  })

  it('rejects going out of bounds and having no sections', () => {
    expect(checkRoom(home, rooms, [], moveRoom(a, -1, 0))?.kind).toBe('out-of-bounds')
    expect(checkRoom(home, rooms, [], room('a', []))?.kind).toBe('empty-room')
  })

  it('rejects a resize that strands an item, ignoring floor items', () => {
    const items = [item('bed', 'a', 2, 2, 2, 2), item('floor', 'a', 3, 3, 1, 1, 0, 'floor')]
    expect(checkRoom(home, rooms, items, room('a', [{ x: 0, y: 0, w: 3, h: 4 }]))).toEqual({ kind: 'strands-item', itemId: 'bed' })
    expect(checkRoom(home, rooms, items, room('a', [{ x: 0, y: 0, w: 4, h: 4 }]))).toBeNull()
  })
})

describe('checkItem', () => {
  it('finds the room an item lands in, including across rooms', () => {
    expect(checkItem(home, rooms, [], item('x', 'a', 5, 3))).toEqual({ ok: true, roomId: 'b' })
  })

  it('rejects straddling a wall or sitting outside any room', () => {
    expect(checkItem(home, rooms, [], item('x', 'a', 3, 0, 2, 1))).toEqual({ ok: false, problem: { kind: 'outside-room' } })
    expect(checkItem(home, rooms, [], item('x', 'a', 9, 7))).toEqual({ ok: false, problem: { kind: 'outside-room' } })
    // Inside the L's bounding box but not its cells:
    expect(checkItem(home, rooms, [], item('x', 'b', 7, 3))).toEqual({ ok: false, problem: { kind: 'outside-room' } })
  })

  it('rotation changes the footprint that must fit', () => {
    expect(checkItem(home, rooms, [], item('sofa', 'a', 3, 0, 2, 1, 0)).ok).toBe(false)
    expect(checkItem(home, rooms, [], item('sofa', 'a', 3, 0, 2, 1, 90))).toEqual({ ok: true, roomId: 'a' })
  })

  it('rejects overlapping another item (but not itself or a floor item)', () => {
    const items = [item('bed', 'a', 0, 0, 2, 2), item('floor', 'a', 0, 0, 1, 1, 0, 'floor')]
    expect(checkItem(home, rooms, items, item('x', 'a', 1, 1))).toEqual({ ok: false, problem: { kind: 'overlaps-item', itemId: 'bed' } })
    expect(checkItem(home, rooms, items, item('bed', 'a', 1, 1, 2, 2))).toEqual({ ok: true, roomId: 'a' })
  })
})

describe('free-spot search', () => {
  it('findRoomSpot returns the nearest free rect, or null when nothing fits', () => {
    expect(findRoomSpot(home, rooms, { w: 2, h: 2 }, { x: 9, y: 7 })).toEqual({ x: 8, y: 6, w: 2, h: 2 })
    expect(findRoomSpot(home, rooms, { w: 10, h: 8 })).toBeNull()
  })

  it('findItemSpot returns the first free cell in the room that fits', () => {
    const items = [item('bed', 'a', 0, 0, 2, 2)]
    expect(findItemSpot(home, rooms, items, a, { w: 1, h: 1 })).toEqual({ x: 2, y: 0 })
    expect(findItemSpot(home, rooms, items, a, { w: 2, h: 2 })).toEqual({ x: 2, y: 0 })
    expect(findItemSpot(home, rooms, items, b, { w: 3, h: 3 })).toBeNull()
  })
})

it('roomAt and describeProblem', () => {
  expect(roomAt(rooms, { x: 6, y: 3 })?.id).toBe('b')
  expect(roomAt(rooms, { x: 4, y: 0 })).toBeUndefined()
  expect(describeProblem({ kind: 'overlaps-room', roomId: 'a' })).toMatch(/overlap/)
})
