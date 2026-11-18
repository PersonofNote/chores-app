import { describe, expect, it } from 'vitest'
import { STAGES } from '../domain'
import { allOverlayShapes, overlayFor, overlayLevel, seededRandom } from './decay-overlays'

const ONE = { width: 48, height: 48 }
const BED = { width: 96, height: 96 }

describe('overlayFor', () => {
  it('shows nothing until Due soon', () => {
    expect(overlayFor('unknown', ONE, 'a')).toEqual([])
    expect(overlayFor('fresh', ONE, 'a')).toEqual([])
    expect(overlayFor('fine', ONE, 'a')).toEqual([])
  })

  it('adds dust, then grime and a cobweb, then a second cobweb', () => {
    const kinds = (stage: Parameters<typeof overlayFor>[0]) => {
      const counts = { dust: 0, grime: 0, cobweb: 0 }
      for (const s of overlayFor(stage, ONE, 'a')) counts[s.kind]++
      return counts
    }
    expect(kinds('due-soon')).toEqual({ dust: 2, grime: 0, cobweb: 0 })
    expect(kinds('overdue')).toMatchObject({ dust: 4, cobweb: 1 })
    expect(kinds('overdue').grime).toBeGreaterThan(0)
    expect(kinds('neglected')).toMatchObject({ dust: 7, cobweb: 2 })
  })

  it('is cumulative: each stage keeps the shapes of the one before', () => {
    const due = overlayFor('due-soon', BED, 'x')
    const over = overlayFor('overdue', BED, 'x')
    const neg = overlayFor('neglected', BED, 'x')
    expect(over.slice(0, due.length)).toEqual(due)
    expect(neg).toEqual(expect.arrayContaining(over))
  })

  it('is stable for the same seed and differs between seeds', () => {
    expect(overlayFor('neglected', BED, 'item-1')).toEqual(overlayFor('neglected', BED, 'item-1'))
    expect(overlayFor('neglected', BED, 'item-1')).not.toEqual(overlayFor('neglected', BED, 'item-2'))
  })

  it('scales dust with the footprint, up to a cap', () => {
    const dust = (size: { width: number; height: number }) => allOverlayShapes(size, 's').filter((s) => s.kind === 'dust').length
    expect(dust(BED)).toBe(4 * dust(ONE))
    expect(dust({ width: 480, height: 480 })).toBe(30)
  })

  it('keeps dust inside the footprint', () => {
    for (const s of allOverlayShapes({ width: 96, height: 48 }, 'in')) {
      if (s.kind !== 'dust') continue
      expect(Math.abs(Number(s.attrs.cx))).toBeLessThanOrEqual(48)
      expect(Math.abs(Number(s.attrs.cy))).toBeLessThanOrEqual(24)
    }
  })

  it('maps every stage to a level', () => {
    expect(STAGES.map(overlayLevel)).toEqual([0, 0, 1, 2, 3])
  })
})

describe('seededRandom', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom('abc')
    const b = seededRandom('abc')
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})
