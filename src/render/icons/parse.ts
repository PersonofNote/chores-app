/**
 * Turns a vendored icon SVG into plain shape data, keeping only geometry.
 *
 * An allowlist, not a sanitizer: only basic shapes and their geometric attributes
 * survive. Root attributes (stroke, width, class) are dropped so the map's own
 * styling applies, and anything executable (scripts, handlers, links) can't get in
 * even if a future icon file contained it.
 *
 * Expects the simple, self-closing markup icon sets ship (one element per tag).
 * Pure string processing, so it works without a DOM.
 */

export interface IconShape {
  tag: ShapeTag
  attrs: Record<string, string>
}

const SHAPE_ATTRS = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
} as const satisfies Record<string, readonly string[]>

export type ShapeTag = keyof typeof SHAPE_ATTRS

const ELEMENT = /<([a-z]+)\b([^>]*?)\/?>/gi
const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g

export function parseIcon(svgText: string): IconShape[] {
  const shapes: IconShape[] = []
  for (const [, rawTag, rawAttrs] of svgText.matchAll(ELEMENT)) {
    const tag = rawTag!.toLowerCase()
    if (!(tag in SHAPE_ATTRS)) continue
    const allowed: readonly string[] = SHAPE_ATTRS[tag as ShapeTag]
    const attrs: Record<string, string> = {}
    for (const [, name, value] of rawAttrs!.matchAll(ATTRIBUTE)) {
      if (allowed.includes(name!)) attrs[name!] = value!
    }
    shapes.push({ tag: tag as ShapeTag, attrs })
  }
  return shapes
}
