// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { svg } from '../render/svg'
import { GestureRecognizer, LONG_PRESS_MS, resolveTarget, type Gesture } from './gestures'

function mapFixture() {
  const hit = svg('rect', { class: 'hit', 'data-item-id': 'bed' })
  const label = svg('text', { class: 'room-label', 'data-room-id': 'bedroom' })
  const floorRect = svg('rect')
  const floor = svg('g', { class: 'room-floor', 'data-room-id': 'bedroom' }, [floorRect])
  const wall = svg('line')
  const root = svg('svg', {}, [floor, wall, label, hit])
  document.body.append(root)
  return { root, hit, label, floorRect, wall }
}

describe('resolveTarget', () => {
  it('maps elements to items, room labels and floors', () => {
    const f = mapFixture()
    expect(resolveTarget(f.hit)).toEqual({ kind: 'item', itemId: 'bed' })
    expect(resolveTarget(f.label)).toEqual({ kind: 'room-label', roomId: 'bedroom' })
    expect(resolveTarget(f.floorRect)).toEqual({ kind: 'floor', roomId: 'bedroom' })
    expect(resolveTarget(f.wall)).toBeNull()
    expect(resolveTarget(null)).toBeNull()
  })
})

describe('GestureRecognizer', () => {
  let gestures: Gesture[]
  let f: ReturnType<typeof mapFixture>
  let recognizer: GestureRecognizer

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.replaceChildren()
    f = mapFixture()
    gestures = []
    recognizer = new GestureRecognizer(f.root, (g) => gestures.push(g))
  })
  afterEach(() => {
    recognizer.destroy()
    vi.useRealTimers()
  })

  const fire = (el: Element, type: string, init: PointerEventInit = {}) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, pointerType: 'touch', clientX: 10, clientY: 10, ...init }))

  it('a quick press is a tap', () => {
    fire(f.hit, 'pointerdown')
    vi.advanceTimersByTime(100)
    fire(f.hit, 'pointerup')
    expect(gestures).toEqual([{ type: 'tap', target: { kind: 'item', itemId: 'bed' }, point: { x: 10, y: 10 } }])
  })

  it('holding still is a long-press, and releasing after it is not also a tap', () => {
    fire(f.hit, 'pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    fire(f.hit, 'pointerup')
    expect(gestures.map((g) => g.type)).toEqual(['long-press'])
  })

  it('moving past the drag threshold cancels (it is a pan)', () => {
    fire(f.hit, 'pointerdown')
    fire(f.hit, 'pointermove', { clientX: 30 })
    fire(f.hit, 'pointerup', { clientX: 30 })
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(gestures).toEqual([])
  })

  it('small jitter is still a tap', () => {
    fire(f.hit, 'pointerdown')
    fire(f.hit, 'pointermove', { clientX: 12 })
    fire(f.hit, 'pointerup', { clientX: 12 })
    expect(gestures.map((g) => g.type)).toEqual(['tap'])
  })

  it('a second finger cancels (it is a pinch)', () => {
    fire(f.hit, 'pointerdown')
    fire(f.hit, 'pointerdown', { pointerId: 2 })
    fire(f.hit, 'pointerup')
    fire(f.hit, 'pointerup', { pointerId: 2 })
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(gestures).toEqual([])
  })

  it('a tap on nothing in particular has no target, and holding there is not a long-press', () => {
    fire(f.wall, 'pointerdown')
    fire(f.wall, 'pointerup')
    expect(gestures).toEqual([{ type: 'tap', target: null, point: { x: 10, y: 10 } }])
    fire(f.wall, 'pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    fire(f.wall, 'pointerup')
    expect(gestures.map((g) => g.type)).toEqual(['tap', 'tap'])
  })

  it('right-click with a mouse is a long-press', () => {
    fire(f.label, 'pointerdown', { pointerType: 'mouse', button: 2 })
    f.label.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }))
    expect(gestures).toEqual([{ type: 'long-press', target: { kind: 'room-label', roomId: 'bedroom' }, point: { x: 5, y: 6 } }])
  })

  it('touch contextmenu does not double-fire the long-press', () => {
    fire(f.hit, 'pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    f.hit.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(gestures.map((g) => g.type)).toEqual(['long-press'])
  })
})
