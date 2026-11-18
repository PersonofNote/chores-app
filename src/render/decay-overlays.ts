/**
 * Decay overlays: dust, grime and cobwebs drawn over an item (the map's `decay` layer).
 * Generic on purpose: they work over any skin, icon or art, so art never has to be
 * recolored to show decay.
 *
 *   Due soon   dust specks
 *   Overdue    more dust, grime smudges, a cobweb in one corner
 *   Neglected  dense dust, more grime, a second cobweb
 *
 * Shapes are cumulative and seeded by the item's id: an item's Overdue overlay is its
 * Due-soon overlay plus more, and the same dust lands in the same place every time.
 * The map draws every level once and CSS reveals levels by stage, so changes fade
 * in both directions on stable nodes.
 *
 * Sizes are chosen to read at phone zoom (about 25 CSS px per 48-unit cell).
 */
import type { Stage } from '../domain'
import { svg } from './svg'

export type OverlayLevel = 1 | 2 | 3

export interface OverlayShape {
  kind: 'dust' | 'grime' | 'cobweb'
  tag: 'circle' | 'ellipse' | 'path'
  attrs: Record<string, string | number>
  /** The first level this shape shows at. */
  level: OverlayLevel
}

/** Overlay level per stage; 0 shows nothing. */
export function overlayLevel(stage: Stage | 'unknown'): 0 | OverlayLevel {
  switch (stage) {
    case 'due-soon':
      return 1
    case 'overdue':
      return 2
    case 'neglected':
      return 3
    default:
      return 0
  }
}

const CELL_AREA = 48 * 48
/** Keep shapes inside the footprint outline. */
const INSET = 7
/** Specks per cell added at each level. */
const DUST_PER_CELL = [2, 2, 3] as const
const MAX_DUST = 30
const DUST_R = [2, 3.2] as const
const GRIME_RX = [7, 13] as const
const GRIME_RY = [3.5, 6.5] as const
const COBWEB_MAX = 26

/**
 * The overlay shapes for an item at a stage, in its unrotated frame (centered on the
 * origin, width × height user units). Pure and deterministic for a given seed.
 */
export function overlayFor(stage: Stage | 'unknown', size: { width: number; height: number }, seed: string): OverlayShape[] {
  const level = overlayLevel(stage)
  return level === 0 ? [] : allOverlayShapes(size, seed).filter((s) => s.level <= level)
}

/** Every shape for every level, generated in a fixed order so lower levels never change. */
export function allOverlayShapes({ width, height }: { width: number; height: number }, seed: string): OverlayShape[] {
  const rand = seededRandom(seed)
  const between = ([lo, hi]: readonly [number, number]) => lo + rand() * (hi - lo)
  const hw = Math.max(1, width / 2 - INSET)
  const hh = Math.max(1, height / 2 - INSET)
  const cells = Math.max(1, (width * height) / CELL_AREA)
  const r1 = (n: number) => Math.round(n * 10) / 10
  const shapes: OverlayShape[] = []

  // Dust, level by level.
  let dust = 0
  DUST_PER_CELL.forEach((perCell, i) => {
    const count = Math.min(Math.round(perCell * cells), MAX_DUST - dust)
    for (let n = 0; n < count; n++, dust++) {
      shapes.push({
        kind: 'dust',
        tag: 'circle',
        level: (i + 1) as OverlayLevel,
        attrs: { cx: r1((rand() * 2 - 1) * hw), cy: r1((rand() * 2 - 1) * hh), r: r1(between(DUST_R)) },
      })
    }
  })

  // Grime: one smudge per two cells at Overdue, one more per cell at Neglected.
  const grime = (count: number, level: OverlayLevel) => {
    for (let n = 0; n < count; n++) {
      const rx = Math.min(between(GRIME_RX), hw)
      const ry = Math.min(between(GRIME_RY), hh)
      const cx = r1((rand() * 2 - 1) * (hw - rx / 2))
      const cy = r1((rand() * 2 - 1) * (hh - ry / 2))
      shapes.push({
        kind: 'grime',
        tag: 'ellipse',
        level,
        attrs: { cx, cy, rx: r1(rx), ry: r1(ry), transform: `rotate(${Math.round(rand() * 180)} ${cx} ${cy})` },
      })
    }
  }
  grime(Math.max(1, Math.round(cells / 2)), 2)
  grime(Math.max(1, Math.round(cells)), 3)

  // Cobwebs: a seeded corner at Overdue, the opposite one at Neglected.
  const corner = Math.floor(rand() * 4)
  const radius = Math.min(COBWEB_MAX, Math.min(width, height) * 0.45)
  shapes.push({ kind: 'cobweb', tag: 'path', level: 2, attrs: { d: cobwebPath(corner, width, height, radius) } })
  shapes.push({ kind: 'cobweb', tag: 'path', level: 3, attrs: { d: cobwebPath((corner + 2) % 4, width, height, radius) } })
  return shapes
}

/**
 * A quarter web tucked into a corner (0 top-left, clockwise): four spokes and two
 * sagging threads between them.
 */
function cobwebPath(corner: number, width: number, height: number, radius: number): string {
  const sx = corner === 1 || corner === 2 ? -1 : 1
  const sy = corner >= 2 ? -1 : 1
  const ox = -sx * (width / 2 - INSET + 2)
  const oy = -sy * (height / 2 - INSET + 2)
  const r1 = (n: number) => Math.round(n * 10) / 10
  const at = (r: number, a: number) => `${r1(ox + sx * r * Math.cos(a))} ${r1(oy + sy * r * Math.sin(a))}`
  const angles = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]
  const parts = angles.map((a) => `M${r1(ox)} ${r1(oy)}L${at(radius, a)}`)
  for (const k of [0.45, 0.85]) {
    const r = radius * k
    parts.push(`M${at(r, angles[0]!)}`)
    for (let i = 1; i < angles.length; i++) {
      const mid = (angles[i - 1]! + angles[i]!) / 2
      parts.push(`Q${at(r * 0.82, mid)} ${at(r, angles[i]!)}`)
    }
  }
  return parts.join('')
}

/** Builds the overlay group's children; CSS decides which levels show. */
export function drawOverlayShapes(shapes: readonly OverlayShape[]): SVGElement[] {
  return shapes.map((s) => svg(s.tag, { ...s.attrs, class: `decay-${s.kind}`, 'data-level': s.level }))
}

/** FNV-1a hash into mulberry32: a small, stable PRNG seeded by a string. */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
