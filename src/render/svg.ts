/** Minimal helper for building SVG DOM. */
export const SVG_NS = 'http://www.w3.org/2000/svg'

export type Attrs = Record<string, string | number | undefined>

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  setAttrs(el, attrs)
  for (const child of children) el.appendChild(child)
  return el
}

export function setAttrs(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v))
}
