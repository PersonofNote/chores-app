/**
 * The house map as SVG. Layers, bottom to top:
 *
 *   floor → grid → walls → items → decay → effects → ui
 *
 * The grid layer is only visible while editing (`setEditing`).
 *
 * `setHouse` builds the structure; `setStatus` restyles existing nodes in place.
 * Keeping nodes stable across decay updates is what lets restore animations (M6)
 * play on the item itself.
 *
 * Decay shows three ways, none of which recolors art:
 * - stroke color and weight: CSS custom properties `--decay-color` and `--item-stroke`
 *   on the item group. Line skins inherit them through `currentColor`; art skins get a
 *   footprint outline drawn by the map in that color, over the art;
 * - overlays in the `decay` layer: dust, grime and cobwebs (`decay-overlays.ts`), all
 *   levels drawn once per item and revealed by CSS from `data-stage`, so they fade;
 * - stage-aware skins (a wilting plant) are re-rendered inside the stable body when
 *   their item's stage changes.
 */
import {
  DEFAULT_DECAY_CONFIG,
  isFloorItem,
  itemName,
  type DecayConfig,
  type HouseStatus,
  type Home,
  type Id,
  type Item,
  type Room,
  type Stage,
} from '../domain'
import { allOverlayShapes, drawOverlayShapes } from './decay-overlays'
import { floorTint, itemDecayStyle, type DecayPalette } from './decay-style'
import { atLeast, boundingRect, center, CELL, footprint, gridToUnits, homeBounds, roomOutline, type Point, type Rect } from './geometry'
import { labelPlacement } from './labels'
import { footprintRect, type Skin, type SkinRegistry } from './skins'
import { setAttrs, svg } from './svg'

export const LAYERS = ['floor', 'grid', 'walls', 'items', 'decay', 'effects', 'ui'] as const
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
  /** Over the item in the decay layer, same transform as `group`. */
  overlay: SVGGElement
  bounds: Rect
  item: Item
  skin: Skin
  label: string
}

