/**
 * The house map as SVG. Layers, bottom to top:
 *
 *   floor → walls → items → decay → effects → ui
 *
 * `setHouse` builds the structure; `setStatus` restyles existing nodes in place.
 * Keeping nodes stable across decay updates is what lets restore animations (M6)
 * play on the item itself.
 *
 * In the MVP, decay is carried by the item's stroke color and weight: CSS custom
 * properties `--decay-color` and `--item-stroke` on the item group, which the skin
 * inherits through `currentColor`. The `decay` layer stays empty until sprite
 * overlays arrive; it's in the stack now so adding them doesn't reorder anything.
 */
import {
  DEFAULT_DECAY_CONFIG,
  isFloorItem,
  itemTypeLabel,
  type DecayConfig,
  type HouseStatus,
  type Home,
  type Id,
  type Item,
  type Room,
} from '../domain'
import { floorTint, itemDecayStyle, type DecayPalette } from './decay-style'
import { atLeast, center, CELL, footprint, gridToUnits, homeBounds, roomOutline, type Point, type Rect } from './geometry'
import type { SkinRegistry } from './skins'
import { setAttrs, svg } from './svg'

export const LAYERS = ['floor', 'walls', 'items', 'decay', 'effects', 'ui'] as const
export type LayerName = (typeof LAYERS)[number]

export interface MapModel {
  home: Home
  rooms: readonly Room[]
  items: readonly Item[]
}

export interface DecayRenderOptions {
  palette: DecayPalette
  config?: DecayConfig
}

interface ItemNodes {
  /** Positioned and rotated via the SVG transform attribute. */
  group: SVGGElement
  /** Inside `group`; free for CSS/WAAPI transforms (animations) without clobbering placement. */
  body: SVGGElement
  hit: SVGRectElement
  bounds: Rect
}

const ROOM_LABEL_PADDING = 6

export class MapView {
  readonly root: SVGSVGElement
  /** Receives the pan/zoom transform. */
  readonly content: SVGGElement
  readonly layers: Record<LayerName, SVGGElement>

  private readonly itemNodes = new Map<Id, ItemNodes>()
  private readonly floorTints = new Map<Id, SVGGElement>()
  private readonly roomCenters = new Map<Id, Point>()
  /** roomId → its floor item's id. */
  private readonly floorItems = new Map<Id, Id>()
  private bounds: Rect = { x: 0, y: 0, w: CELL, h: CELL }
  private minHitSize = 0

  constructor(
    private readonly skins: SkinRegistry,
    private readonly labelFor: (type: string) => string = itemTypeLabel,
  ) {
    this.layers = Object.fromEntries(
      LAYERS.map((name) => [name, svg('g', { class: `layer layer-${name}` })]),
    ) as Record<LayerName, SVGGElement>
    this.content = svg('g', { class: 'map-content' }, LAYERS.map((name) => this.layers[name]))
    this.root = svg('svg', { class: 'map', role: 'img' }, [this.content])
  }

  /** The house's extent in user units, for fitting the viewport. */
  get contentBounds(): Rect {
    return this.bounds
  }

  /** (Re)builds the whole map. Call when rooms or items change, not for decay. */
  setHouse({ home, rooms, items }: MapModel): void {
    for (const layer of LAYERS) this.layers[layer].replaceChildren()
    this.itemNodes.clear()
    this.floorTints.clear()
    this.floorItems.clear()
    this.roomCenters.clear()
    this.bounds = homeBounds(home)
    this.root.setAttribute('aria-label', `Map of ${home.name}`)

    for (const room of rooms) this.addRoom(room)
    for (const item of items) {
      if (isFloorItem(item)) this.floorItems.set(item.roomId, item.id)
      else this.addItem(item)
    }
    this.applyHitSize()
  }

