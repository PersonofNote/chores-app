import { describe, expect, it } from 'vitest'
import { ART_INSET } from '../skins'
import { artBox, containSlices, layoutArt, segmentSlices } from './fit'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

describe('containSlices', () => {
  it('keeps the aspect ratio, as large as fits, centered', () => {
    const [s] = containSlices(box(0, 0, 48, 48), box(-60, -40, 120, 80))
    expect(s).toEqual({ x: -40, y: -40, width: 80, height: 80, viewBox: box(0, 0, 48, 48) })
  })

  it('fits a wide drawing by its width', () => {
    const [s] = containSlices(box(0, 0, 96, 48), box(0, 0, 48, 48))
    expect(s).toMatchObject({ x: 0, y: 12, width: 48, height: 24 })
  })
})

describe('segmentSlices', () => {
  // A 96 × 48 counter drawing with 24-unit caps and a 48-unit middle.
  const art = box(0, 0, 96, 48)

  it('draws the drawing as is when the box matches it', () => {
    const slices = segmentSlices(art, [24, 24], box(0, 0, 96, 48))
    expect(slices.map((s) => [s.x, s.width, s.viewBox.x, s.viewBox.w])).toEqual([
      [0, 24, 0, 24],
      [24, 48, 24, 48],
      [72, 24, 72, 24],
    ])
  })

  it('repeats the middle to fill a longer box, keeping the caps', () => {
    const slices = segmentSlices(art, [24, 24], box(0, 0, 192, 48))
    expect(slices).toHaveLength(5)
    expect(slices.slice(1, 4).every((s) => s.width === 48 && s.viewBox.x === 24)).toBe(true)
    expect(slices.at(-1)).toMatchObject({ x: 168, width: 24 })
  })

  it('stretches tiles slightly rather than leaving a gap', () => {
    const slices = segmentSlices(art, [24, 24], box(0, 0, 150, 48))
    const middle = slices.slice(1, -1)
    expect(middle).toHaveLength(2)
    expect(middle[0]!.width).toBeCloseTo(51)
    expect(slices.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(150)
  })

  it('scales caps with the box height', () => {
    const slices = segmentSlices(art, [24, 24], box(0, 0, 192, 96))
    expect(slices[0]!.width).toBe(48)
    expect(slices[0]!.height).toBe(96)
  })

  it('falls back to contain when the caps do not fit', () => {
    expect(segmentSlices(art, [24, 24], box(0, 0, 40, 48))).toHaveLength(1)
    expect(segmentSlices(art, [60, 60], box(0, 0, 400, 48))).toHaveLength(1)
  })
})

describe('layoutArt', () => {
  it('lays art inside the footprint, clear of the outline', () => {
    expect(artBox(96, 48)).toEqual(box(-48 + ART_INSET, -24 + ART_INSET, 96 - 2 * ART_INSET, 48 - 2 * ART_INSET))
    const [s] = layoutArt(box(0, 0, 48, 48), { kind: 'contain' }, 48, 48)
    expect(s).toMatchObject({ x: -24 + ART_INSET, width: 48 - 2 * ART_INSET })
  })
})
