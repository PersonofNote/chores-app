import { describe, expect, it } from 'vitest'
import { placeholderSkin, SkinRegistry } from './skins'

const draw = () => ({}) as SVGElement

describe('SkinRegistry', () => {
  const skins = () =>
    new SkinRegistry()
      .register('cabinet.icon', draw)
      .register('cabinet.armoire', draw, { outline: true })
      .register('cabinet.pantry-shelves', draw, { label: 'Pantry' })
      .register('bed.icon', draw)

  it('lists a type’s looks: art first in registration order, then the icon', () => {
    expect(skins().skinsFor('cabinet').map((s) => [s.key, s.label])).toEqual([
      ['cabinet.armoire', 'Armoire'],
      ['cabinet.pantry-shelves', 'Pantry'],
      ['cabinet.icon', 'Simple icon'],
    ])
    expect(skins().skinsFor('bed').map((s) => s.key)).toEqual(['bed.icon'])
    expect(skins().skinsFor('lamp')).toEqual([])
  })

  it('starts new items on the first art look, else the icon', () => {
    expect(skins().defaultSkin('cabinet')).toBe('cabinet.armoire')
    expect(skins().defaultSkin('bed')).toBe('bed.icon')
    expect(skins().defaultSkin('lamp')).toBe('lamp.icon')
  })

  it('falls back from a missing look to the icon, then the placeholder', () => {
    expect(skins().skinFor({ skin: 'cabinet.gone', type: 'cabinet' }).key).toBe('cabinet.icon')
    expect(skins().resolve({ skin: 'lamp.icon', type: 'lamp' })).toBe(placeholderSkin)
  })
})
