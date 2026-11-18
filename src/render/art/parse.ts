/**
 * Turns a hand-drawn art SVG into a tree of plain shape data, keeping fills.
 *
 * Like the icon parser (`icons/parse.ts`) this is an allowlist, not a sanitizer: only
 * shapes, groups, gradients and clip paths survive, with geometric and presentation
 * attributes. Editor cruft (Inkscape's namedview, metadata), text, scripts, styles,
 * images and external links are dropped. `style="..."` is split into attributes, keeping
 * only allowed properties. `url()` and `href` may only point inside the file.
 *
 * Ids are prefixed per look, so two drawings that both say `linearGradient1` don't
 * collide on the map.
 *
 * Skipped on purpose, so a drawing template's helpers never reach the map:
 * - any group whose id or `inkscape:label` starts with "guides";
 * - anything hidden with `display: none`.
 *
 * Settings live on the root `<svg>`:
 * - `viewBox` (or `width` / `height`): the drawing's box;
 * - `data-fit="contain"` (default) or `data-fit="segments"`;
 * - `data-caps="12 12"`: left and right cap widths for `segments`, in viewBox units;
 * - `data-label="Quilted bed"`: the name in the Look picker.
 *
 * Pure string processing, so it works without a DOM.
 */
import type { ArtFit, Box } from './fit'

export interface ArtNode {
  tag: ArtTag
  attrs: Record<string, string>
  children: ArtNode[]
}

export interface ParsedArt {
  viewBox: Box
  fit: ArtFit
  label?: string
  nodes: ArtNode[]
}

const TAGS = [
  'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'use',
] as const
export type ArtTag = (typeof TAGS)[number]
const TAG_BY_NAME = new Map<string, ArtTag>(TAGS.map((t) => [t.toLowerCase(), t]))

const GEOMETRY = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
  'fx', 'fy', 'offset', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits',
  'transform', 'pathLength',
])
const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
  'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'display', 'visibility', 'paint-order',
  'color', 'mix-blend-mode',
])

const SKIPPED_BLOCKS = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi
const TAG = /<(\/)?([a-zA-Z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/)?>/g
const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function parseArt(svgText: string, idPrefix: string): ParsedArt {
  const prefixId = (id: string) => `${idPrefix}-${id}`
  const localRef = (value: string): string | null => {
    // Every url() must be a local reference; anything else drops the attribute.
    let ok = true
    const out = value.replace(/url\(\s*['"]?([^'")]*)['"]?\s*\)/g, (_, ref: string) => {
      if (!ref.startsWith('#')) ok = false
      return `url(#${prefixId(ref.slice(1))})`
    })
    return ok ? out : null
  }

  const clean = (raw: Record<string, string>): Record<string, string> => {
    const attrs: Record<string, string> = {}
    const put = (name: string, value: string) => {
      if (!GEOMETRY.has(name) && !PRESENTATION.has(name)) return
      const v = localRef(value.trim())
      if (v !== null) attrs[name] = v
    }
    for (const [name, value] of Object.entries(raw)) {
      if (name === 'id') attrs.id = prefixId(value)
      else if (name === 'href' || name === 'xlink:href') {
        if (value.startsWith('#')) attrs.href = `#${prefixId(value.slice(1))}`
      } else put(name, value)
    }
    // Style beats presentation attributes, as in CSS.
    for (const decl of (raw.style ?? '').split(';')) {
      const i = decl.indexOf(':')
      if (i > 0) put(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1))
    }
    return attrs
  }

  const hidden = (raw: Record<string, string>, attrs: Record<string, string>) =>
    attrs.display === 'none' ||
    /^guides/i.test(raw.id ?? '') ||
    /^guides/i.test(raw['inkscape:label'] ?? '')

  let viewBox: Box | null = null
  let fit: ArtFit = { kind: 'contain' }
  let label: string | undefined
  const top: ArtNode = { tag: 'g', attrs: {}, children: [] }
  const stack: ArtNode[] = []
  let skipDepth = 0
  let sawRoot = false

  for (const [, closing, rawName, rawAttrs, selfClosing] of svgText.replace(SKIPPED_BLOCKS, '').matchAll(TAG)) {
    const name = rawName!.toLowerCase()
    if (closing) {
      if (skipDepth > 0) skipDepth--
      else if (name !== 'svg' || stack.length > 1) stack.pop()
      continue
    }
    if (skipDepth > 0) {
      if (!selfClosing) skipDepth++
      continue
    }
    const raw: Record<string, string> = {}
    for (const [, n, v1, v2] of rawAttrs!.matchAll(ATTRIBUTE)) raw[n!] = v1 ?? v2 ?? ''

    if (name === 'svg' && !sawRoot) {
      sawRoot = true
      viewBox = readViewBox(raw)
      fit = readFit(raw, viewBox)
      if (raw['data-label']) label = raw['data-label']
      // Root presentation (fill="none" and the like) still applies to the drawing.
      const inherited = clean(raw)
      for (const k of ['width', 'height', 'x', 'y', 'transform', 'id']) delete inherited[k]
      top.attrs = inherited
      stack.push(top)
      continue
    }
    const tag = TAG_BY_NAME.get(name)
    const attrs = tag ? clean(raw) : {}
    const parent = stack[stack.length - 1]
    if (!tag || !parent || hidden(raw, attrs)) {
      if (!selfClosing) skipDepth = 1
      continue
    }
    const node: ArtNode = { tag, attrs, children: [] }
    parent.children.push(node)
    if (!selfClosing) stack.push(node)
  }

  if (!viewBox) throw new Error('Art SVG needs a viewBox (or width and height) on its root <svg>')
  const nodes = Object.keys(top.attrs).length ? [top] : top.children
  return { viewBox, fit, ...(label ? { label } : {}), nodes }
}

function readViewBox(raw: Record<string, string>): Box | null {
  const nums = (raw.viewBox ?? raw.viewbox ?? '').trim().split(/[\s,]+/).map(Number)
  if (nums.length === 4 && nums.every(Number.isFinite) && nums[2]! > 0 && nums[3]! > 0) {
    return { x: nums[0]!, y: nums[1]!, w: nums[2]!, h: nums[3]! }
  }
  const w = parseFloat(raw.width ?? '')
  const h = parseFloat(raw.height ?? '')
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null
}

function readFit(raw: Record<string, string>, viewBox: Box | null): ArtFit {
  if (raw['data-fit'] !== 'segments') return { kind: 'contain' }
  const caps = (raw['data-caps'] ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
  const quarter = (viewBox?.w ?? 0) / 4
  const left = Number.isFinite(caps[0]) && caps[0]! >= 0 ? caps[0]! : quarter
  const right = Number.isFinite(caps[1]) && caps[1]! >= 0 ? caps[1]! : left
  return { kind: 'segments', caps: [left, right] }
}
