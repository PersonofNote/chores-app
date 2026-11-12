import { describe, expect, it } from 'vitest'
import type { DecayStatus, Stage } from '../domain'
import {
  decayAmount,
  decayColor,
  floorTint,
  itemDecayStyle,
  LIGHT_PALETTE as P,
  mixOklch,
  oklchCss,
  STROKE,
} from './decay-style'

const status = (pressure: number, stage: Stage): DecayStatus => ({
  taskId: 't', lastReset: new Date(0), elapsedDays: 0, pressure, stage,
})

describe('decayColor', () => {
  it('stays neutral through Fine', () => {
    expect(decayColor(0, P)).toEqual(P.neutral)
    expect(decayColor(0.8, P)).toEqual(P.neutral)
  })
  it('is amber at Overdue and red, capped, from Neglected', () => {
    expect(decayColor(1.0, P)).toEqual(P.amber)
    expect(decayColor(1.75, P)).toEqual(P.red)
    expect(decayColor(9, P)).toEqual(P.red)
  })
  it('moves continuously in between', () => {
    const mid = decayColor(0.9, P)
    expect(mid.c).toBeGreaterThan(P.neutral.c)
    expect(mid.c).toBeLessThan(P.amber.c)
    // Neutral is achromatic, so the hue comes from amber rather than sweeping from blue.
    expect(mid.h).toBeCloseTo(P.amber.h)
  })
})

describe('mixOklch', () => {
  it('takes the shortest way around the hue circle', () => {
    expect(mixOklch({ l: 0.5, c: 0.1, h: 350 }, { l: 0.5, c: 0.1, h: 10 }, 0.5).h).toBeCloseTo(0)
  })
})

describe('oklchCss', () => {
  it('formats with optional alpha', () => {
    expect(oklchCss({ l: 0.5, c: 0.1234, h: 70 })).toBe('oklch(0.5 0.123 70)')
    expect(oklchCss({ l: 0.5, c: 0.1, h: 70 }, 0.25)).toBe('oklch(0.5 0.1 70 / 0.25)')
  })
})

describe('itemDecayStyle', () => {
  it('adds a heavier stroke from Overdue on, a cue that is not color', () => {
    expect(itemDecayStyle(status(0.9, 'due-soon'), P).strokeWidth).toBe(STROKE.normal)
    expect(itemDecayStyle(status(1.2, 'overdue'), P).strokeWidth).toBe(STROKE.heavy)
    expect(itemDecayStyle(status(3, 'neglected'), P).strokeWidth).toBe(STROKE.heavy)
  })
  it('renders unknown decay as neutral', () => {
    expect(itemDecayStyle(null, P)).toEqual({ color: oklchCss(P.neutral), strokeWidth: STROKE.normal, stage: 'unknown' })
  })
})

describe('floorTint', () => {
  it('is absent until Due soon and grows with decay', () => {
    expect(floorTint(null, P)).toBeNull()
    expect(floorTint(status(0.5, 'fine'), P)).toBeNull()
    expect(decayAmount(1.75)).toBe(1)
    const alpha = (css: string | null) => Number(/\/ ([\d.]+)\)/.exec(css!)![1])
    expect(alpha(floorTint(status(1.0, 'overdue'), P))).toBeLessThan(alpha(floorTint(status(2, 'neglected'), P)))
  })
})
