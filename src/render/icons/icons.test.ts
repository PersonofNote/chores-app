// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defaultLibrary, FLOOR_TYPE } from '../../domain'
import { createDefaultSkins } from '../default-skins'
import { placeholderSkin } from '../skins'
import { ICON_FOR_TYPE, ICONS, iconSkin } from './index'

describe('vendored icons', () => {
  it('every icon file parses to at least one shape', () => {
    expect(ICONS.size).toBeGreaterThan(0)
    for (const [name, shapes] of ICONS) expect(shapes.length, name).toBeGreaterThan(0)
  })

  it('every drawable library type has an icon that exists', () => {
    for (const type of Object.keys(defaultLibrary.items)) {
      if (type === FLOOR_TYPE) continue
      const name = ICON_FOR_TYPE[type]
      expect(name, `no icon mapped for '${type}'`).toBeDefined()
      expect(ICONS.has(name!), `icon file '${name}' missing for '${type}'`).toBe(true)
    }
  })

  it('every vendored icon is used (no dead files)', () => {
    const used = new Set(Object.values(ICON_FOR_TYPE))
    for (const name of ICONS.keys()) expect(used.has(name), `'${name}' is vendored but unused`).toBe(true)
  })
})

describe('iconSkin', () => {
  const ctx = (w: number, h: number) => ({
    item: { id: 'i', roomId: 'r', type: 'bed', skin: 'bed.icon', cell: { x: 0, y: 0 }, size: { w: 1, h: 1 }, rotation: 0 as const },
    width: w,
    height: h,
    label: 'Bed',
  })

  it('fits the icon to the shorter side and compensates stroke width for the scale', () => {
    const g = iconSkin(ICONS.get('sofa')!)(ctx(96, 48))
    const icon = g.querySelector('.icon')!
    const scale = (48 * 0.72) / 24
    expect(icon.getAttribute('transform')).toBe(`translate(${-48 * 0.36} ${-48 * 0.36}) scale(${scale})`)
    expect(icon.getAttribute('style')).toBe(`stroke-width: calc(var(--item-stroke) / ${scale})`)
  })

  it('outlines the full footprint', () => {
    const rect = iconSkin(ICONS.get('sofa')!)(ctx(96, 48)).querySelector('.footprint')!
    expect(rect.getAttribute('width')).toBe('88')
    expect(rect.getAttribute('height')).toBe('40')
  })
})

describe('createDefaultSkins', () => {
  it('resolves known types to icons and unknown types to the placeholder', () => {
    const skins = createDefaultSkins()
    expect(skins.resolve({ skin: 'bed.icon', type: 'bed' })).not.toBe(placeholderSkin)
    expect(skins.resolve({ skin: 'lamp.icon', type: 'lamp' })).toBe(placeholderSkin)
  })
})
