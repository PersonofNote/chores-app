/**
 * Tap and long-press on the map, plus resolving what was pressed.
 *
 * Independent of the viewport: both watch the same pointer events, and a press
 * that moves DRAG_THRESHOLD px (a pan) or gains a second finger (a pinch) is
 * cancelled here while the viewport takes it.
 */
import type { Id } from '../domain'
import type { Point } from '../render/geometry'
import { DRAG_THRESHOLD } from './viewport'

export const LONG_PRESS_MS = 500

export type MapTarget =
  | { kind: 'item'; itemId: Id }
  | { kind: 'floor'; roomId: Id }
  | { kind: 'room-label'; roomId: Id }

/** What a pressed map element stands for, from the data attributes MapView sets. */
export function resolveTarget(el: Element | null): MapTarget | null {
  if (!el) return null
  const item = el.closest<SVGElement>('[data-item-id]')
  if (item?.dataset.itemId) return { kind: 'item', itemId: item.dataset.itemId }
  const label = el.closest<SVGElement>('.room-label')
  if (label?.dataset.roomId) return { kind: 'room-label', roomId: label.dataset.roomId }
  const floor = el.closest<SVGElement>('.room-floor, .floor-tint')
  if (floor?.dataset.roomId) return { kind: 'floor', roomId: floor.dataset.roomId }
  return null
}

export type Gesture =
  /** `target` is null for a tap on empty space (which still closes open UI). */
  | { type: 'tap'; target: MapTarget | null; point: Point }
  | { type: 'long-press'; target: MapTarget; point: Point }

interface Press {
  pointerId: number
  start: Point
  target: MapTarget | null
  /** Only presses on something can become long-presses. */
  timer: ReturnType<typeof setTimeout> | null
}

export class GestureRecognizer {
  private press: Press | null = null
  /** Pointers currently down, wherever they're released (see the constructor). */
  private readonly pressed = new Set<number>()
  private lastPointerType = 'mouse'
  private readonly abort = new AbortController()

  constructor(
    surface: Element,
    private readonly onGesture: (g: Gesture) => void,
    private readonly longPressMs = LONG_PRESS_MS,
  ) {
    const opts = { signal: this.abort.signal }
    surface.addEventListener('pointerdown', (e) => this.down(e as PointerEvent), opts)
    surface.addEventListener('pointermove', (e) => this.move(e as PointerEvent), opts)
    // Releases are watched on the window: a long-press opens a modal sheet under the
    // finger, so its pointerup lands on the sheet, not the map. Missing it would leave
    // that finger "down" forever and make every later tap look like a pinch.
    const win = surface.ownerDocument.defaultView ?? window
    win.addEventListener('pointerup', (e) => this.up(e), opts)
    win.addEventListener('pointercancel', (e) => this.end(e), opts)
    // Right-click is long-press on desktop. Touch long-press also raises contextmenu
    // on some platforms; the timer handles that, so only mice get through here.
    surface.addEventListener(
      'contextmenu',
      (e) => {
        e.preventDefault()
        if (this.lastPointerType !== 'mouse') return
        const target = resolveTarget(e.target as Element)
        if (target) this.onGesture({ type: 'long-press', target, point: pointOf(e as MouseEvent) })
      },
      opts,
    )
  }

  destroy(): void {
    this.cancel()
    this.abort.abort()
  }

  private down(e: PointerEvent): void {
    this.pressed.add(e.pointerId)
    this.lastPointerType = e.pointerType || 'mouse'
    if (this.pressed.size > 1 || e.button !== 0) return this.cancel()
    const target = resolveTarget(e.target as Element)
    const start = pointOf(e)
    this.press = {
      pointerId: e.pointerId,
      start,
      target,
      timer: target
        ? setTimeout(() => {
            this.press = null
            this.onGesture({ type: 'long-press', target, point: start })
          }, this.longPressMs)
        : null,
    }
  }

  private move(e: PointerEvent): void {
    const p = this.press
    if (!p || e.pointerId !== p.pointerId) return
    if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) >= DRAG_THRESHOLD) this.cancel()
  }

  private up(e: PointerEvent): void {
    const p = this.press
    this.end(e)
    if (p && e.pointerId === p.pointerId) this.onGesture({ type: 'tap', target: p.target, point: p.start })
  }

  private end(e: PointerEvent): void {
    this.pressed.delete(e.pointerId)
    if (this.press?.pointerId === e.pointerId) this.cancel()
  }

  private cancel(): void {
    if (this.press?.timer) clearTimeout(this.press.timer)
    this.press = null
  }
}

const pointOf = (e: MouseEvent): Point => ({ x: e.clientX, y: e.clientY })
