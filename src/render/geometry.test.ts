import { describe, expect, it } from 'vitest'
import { atLeast, boundingRect, CELL, footprint, gridToUnits, roomOutline, type Segment } from './geometry'

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({
  x1: x1 * CELL, y1: y1 * CELL, x2: x2 * CELL, y2: y2 * CELL,
})
const sortSegs = (s: Segment[]) => [...s].sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2)

describe('footprint', () => {
  const item = { cell: { x: 3, y: 1 }, size: { w: 2, h: 1 } }
  it('keeps the size unrotated or half-turned', () => {
    expect(footprint({ ...item, rotation: 0 })).toEqual({ x: 3, y: 1, w: 2, h: 1 })
    expect(footprint({ ...item, rotation: 180 })).toEqual({ x: 3, y: 1, w: 2, h: 1 })
  })
  it('swaps on a quarter turn', () => {
    expect(footprint({ ...item, rotation: 90 })).toEqual({ x: 3, y: 1, w: 1, h: 2 })
    expect(footprint({ ...item, rotation: 270 })).toEqual({ x: 3, y: 1, w: 1, h: 2 })
  })
})

describe('roomOutline', () => {
  it('outlines a rectangle with four walls', () => {
    expect(sortSegs(roomOutline([{ x: 0, y: 0, w: 3, h: 2 }]))).toEqual(
      sortSegs([seg(0, 0, 3, 0), seg(0, 2, 3, 2), seg(0, 0, 0, 2), seg(3, 0, 3, 2)]),
    )
  })

  it('gives an L-shape one outline with no wall where its rectangles meet', () => {
    // ███
    // █
    const outline = roomOutline([{ x: 0, y: 0, w: 3, h: 1 }, { x: 0, y: 1, w: 1, h: 1 }])
    expect(sortSegs(outline)).toEqual(
      sortSegs([
        seg(0, 0, 3, 0), // top
        seg(1, 1, 3, 1), // inner step
        seg(0, 2, 1, 2), // bottom of the leg
        seg(0, 0, 0, 2), // left
        seg(1, 1, 1, 2), // inner side of the leg
        seg(3, 0, 3, 1), // right
      ]),
    )
  })

  it('treats overlapping rectangles as their union', () => {
    expect(roomOutline([{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 1, h: 1 }])).toHaveLength(4)
  })
})

describe('rect helpers', () => {
  it('gridToUnits scales by CELL', () => {
    expect(gridToUnits({ x: 1, y: 2, w: 3, h: 1 })).toEqual({ x: CELL, y: 2 * CELL, w: 3 * CELL, h: CELL })
  })
  it('atLeast grows around the center and never shrinks', () => {
    expect(atLeast({ x: 10, y: 10, w: 20, h: 60 }, 40)).toEqual({ x: 0, y: 10, w: 40, h: 60 })
  })
  it('boundingRect covers all rects', () => {
    expect(boundingRect([{ x: 0, y: 5, w: 2, h: 2 }, { x: 4, y: 0, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 5, h: 7 })
    expect(boundingRect([])).toBeNull()
  })
})
