// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SkinRegistry } from '../skins'
import { artSkin, buildArtLooks, bundledArtLooks, pickVariant, registerArtSkins } from './index'

const BED = '<svg viewBox="0 0 96 96" data-label="Quilted"><rect class="x" width="96" height="96" fill="#cba"/></svg>'
const PLANT = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="green"/></svg>'
const WILTED = '<svg viewBox="0 0 48 48"><circle cx="24" cy="30" r="14" fill="olive"/></svg>'
const DEAD = '<svg viewBox="0 0 48 48"><circle cx="24" cy="36" r="8" fill="brown"/></svg>'
const COUNTER = '<svg viewBox="0 0 96 48" data-fit="segments" data-caps="24 24"><rect width="96" height="48" fill="#888"/></svg>'

const looks = () =>
  buildArtLooks(
    {
      './bed/quilt.svg': BED,
      './plant/fern.svg': PLANT,
      './plant/fern@overdue.svg': WILTED,
      './plant/fern@neglected.svg': DEAD,
      './plant/orphan@overdue.svg': WILTED,
      './plant/typo@soon.svg': WILTED,
      './counter/block.svg': COUNTER,
    },
    { './rug/wool.png': '/assets/wool.png' },
    { './rug/wool.json': { width: 96, height: 48, label: 'Wool rug' } },
  )

const ctx = (w: number, h: number, stage: 'unknown' | 'fine' | 'due-soon' | 'overdue' | 'neglected' = 'unknown') => ({
  item: { id: 'i', roomId: 'r', type: 'x', skin: 'x', cell: { x: 0, y: 0 }, size: { w: 1, h: 1 }, rotation: 0 as const },
  width: w,
  height: h,
  label: 'X',
  stage,
})

describe('buildArtLooks', () => {
  it('registers one look per file, with stage variants grouped under it', () => {
    expect(looks().map((l) => [l.key, l.variants.length, l.label])).toEqual([
      ['bed.quilt', 1, 'Quilted'],
      ['counter.block', 1, undefined],
      ['plant.fern', 3, undefined],
      ['rug.wool', 1, 'Wool rug'],
    ])
  })

  it('ignores variants without a base drawing and unknown stage names', () => {
    expect(looks().some((l) => l.key === 'plant.orphan' || l.key === 'plant.typo')).toBe(false)
  })

  it('takes raster size and fit from the sidecar', () => {
    const rug = looks().find((l) => l.key === 'rug.wool')!
    expect(rug.variants[0]!.viewBox).toEqual({ x: 0, y: 0, w: 96, h: 48 })
    const img = artSkin(rug)(ctx(96, 48)).querySelector('image')!
    expect(img.getAttribute('href')).toBe('/assets/wool.png')
  })

  it('bundled art (if any) all parses', () => {
    expect(() => bundledArtLooks()).not.toThrow()
  })
})

describe('pickVariant', () => {
  const fern = () => looks().find((l) => l.key === 'plant.fern')!.variants

  it('shows the latest variant the stage has reached, else the base', () => {
    expect(pickVariant(fern(), 'unknown').stage).toBeNull()
    expect(pickVariant(fern(), 'due-soon').stage).toBeNull()
    expect(pickVariant(fern(), 'overdue').stage).toBe('overdue')
    expect(pickVariant(fern(), 'neglected').stage).toBe('neglected')
  })
})

describe('artSkin', () => {
  it('keeps fills and draws one slice for contain', () => {
    const bed = looks().find((l) => l.key === 'bed.quilt')!
    const g = artSkin(bed)(ctx(96, 96))
    expect(g.querySelectorAll(':scope > svg')).toHaveLength(1)
    expect(g.querySelector('rect')!.getAttribute('fill')).toBe('#cba')
    expect(g.querySelector('rect')!.hasAttribute('class')).toBe(false)
  })

  it('draws caps and repeated middles for segments', () => {
    const counter = looks().find((l) => l.key === 'counter.block')!
    // 192 × 48 minus the inset is 180 × 36: caps scale to 18, leaving 144 for four 36-wide middles.
    expect(artSkin(counter)(ctx(96 * 2, 48)).querySelectorAll(':scope > svg').length).toBe(6)
  })

  it('draws the variant for the stage', () => {
    const fern = looks().find((l) => l.key === 'plant.fern')!
    expect(artSkin(fern)(ctx(48, 48, 'overdue')).querySelector('circle')!.getAttribute('fill')).toBe('olive')
  })
})

describe('registerArtSkins', () => {
  it('registers art as outlined skins, stage-aware when it has variants', () => {
    const skins = registerArtSkins(new SkinRegistry(), looks())
    expect(skins.skinFor({ skin: 'bed.quilt', type: 'bed' })).toMatchObject({ outline: true, stageAware: false, label: 'Quilted' })
    expect(skins.skinFor({ skin: 'plant.fern', type: 'plant' })).toMatchObject({ outline: true, stageAware: true, label: 'Fern' })
  })
})
