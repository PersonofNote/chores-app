import { describe, expect, it } from 'vitest'
import { fitTo, keepInView, panBy, screenToContent, zoomAt } from './viewport-math'

const limits = { min: 0.1, max: 10 }

describe('fitTo', () => {
  it('scales to the limiting side and centers', () => {
    const s = fitTo({ x: 0, y: 0, w: 200, h: 100 }, { w: 420, h: 420 }, 10, limits)
    expect(s.scale).toBe(2)
    expect(s.tx).toBe(10)
    expect(s.ty).toBe(110) // (420 - 200) / 2
  })
  it('respects scale limits', () => {
    expect(fitTo({ x: 0, y: 0, w: 1, h: 1 }, { w: 1000, h: 1000 }, 0, limits).scale).toBe(10)
  })
})

describe('zoomAt', () => {
  it('keeps the content under the anchor point fixed', () => {
    const s = { scale: 1.5, tx: 20, ty: -40 }
    const at = { x: 300, y: 200 }
    const before = screenToContent(s, at)
    const after = screenToContent(zoomAt(s, 2.2, at, limits), at)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('clamps', () => {
    expect(zoomAt({ scale: 8, tx: 0, ty: 0 }, 4, { x: 0, y: 0 }, limits).scale).toBe(10)
  })
})

it('panBy translates', () => {
  expect(panBy({ scale: 2, tx: 1, ty: 1 }, 5, -3)).toEqual({ scale: 2, tx: 6, ty: -2 })
})

describe('keepInView', () => {
  // A 200 × 100 house at the origin, on a 400 × 300 screen, keeping 50 px visible.
  const house = { x: 0, y: 0, w: 200, h: 100 }
  const screen = { w: 400, h: 300 }
  const keep = (tx: number, ty: number, scale = 1) => keepInView({ scale, tx, ty }, house, screen, 50)

  it('leaves a view that already shows enough alone', () => {
    expect(keep(100, 100)).toEqual({ scale: 1, tx: 100, ty: 100 })
    expect(keep(-150, -50)).toEqual({ scale: 1, tx: -150, ty: -50 }) // exactly 50 px left
  })

  it('stops the house leaving past any edge, with 50 px still showing', () => {
    expect(keep(-1000, 0).tx).toBe(-150) // dragged left: right edge at x = 50
    expect(keep(1000, 0).tx).toBe(350) // dragged right: left edge at x = 350
    expect(keep(0, -1000).ty).toBe(-50) // up: bottom edge at y = 50
    expect(keep(0, 1000).ty).toBe(250) // down: top edge at y = 250
  })

  it('accounts for zoom and where the house starts', () => {
    const s = keepInView({ scale: 2, tx: -5000, ty: 0 }, { x: 10, y: 0, w: 200, h: 100 }, screen, 50)
    // Right edge on screen = (10 + 200) * 2 + tx = 50
    expect(s.tx).toBe(50 - 420)
    expect(s.scale).toBe(2)
  })

  it('keeps all of a house that is smaller than the margin', () => {
    const s = keepInView({ scale: 0.1, tx: -1000, ty: 1000 }, house, screen, 50) // 20 × 10 px on screen
    expect(s.tx).toBe(0) // fully in, at the left edge
    expect(s.ty).toBe(290) // fully in, at the bottom
  })
})
