/**
 * Grid geometry, pure. The map is drawn in SVG user units where one grid cell is
 * CELL units square; the viewport transform handles zoom, so nothing here knows
 * about screen pixels.
 */
import type { GridRect, Home } from '../domain'

/** Item footprints are a layout rule; re-exported for render code. */
export { footprint } from '../domain'

export const CELL = 48

/** A rectangle in user units. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

/** A wall segment in user units. */
export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export function gridToUnits(r: GridRect): Rect {
  return { x: r.x * CELL, y: r.y * CELL, w: r.w * CELL, h: r.h * CELL }
}

export function homeBounds(home: Pick<Home, 'gridSize'>): Rect {
  return { x: 0, y: 0, w: home.gridSize.w * CELL, h: home.gridSize.h * CELL }
}

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** `r` grown around its center to at least `min` on each side. */
export function atLeast(r: Rect, min: number): Rect {
  const w = Math.max(r.w, min)
  const h = Math.max(r.h, min)
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h }
}

export function boundingRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, w: x2 - x, h: y2 - y }
}

/**
 * The outline of a room made of one or more (possibly overlapping or touching)
 * rectangles, as merged wall segments in user units. Inner edges where two of the
 * room's rectangles meet are not walls, so an L-shape gets a single outline.
 */
export function roomOutline(rects: readonly GridRect[]): Segment[] {
  const cells = new Set<string>()
  for (const r of rects)
    for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) cells.add(`${x},${y}`)
  const has = (x: number, y: number) => cells.has(`${x},${y}`)

  // Unit boundary edges, grouped by the grid line they lie on.
  const horizontal = new Map<number, number[]>() // y line → x starts
  const vertical = new Map<number, number[]>() // x line → y starts
  const add = (map: Map<number, number[]>, line: number, start: number) => {
    const list = map.get(line) ?? []
    list.push(start)
    map.set(line, list)
  }
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number) as [number, number]
    if (!has(x, y - 1)) add(horizontal, y, x)
    if (!has(x, y + 1)) add(horizontal, y + 1, x)
    if (!has(x - 1, y)) add(vertical, x, y)
    if (!has(x + 1, y)) add(vertical, x + 1, y)
  }

  const segments: Segment[] = []
  const merge = (map: Map<number, number[]>, toSegment: (line: number, from: number, to: number) => Segment) => {
    for (const [line, starts] of [...map].sort((a, b) => a[0] - b[0])) {
      starts.sort((a, b) => a - b)
      let from = starts[0]!
      let to = from + 1
      for (const s of starts.slice(1)) {
        if (s === to) {
          to++
        } else {
          segments.push(toSegment(line, from, to))
          from = s
          to = s + 1
        }
      }
      segments.push(toSegment(line, from, to))
    }
  }
  merge(horizontal, (y, x1, x2) => ({ x1: x1 * CELL, y1: y * CELL, x2: x2 * CELL, y2: y * CELL }))
  merge(vertical, (x, y1, y2) => ({ x1: x * CELL, y1: y1 * CELL, x2: x * CELL, y2: y2 * CELL }))
  return segments
}