  /** Restyles items and floor tints from derived decay. Cheap; call as often as needed. */
  setStatus(status: HouseStatus, { palette, config = DEFAULT_DECAY_CONFIG }: DecayRenderOptions): void {
    for (const [itemId, { group }] of this.itemNodes) {
      const style = itemDecayStyle(status.items.get(itemId) ?? null, palette, config)
      group.style.setProperty('--decay-color', style.color)
      group.style.setProperty('--item-stroke', String(style.strokeWidth))
      group.dataset.stage = style.stage
    }
    for (const [roomId, tint] of this.floorTints) {
      const floorId = this.floorItems.get(roomId)
      const fill = floorTint(floorId ? (status.items.get(floorId) ?? null) : null, palette, config)
      // Fade via opacity, keeping the last fill while fading out, so restores ease away.
      if (fill) tint.style.fill = fill
      tint.style.opacity = fill ? '1' : '0'
    }
  }

  /**
   * Minimum hit-target side in user units. The viewport sets this to 44 CSS px
   * divided by the current scale, so small items stay tappable at any zoom.
   */
  setMinHitSize(units: number): void {
    this.minHitSize = units
    this.applyHitSize()
  }

  itemGroup(itemId: Id): SVGGElement | undefined {
    return this.itemNodes.get(itemId)?.group
  }

  /** The animatable inner group of an item. */
  itemBody(itemId: Id): SVGGElement | undefined {
    return this.itemNodes.get(itemId)?.body
  }

  /** Center of an item's footprint, in user units. */
  itemCenter(itemId: Id): Point | undefined {
    const nodes = this.itemNodes.get(itemId)
    return nodes && center(nodes.bounds)
  }

  /** Bounds of an item's footprint, in user units. */
  itemBounds(itemId: Id): Rect | undefined {
    return this.itemNodes.get(itemId)?.bounds
  }

  /** Center of a room's first rectangle, in user units. */
  roomCenter(roomId: Id): Point | undefined {
    return this.roomCenters.get(roomId)
  }

  private addRoom(room: Room): void {
    const rects = room.cells.map(gridToUnits)
    const cellRects = () => rects.map((r) => svg('rect', { x: r.x, y: r.y, width: r.w, height: r.h }))

    this.layers.floor.append(
      svg('g', { class: 'room-floor', 'data-room-id': room.id }, cellRects()),
    )
    const tint = svg('g', { class: 'floor-tint', 'data-room-id': room.id }, cellRects())
    tint.style.opacity = '0'
    this.layers.floor.append(tint)
    this.floorTints.set(room.id, tint)

    this.layers.walls.append(
      svg(
        'g',
        { class: 'room-walls', 'data-room-id': room.id },
        roomOutline(room.cells).map((s) => svg('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
      ),
    )

    const anchor = rects[0]
    if (anchor) {
      this.roomCenters.set(room.id, center(anchor))
      const label = svg('text', {
        class: 'room-label',
        'data-room-id': room.id,
        x: anchor.x + ROOM_LABEL_PADDING,
        y: anchor.y + ROOM_LABEL_PADDING,
        'dominant-baseline': 'hanging',
      })
      label.textContent = room.name
      this.layers.ui.append(label)
    }
  }

  private addItem(item: Item): void {
    const bounds = gridToUnits(footprint(item))
    const c = center(bounds)
    const label = this.labelFor(item.type)
    const skin = this.skins.resolve(item)({
      item,
      width: item.size.w * CELL,
      height: item.size.h * CELL,
      label,
    })
    const body = svg('g', { class: 'item-body' }, [skin])
    const group = svg(
      'g',
      {
        class: 'item',
        'data-item-id': item.id,
        transform: `translate(${c.x} ${c.y})${item.rotation ? ` rotate(${item.rotation})` : ''}`,
      },
      [body],
    )
    this.layers.items.append(group)

    const hit = svg('rect', { class: 'hit', 'data-item-id': item.id, 'aria-label': label })
    this.layers.ui.append(hit)
    this.itemNodes.set(item.id, { group, body, hit, bounds })
  }

  private applyHitSize(): void {
    for (const { hit, bounds } of this.itemNodes.values()) {
      const r = atLeast(bounds, this.minHitSize)
      setAttrs(hit, { x: r.x, y: r.y, width: r.w, height: r.h })
    }
  }
}
