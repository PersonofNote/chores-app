import { describe, expect, it } from 'vitest'
import type { Item, Room } from '../domain'
import { CELL } from './geometry'
import { labelPlacement } from './labels'

const room: Room = { id: 'r', homeId: 'h', name: 'Room', cells: [{ x: 0, y: 0, w: 4, h: 3 }] }
const item = (x: number, y: number, type = 'plant'): Item => ({
  id: `${x},${y}`, roomId: 'r', type, skin: '', cell: { x, y }, size: { w: 1, h: 1 }, rotation: 0,
})

describe('labelPlacement', () => {
  it('uses the top-left corner when free', () => {
    expect(labelPlacement(room, [])).toEqual({ x: 6, y: 6, anchor: 'start', baseline: 'hanging' })
  })

  it('moves to the top-right when an item is in the label’s path, right-aligned', () => {
    expect(labelPlacement(room, [item(1, 0)])).toEqual({ x: 4 * CELL - 6, y: 6, anchor: 'end', baseline: 'hanging' })
  })

  it('falls to a bottom corner when both top corners are taken', () => {
    expect(labelPlacement(room, [item(0, 0), item(3, 0)])).toMatchObject({ anchor: 'start', baseline: 'text-after-edge', y: 3 * CELL - 6 })
  })

  it('ignores floor items and other rooms’ items', () => {
    expect(labelPlacement(room, [item(0, 0, 'floor'), { ...item(1, 0), roomId: 'other' }]).anchor).toBe('start')
  })
})
