import { describe, expect, it } from 'vitest'
import { fitTo, panBy, screenToContent, zoomAt } from './viewport-math'

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
