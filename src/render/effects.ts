/**
 * Completion feedback on the map itself (layer 5, "effects").
 *
 * - Restore: the item pops and sparkles while its decay color eases back (the color
 *   transition itself is CSS, on the registered `--decay-color` property).
 * - Skip: a quiet dip, no sparkle, so skipping never feels like completing.
 *
 * Uses the Web Animations API, so effects restart cleanly on rapid repeat taps.
 * With reduced motion, movement is dropped and only the color change remains.
 */
import type { Id } from '../domain'
import type { Point } from './geometry'
import type { MapView } from './map-view'
import { svg } from './svg'

const SPARKLE_COUNT = 7
const SPARKLE_MS = 700
/** A four-point star, about 8 units across, centered on the origin. */
const SPARKLE_PATH = 'M0 -4 L1 -1 L4 0 L1 1 L0 4 L-1 1 L-4 0 L-1 -1 Z'

export class MapEffects {
  constructor(
    private readonly map: MapView,
    private readonly reducedMotion: () => boolean = prefersReducedMotion,
    private readonly random: () => number = Math.random,
  ) {}

  restore(itemId: Id): void {
    const body = this.map.itemBody(itemId)
    const at = this.map.itemCenter(itemId)
    const bounds = this.map.itemBounds(itemId)
    if (!body || !at || !bounds || this.reducedMotion()) return
    animate(body, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.35 }, { transform: 'scale(0.97)', offset: 0.7 }, { transform: 'scale(1)' }], {
      duration: 450,
      easing: 'ease-out',
    })
    this.sparkle(at, Math.max(bounds.w, bounds.h) / 2)
  }

  /** A floor restore: sparkles around the room instead of on an object. */
  restoreFloor(roomId: Id): void {
    const at = this.map.roomCenter(roomId)
    if (!at || this.reducedMotion()) return
    this.sparkle(at, 48)
  }

  skip(itemId: Id): void {
    const body = this.map.itemBody(itemId)
    if (!body || this.reducedMotion()) return
    animate(body, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(0.94)', offset: 0.4 }, { opacity: 1, transform: 'scale(1)' }], {
      duration: 500,
      easing: 'ease-in-out',
    })
  }

  private sparkle(at: Point, radius: number): void {
    const group = svg('g', { class: 'sparkles', transform: `translate(${at.x} ${at.y})` })
    this.map.layers.effects.append(group)
    const offset = this.random() * Math.PI * 2
    const runs: Promise<unknown>[] = []
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const angle = offset + (i / SPARKLE_COUNT) * Math.PI * 2
      const distance = radius * (0.7 + this.random() * 0.6) + 10
      const scale = 0.8 + this.random() * 0.8
      const star = svg('path', { class: 'sparkle', d: SPARKLE_PATH })
      group.append(star)
      const x = Math.cos(angle) * distance
      const y = Math.sin(angle) * distance
      runs.push(
        animate(star, [
          { transform: `translate(${x * 0.4}px, ${y * 0.4}px) scale(0)`, opacity: 0 },
          { transform: `translate(${x * 0.8}px, ${y * 0.8}px) scale(${scale})`, opacity: 1, offset: 0.4 },
          { transform: `translate(${x}px, ${y}px) scale(0) rotate(90deg)`, opacity: 0 },
        ], { duration: SPARKLE_MS + this.random() * 200, delay: this.random() * 80, easing: 'ease-out' }),
      )
    }
    Promise.all(runs).finally(() => group.remove())
  }
}

/** Runs a WAAPI animation; resolves when done. No-ops where WAAPI is missing (tests). */
function animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<unknown> {
  if (typeof el.animate !== 'function') return Promise.resolve()
  return el.animate(keyframes, options).finished.catch(() => {
    // Cancelled by a newer animation on the same element: fine.
  })
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
