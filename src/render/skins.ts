/**
 * Skin registry: how an item looks, chosen by `item.skin`. Icon skins (M5) and,
 * later, tile skins coexist, so art can ship one item at a time.
 *
 * Contract for a skin:
 * - Draw centered on the origin in a width × height box (user units), unrotated;
 *   the map handles position and rotation.
 * - Stroke with `currentColor` and width `var(--item-stroke)`. The map sets both
 *   from decay (`color` follows `--decay-color`), so a skin never needs to know about decay.
 */
import type { Item } from '../domain'
import { svg } from './svg'

export interface SkinContext {
  item: Item
  width: number
  height: number
  label: string
}

export type SkinRenderer = (ctx: SkinContext) => SVGElement

export const PLACEHOLDER_SKIN = 'placeholder'

/** Rounded box with the item's initials: stands in until an icon exists. */
export const placeholderSkin: SkinRenderer = ({ width, height, label }) => {
  const inset = 6
  const initials = label
    .split(/[\s-]+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  const text = svg('text', {
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-size': Math.min(width, height) * 0.32,
    fill: 'currentColor',
  })
  text.textContent = initials
  return svg('g', { class: 'skin-placeholder' }, [
    svg('rect', {
      x: -width / 2 + inset,
      y: -height / 2 + inset,
      width: width - 2 * inset,
      height: height - 2 * inset,
      rx: 6,
      fill: 'none',
      stroke: 'currentColor',
      style: 'stroke-width: var(--item-stroke)',
    }),
    text,
  ])
}

export class SkinRegistry {
  private readonly skins = new Map<string, SkinRenderer>([[PLACEHOLDER_SKIN, placeholderSkin]])

  register(key: string, renderer: SkinRenderer): this {
    this.skins.set(key, renderer)
    return this
  }

  /** The item's own skin, else its type's icon skin, else the placeholder. */
  resolve(item: Pick<Item, 'skin' | 'type'>): SkinRenderer {
    return this.skins.get(item.skin) ?? this.skins.get(`${item.type}.icon`) ?? placeholderSkin
  }
}
