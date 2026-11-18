/**
 * Skin registry: how an item looks, chosen by `item.skin`. Icon skins and art skins
 * (`render/art`) coexist, so art can ship one item at a time with icons as the fallback.
 *
 * Keys are `<type>.<look>`: `bed.icon`, `bed.quilt`. A type's looks are what the
 * editor's Look picker offers.
 *
 * Contract for a skin:
 * - Draw centered on the origin in a width × height box (user units), unrotated;
 *   the map handles position and rotation.
 * - Line skins stroke with `currentColor` and width `var(--item-stroke)`. The map sets
 *   both from decay, so a skin never needs to know about decay colors.
 * - Art skins (`outline: true`) draw fills and leave the footprint outline to the map,
 *   which draws it over the art in the decay color. Never recolor art for decay; the
 *   map's decay overlays (`decay-overlays.ts`) show dust and grime on top.
 * - `ctx.stage` is the item's current stage. Only skins registered `stageAware` get
 *   re-rendered when it changes; the rest are drawn once per layout.
 */
import type { Item, Stage } from '../domain'
import { svg } from './svg'

export interface SkinContext {
  item: Item
  width: number
  height: number
  label: string
  /** 'unknown' while nothing under the item has been logged (and in previews). */
  stage: Stage | 'unknown'
}

export type SkinRenderer = (ctx: SkinContext) => SVGElement

export interface SkinOptions {
  /** Name in the Look picker. Defaults to the look part of the key, capitalized. */
  label?: string
  /** Re-render when the item's stage changes (a plant that wilts). */
  stageAware?: boolean
  /** The map draws the footprint outline over this skin (art skins). */
  outline?: boolean
}

export interface Skin {
  key: string
  render: SkinRenderer
  label: string
  stageAware: boolean
  outline: boolean
}

export const PLACEHOLDER_SKIN = 'placeholder'
export const ICON_LOOK = 'icon'

/** Inset of the footprint outline from the cell edges, in user units. */
export const FOOTPRINT_INSET = 4
/** Footprint outline corner radius. */
export const FOOTPRINT_RADIUS = 8
/** Art stays this far inside the cell edges, clear of the outline and its heaviest stroke. */
export const ART_INSET = 6

/** The footprint outline rectangle for a width × height item centered on the origin. */
export function footprintRect(width: number, height: number) {
  return {
    x: -width / 2 + FOOTPRINT_INSET,
    y: -height / 2 + FOOTPRINT_INSET,
    width: width - 2 * FOOTPRINT_INSET,
    height: height - 2 * FOOTPRINT_INSET,
    rx: FOOTPRINT_RADIUS,
  }
}

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

const PLACEHOLDER: Skin = { key: PLACEHOLDER_SKIN, render: placeholderSkin, label: 'Placeholder', stageAware: false, outline: false }

const typeOf = (key: string) => key.slice(0, key.lastIndexOf('.'))
const lookOf = (key: string) => key.slice(key.lastIndexOf('.') + 1)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]+/g, ' ')

export class SkinRegistry {
  private readonly skins = new Map<string, Skin>([[PLACEHOLDER_SKIN, PLACEHOLDER]])

  register(key: string, render: SkinRenderer, options: SkinOptions = {}): this {
    this.skins.set(key, {
      key,
      render,
      label: options.label ?? (lookOf(key) === ICON_LOOK ? 'Simple icon' : capitalize(lookOf(key))),
      stageAware: options.stageAware ?? false,
      outline: options.outline ?? false,
    })
    return this
  }

  /** The item's own skin, else its type's icon skin, else the placeholder. */
  skinFor(item: Pick<Item, 'skin' | 'type'>): Skin {
    return this.skins.get(item.skin) ?? this.skins.get(`${item.type}.${ICON_LOOK}`) ?? PLACEHOLDER
  }

  resolve(item: Pick<Item, 'skin' | 'type'>): SkinRenderer {
    return this.skinFor(item).render
  }

  /** Every look for a type: art in registration order, then the icon. */
  skinsFor(type: string): Skin[] {
    const looks = [...this.skins.values()].filter((s) => s.key !== PLACEHOLDER_SKIN && typeOf(s.key) === type)
    return [...looks.filter((s) => lookOf(s.key) !== ICON_LOOK), ...looks.filter((s) => lookOf(s.key) === ICON_LOOK)]
  }

  /** The skin a new item of this type starts with: its first art look, else its icon. */
  defaultSkin(type: string): string {
    return this.skinsFor(type)[0]?.key ?? `${type}.${ICON_LOOK}`
  }
}
