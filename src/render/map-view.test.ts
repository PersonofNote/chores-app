// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { computeHouseStatus, fixedClock, sequentialIds } from '../domain'
import { buildDemoHouse } from '../dev/demo-house'
import { LIGHT_PALETTE, STROKE } from './decay-style'
import { CELL } from './geometry'
import { LAYERS, MapView } from './map-view'
import { SkinRegistry } from './skins'
import { svg } from './svg'

function demo() {
  const clock = fixedClock('2026-06-01T08:00:00.000Z')
  const data = buildDemoHouse(clock, sequentialIds('d'))
  const house = { home: data.homes![0]!, rooms: data.rooms!, items: data.items!, tasks: data.tasks!, events: data.events! }
  return { house, clock }
}

function mounted() {
  const { house, clock } = demo()
  const map = new MapView(new SkinRegistry())
  map.setHouse(house)
  map.setStatus(computeHouseStatus(house, { now: clock.now() }), { palette: LIGHT_PALETTE })
  return { map, house }
}

describe('MapView', () => {
  it('stacks layers bottom to top in order', () => {
    const { map } = mounted()
    expect([...map.content.children].map((c) => c.getAttribute('class'))).toEqual(LAYERS.map((l) => `layer layer-${l}`))
  })

  it('draws every non-floor item once, and floors as tints instead', () => {
    const { map, house } = mounted()
    const drawn = house.items.filter((i) => i.type !== 'floor')
    expect(map.layers.items.querySelectorAll('.item')).toHaveLength(drawn.length)
    expect(map.layers.floor.querySelectorAll('.floor-tint')).toHaveLength(house.rooms.length)
  })

  it('applies decay as color, stroke weight and a stage attribute', () => {
    const { map } = mounted()
    const stages = new Set([...map.layers.items.querySelectorAll<SVGGElement>('.item')].map((g) => g.dataset.stage))
    expect(stages).toEqual(new Set(['fresh', 'fine', 'due-soon', 'overdue', 'neglected']))

    const overdue = map.layers.items.querySelector<SVGGElement>('[data-stage="overdue"]')!
    expect(overdue.style.getPropertyValue('--item-stroke')).toBe(String(STROKE.heavy))
    expect(overdue.style.getPropertyValue('--decay-color')).toMatch(/^oklch\(/)
  })

  it('restyles in place, keeping the same nodes (for restore animations)', () => {
    const { house, clock } = demo()
    const map = new MapView(new SkinRegistry())
    map.setHouse(house)
    const id = house.items.find((i) => i.type === 'bed')!.id
    const node = map.itemGroup(id)
    map.setStatus(computeHouseStatus(house, { now: clock.now() }), { palette: LIGHT_PALETTE })
    clock.advanceDays(400)
    map.setStatus(computeHouseStatus(house, { now: clock.now() }), { palette: LIGHT_PALETTE })
    expect(map.itemGroup(id)).toBe(node)
    expect(node?.dataset.stage).toBe('neglected')
  })

  it('positions and rotates items about their footprint center', () => {
    const { map, house } = mounted()
    const sofa = house.items.find((i) => i.type === 'sofa' && i.rotation === 90)!
    // 2×1 sofa turned 90° at (5, 8) occupies 1×2 cells: center (5.5, 9) cells.
    expect(map.itemGroup(sofa.id)?.getAttribute('transform')).toBe(
      `translate(${5.5 * CELL} ${9 * CELL}) rotate(90)`,
    )
  })

  it('grows hit targets to the minimum size around small items', () => {
    const { map } = mounted()
    map.setMinHitSize(CELL * 2)
    const hit = map.layers.ui.querySelector('.hit')!
    expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(CELL * 2)
    expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(CELL * 2)
  })

  it('uses a registered skin over the placeholder', () => {
    const skins = new SkinRegistry().register('bed.icon', () => svg('circle', { class: 'custom-bed' }))
    const { house } = demo()
    const map = new MapView(skins)
    map.setHouse(house)
    expect(map.layers.items.querySelectorAll('.custom-bed')).toHaveLength(1)
    expect(map.layers.items.querySelectorAll('.skin-placeholder').length).toBeGreaterThan(0)
  })

  it('labels rooms', () => {
    const { map, house } = mounted()
    expect([...map.layers.ui.querySelectorAll('.room-label')].map((t) => t.textContent)).toEqual(
      house.rooms.map((r) => r.name),
    )
  })
})
