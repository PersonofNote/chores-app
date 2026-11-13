import { describe, expect, it } from 'vitest'
import { ringLayout } from './ring-layout'

const area = { w: 400, h: 400 }

describe('ringLayout', () => {
  it('starts at the top and goes clockwise, evenly spaced', () => {
    const { positions } = ringLayout(4, { x: 200, y: 200 }, 50, area, 10)
    const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) })
    expect(positions.map(round)).toEqual([
      { x: 200, y: 150 },
      { x: 250, y: 200 },
      { x: 200, y: 250 },
      { x: 150, y: 200 },
    ])
  })

  it('nudges the ring back on screen near an edge', () => {
    const { center } = ringLayout(3, { x: 5, y: 395 }, 50, area, 10)
    expect(center).toEqual({ x: 60, y: 340 })
  })

  it('centers on a screen too small for the ring', () => {
    expect(ringLayout(3, { x: 0, y: 0 }, 300, area, 10).center).toEqual({ x: 200, y: 200 })
  })
})
