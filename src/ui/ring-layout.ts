/** Where chore buttons go around an item, pure. Screen coordinates (CSS px). */
import type { Point } from '../render/geometry'
import type { Size } from './viewport-math'

export interface RingLayout {
  /** The ring's center: the anchor, nudged so the ring stays on screen. */
  center: Point
  positions: Point[]
}

/**
 * `n` positions evenly around a circle, the first at the top, going clockwise.
 * `margin` is the space to keep between the ring and the screen edges.
 */
export function ringLayout(n: number, anchor: Point, radius: number, area: Size, margin: number): RingLayout {
  const reach = radius + margin
  const clampAxis = (v: number, size: number) => (size < 2 * reach ? size / 2 : Math.min(size - reach, Math.max(reach, v)))
  const center = { x: clampAxis(anchor.x, area.w), y: clampAxis(anchor.y, area.h) }
  const positions = Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })
  return { center, positions }
}