type ItemStage = Stage | 'unknown'

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
  /** Last known stage per item; kept across rebuilds so stage-aware skins don't flicker. */
  private readonly stages = new Map<Id, ItemStage>()
  private bounds: Rect = { x: 0, y: 0, w: CELL, h: CELL }
  private roomBounds: Rect | null = null
  private minHitSize = 0

  constructor(
    private readonly skins: SkinRegistry,
    private readonly labelFor: (item: Item) => string = itemName,
  ) {
    this.layers = Object.fromEntries(
      LAYERS.map((name) => [name, svg('g', { class: `layer layer-${name}` })]),
    ) as Record<LayerName, SVGGElement>
    this.content = svg('g', { class: 'map-content' }, LAYERS.map((name) => this.layers[name]))
    this.root = svg('svg', { class: 'map', role: 'img' }, [this.content])
  }

  /** The whole home grid in user units (for fitting the view while editing). */
  get contentBounds(): Rect {
    return this.bounds
  }

  /** Where the rooms are, plus half a cell of margin; the grid if there are none. */
  get roomsBounds(): Rect {
    return this.roomBounds ?? this.bounds
  }

  /** (Re)builds the whole map. Call when rooms or items change, not for decay. */
  setHouse({ home, rooms, items }: MapModel): void {
    for (const layer of LAYERS) this.layers[layer].replaceChildren()
    this.itemNodes.clear()
    this.floorTints.clear()
    this.floorItems.clear()
    this.roomCenters.clear()
    this.bounds = homeBounds(home)
    const box = boundingRect(rooms.flatMap((r) => r.cells.map(gridToUnits)))
    this.roomBounds = box && { x: box.x - CELL / 2, y: box.y - CELL / 2, w: box.w + CELL, h: box.h + CELL }
    this.drawGrid(home.gridSize.w, home.gridSize.h)
    this.root.setAttribute('aria-label', `Map of ${home.name}`)

    for (const room of rooms) this.addRoom(room, items)
    for (const item of items) {
      if (isFloorItem(item)) this.floorItems.set(item.roomId, item.id)
      else this.addItem(item)
    }
    for (const id of this.stages.keys()) if (!this.itemNodes.has(id)) this.stages.delete(id)
    this.applyHitSize()
  }

  /** Restyles items and floor tints from derived decay. Cheap; call as often as needed. */
  setStatus(status: HouseStatus, { palette, config = DEFAULT_DECAY_CONFIG }: DecayRenderOptions): void {
    for (const [itemId, nodes] of this.itemNodes) {
      const { group, overlay, skin } = nodes
      const style = itemDecayStyle(status.items.get(itemId) ?? null, palette, config)
      group.style.setProperty('--decay-color', style.color)
      group.style.setProperty('--item-stroke', String(style.strokeWidth))
      const changed = group.dataset.stage !== style.stage
      group.dataset.stage = style.stage
      overlay.dataset.stage = style.stage
      this.stages.set(itemId, style.stage)
      if (changed && skin.stageAware) nodes.body.replaceChildren(...this.drawSkin(nodes))
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

  /** Edit mode: shows the grid; CSS can restyle anything under `.map.editing`. */
  setEditing(on: boolean): void {
    this.root.classList.toggle('editing', on)
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

  private drawGrid(w: number, h: number): void {
    const lines: SVGElement[] = [svg('rect', { class: 'grid-bounds', x: 0, y: 0, width: w * CELL, height: h * CELL })]
    for (let x = 1; x < w; x++) lines.push(svg('line', { x1: x * CELL, y1: 0, x2: x * CELL, y2: h * CELL }))
    for (let y = 1; y < h; y++) lines.push(svg('line', { x1: 0, y1: y * CELL, x2: w * CELL, y2: y * CELL }))
    this.layers.grid.append(...lines)
  }

  private addRoom(room: Room, items: readonly Item[]): void {
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
      const place = labelPlacement(room, items)
      const label = svg('text', {
        class: 'room-label',
        'data-room-id': room.id,
        x: place.x,
        y: place.y,
        'text-anchor': place.anchor,
        'dominant-baseline': place.baseline,
      })
      label.textContent = room.name
      this.layers.ui.append(label)
    }
  }

  private addItem(item: Item): void {
    const bounds = gridToUnits(footprint(item))
    const c = center(bounds)
    const label = this.labelFor(item)
    const skin = this.skins.skinFor(item)
    const stage = this.stages.get(item.id)
    const transform = `translate(${c.x} ${c.y})${item.rotation ? ` rotate(${item.rotation})` : ''}`
    const width = item.size.w * CELL
    const height = item.size.h * CELL

    const body = svg('g', { class: 'item-body' })
    const group = svg('g', { class: `item${skin.outline ? ' item-art' : ''}`, 'data-item-id': item.id, transform }, [body])
    const overlay = svg(
      'g',
      { class: 'decay-overlay', 'data-item-id': item.id, transform },
      drawOverlayShapes(allOverlayShapes({ width, height }, item.id)),
    )
    if (stage) {
      group.dataset.stage = stage
      overlay.dataset.stage = stage
    }
    const hit = svg('rect', { class: 'hit', 'data-item-id': item.id, 'aria-label': label })
    const nodes: ItemNodes = { group, body, hit, overlay, bounds, item, skin, label }
    body.append(...this.drawSkin(nodes))

    this.layers.items.append(group)
    this.layers.decay.append(overlay)
    this.layers.ui.append(hit)
    this.itemNodes.set(item.id, nodes)
  }

  /** The skin, plus the footprint outline over it for art skins. */
  private drawSkin({ item, skin, label, group }: ItemNodes): SVGElement[] {
    const width = item.size.w * CELL
    const height = item.size.h * CELL
    const stage = (group.dataset.stage ?? 'unknown') as ItemStage
    const drawn = [skin.render({ item, width, height, label, stage })]
    if (skin.outline) drawn.push(svg('rect', { class: 'item-outline', ...footprintRect(width, height) }))
    return drawn
  }

  private applyHitSize(): void {
    for (const { hit, bounds } of this.itemNodes.values()) {
      const r = atLeast(bounds, this.minHitSize)
      setAttrs(hit, { x: r.x, y: r.y, width: r.w, height: r.h })
    }
  }
}
