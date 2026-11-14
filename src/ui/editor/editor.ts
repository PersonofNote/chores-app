/**
 * Edit mode: lay out rooms and items on the grid.
 *
 * Tap selects (an item, or a room via its floor or label). A selected thing can
 * be dragged: rooms move with their items, corner handles resize a room's
 * sections, items move and may change rooms. Drags preview live, cell by cell,
 * only through valid layouts; release commits the last valid one.
 *
 * Adding a room or item ends with the "Last done?" sheet, so everything new starts
 * with honest decay.
 */
import {
  boundingBox,
  checkRoom,
  createDefaultTasks,
  defaultLibrary,
  findItemSpot,
  findRoomSpot,
  FLOOR_TYPE,
  isFloorItem,
  itemTypeLabel,
  roomAt,
  seedTasks,
  type Clock,
  type GridCell,
  type Id,
  type IdGenerator,
  type Item,
  type Random,
  type Room,
  type Rotation,
  type Task,
} from '../../domain'
import { CELL, footprint, gridToUnits, type Point } from '../../render/geometry'
import type { MapView } from '../../render/map-view'
import type { SkinRegistry } from '../../render/skins'
import { svg } from '../../render/svg'
import { LayoutError, type HouseStore } from '../../state/house-store'
import type { HouseData } from '../../storage'
import { button, el, type SheetHost } from '../components/sheet'
import type { Toaster } from '../components/toast'
import type { Gesture } from '../gestures'
import { confirmBody, libraryPickerBody, roomNameBody } from '../panels/editor-panels'
import { seedPrompt } from '../panels/seed-prompt'
import { screenToContent, type ViewState } from '../viewport-math'
import { check, CORNERS, propose, type Corner, type DragTarget, type Proposal } from './drag'

export type Selection = { kind: 'room'; roomId: Id; rectIndex: number } | { kind: 'item'; itemId: Id } | null

export interface EditorDeps {
  store: HouseStore
  map: MapView
  overlay: HTMLElement
  sheets: SheetHost
  toaster: Toaster
  skins: SkinRegistry
  view: () => ViewState
  /** Draws a house on the map (the store's, or a drag preview) and restyles decay. */
  render: (house: Readonly<HouseData>) => void
  /** Opens the Settings sheet (name, size, sound, backup). */
  openSettings: () => void
  /** Opens the chore editor for an item. */
  editChores?: (itemId: Id) => void
  clock: Clock
  newId: IdGenerator
  random?: Random
  /** Called when edit mode starts or ends. */
  onModeChange?: (editing: boolean) => void
}

const NEW_ROOM_SIZE = { w: 4, h: 3 }
const NEW_SECTION_SIZE = { w: 2, h: 2 }
/** Visible handle radius and touch radius, in CSS px (divided by zoom). */
const HANDLE_PX = 9
const HANDLE_HIT_PX = 22

interface DragSession {
  pointerId: number
  target: DragTarget
  start: Point
  delta: { dx: number; dy: number }
  /** Last valid proposal, committed on release. */
  preview: Proposal | null
}

export class Editor {
  private active = false
  private selection: Selection = null
  private drag: DragSession | null = null
  /** Settings and Edit, shown while not editing. */
  private readonly modeBar: HTMLDivElement
  private readonly topBar: HTMLDivElement
  private readonly toolbar: HTMLDivElement
  private readonly random: Random

  constructor(private readonly deps: EditorDeps) {
    this.random = deps.random ?? Math.random
    this.modeBar = el('div', { className: 'mode-bar' }, [
      button('Settings', () => deps.openSettings(), 'mode-button'),
      button('Edit', () => this.enter(), 'mode-button'),
    ])
    this.topBar = el('div', { className: 'editor-topbar' })
    this.toolbar = el('div', { className: 'editor-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Editor' } })
    this.topBar.hidden = true
    this.toolbar.hidden = true
    deps.overlay.append(this.modeBar, this.topBar, this.toolbar)

    const root = deps.map.root
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    root.addEventListener('pointermove', (e) => this.onPointerMove(e))
    root.addEventListener('pointerup', (e) => void this.onPointerUp(e))
    root.addEventListener('pointercancel', (e) => this.onPointerCancel(e))

    deps.store.subscribe((change) => {
      if (change.kind !== 'layout') return
      this.validateSelection()
      this.redraw()
    })
  }

  get isActive(): boolean {
    return this.active
  }

  get selected(): Selection {
    return this.selection
  }

  enter(): void {
    this.active = true
    this.deps.map.setEditing(true)
    this.modeBar.hidden = true
    this.topBar.hidden = false
    this.toolbar.hidden = false
    this.deps.onModeChange?.(true)
    this.redraw()
  }

  exit(): void {
    this.active = false
    this.selection = null
    this.drag = null
    this.deps.map.setEditing(false)
    this.modeBar.hidden = false
    this.topBar.hidden = true
    this.toolbar.hidden = true
    this.deps.onModeChange?.(false)
    this.redraw()
  }

  handle(g: Gesture): void {
    const t = g.target
    if (!t) this.select(null)
    else if (t.kind === 'item') this.select({ kind: 'item', itemId: t.itemId })
    else this.select({ kind: 'room', roomId: t.roomId, rectIndex: this.rectIndexAt(t.roomId, g.point) })
  }

  /** Whether the editor takes this pointer (for a drag) instead of the viewport panning. */
  claims(e: PointerEvent): boolean {
    return this.active && this.dragTargetFor(e.target as Element) !== null
  }

  select(selection: Selection): void {
    this.selection = selection
    this.redraw()
  }

  /** Redraws selection, handles and the toolbars. Call after the map is rebuilt or zoomed. */
  redraw(): void {
    this.drawSelection()
    this.renderBars()
  }

  // ---- Actions -------------------------------------------------------------------

  addRoom(): void {
    const { store, sheets } = this.deps
    sheets.open({
      title: 'New room',
      body: roomNameBody('', 'Add room', (name) => {
        sheets.close()
        const spot = findRoomSpot(store.house.home, store.house.rooms, NEW_ROOM_SIZE, this.viewCenterCell())
        if (!spot) return this.say('There’s no free space left. Make the house bigger in Settings.')
        const room: Room = { id: this.deps.newId(), homeId: store.house.home.id, name, cells: [spot] }
        const floor: Item = {
          id: this.deps.newId(),
          roomId: room.id,
          type: FLOOR_TYPE,
          skin: `${FLOOR_TYPE}.icon`,
          cell: { x: spot.x, y: spot.y },
          size: { w: 1, h: 1 },
          rotation: 0,
        }
        const tasks = createDefaultTasks(floor.id, FLOOR_TYPE, this.deps.newId)
        this.run(async () => {
          await store.addRoom(room, floor, tasks)
          this.select({ kind: 'room', roomId: room.id, rectIndex: 0 })
          this.askLastDone(`${name} floor`, tasks)
        })
      }),
    })
  }

  addItem(): void {
    const { store, sheets } = this.deps
    const room = this.targetRoom()
    if (!room) return this.say('Add a room first.')
    sheets.open({
      title: `Add to ${room.name}`,
      body: libraryPickerBody(defaultLibrary, (type) => this.iconPreview(type), (type) => {
        sheets.close()
        const size = defaultLibrary.items[type]!.size
        const cell = findItemSpot(store.house.home, store.house.rooms, store.house.items, room, size)
        if (!cell) return this.say(`No free space in ${room.name} for that. Make the room bigger or move things.`)
        const item: Item = { id: this.deps.newId(), roomId: room.id, type, skin: `${type}.icon`, cell, size, rotation: 0 }
        const tasks = createDefaultTasks(item.id, type, this.deps.newId)
        this.run(async () => {
          const placed = await store.addItem(item, tasks)
          this.select({ kind: 'item', itemId: placed.id })
          this.askLastDone(itemTypeLabel(type), tasks)
        })
      }),
    })
  }

  renameRoom(roomId: Id): void {
    const room = this.room(roomId)
    if (!room) return
    this.deps.sheets.open({
      title: 'Rename room',
      body: roomNameBody(room.name, 'Save', (name) => {
        this.deps.sheets.close()
        this.run(() => this.deps.store.updateLayout([{ ...room, name }]))
      }),
    })
  }

  /** Adds a 2 × 2 section beside the room (for L-shapes), wherever it first fits. */
  addSection(roomId: Id): void {
    const { store } = this.deps
    const room = this.room(roomId)
    if (!room) return
    const box = boundingBox(room.cells)
    const { w, h } = NEW_SECTION_SIZE
    const candidates = [
      { x: box.x + box.w, y: box.y, w, h },
      { x: box.x, y: box.y + box.h, w, h },
      { x: box.x - w, y: box.y, w, h },
      { x: box.x, y: box.y - h, w, h },
    ]
    for (const rect of candidates) {
      const next = { ...room, cells: [...room.cells, rect] }
      if (!checkRoom(store.house.home, store.house.rooms, store.house.items, next)) {
        this.run(async () => {
          await store.updateLayout([next])
          this.select({ kind: 'room', roomId, rectIndex: next.cells.length - 1 })
        })
        return
      }
    }
    this.say('No space beside this room for another section.')
  }

  removeSection(roomId: Id, rectIndex: number): void {
    const room = this.room(roomId)
    if (!room || room.cells.length < 2) return
    const next = { ...room, cells: room.cells.filter((_, i) => i !== rectIndex) }
    this.run(async () => {
      await this.deps.store.updateLayout([next])
      this.select({ kind: 'room', roomId, rectIndex: 0 })
    })
  }

  deleteRoom(roomId: Id): void {
    const room = this.room(roomId)
    if (!room) return
    const count = this.deps.store.itemsInRoom(roomId).filter((i) => !isFloorItem(i)).length
    const what = count ? `${room.name} and the ${count} item${count === 1 ? '' : 's'} in it` : room.name
    this.confirm(`Delete ${what}? Past history stays in backups.`, 'Delete', async () => {
      await this.deps.store.deleteRoom(roomId)
      this.select(null)
    })
  }

  rotateItem(itemId: Id): void {
    const item = this.deps.store.item(itemId)
    if (!item) return
    const rotation = ((item.rotation + 90) % 360) as Rotation
    this.run(() => this.deps.store.placeItem({ ...item, rotation }).then(() => {}))
  }

  deleteItem(itemId: Id): void {
    const item = this.deps.store.item(itemId)
    if (!item) return
    this.confirm(`Delete ${itemTypeLabel(item.type)}? Past history stays in backups.`, 'Delete', async () => {
      await this.deps.store.deleteItem(itemId)
      this.select(null)
    })
  }

  // ---- "Last done?" ------------------------------------------------------------------

  private askLastDone(title: string, tasks: readonly Task[]): void {
    if (tasks.length === 0) return
    const { sheets, store, clock, newId } = this.deps
    let seeded = false
    const prompt = seedPrompt(tasks, () => sheets.close())
    sheets.open({
      title,
      subtitle: 'Last done?',
      body: prompt.body,
      // However the sheet closes, seed with the current answers ("No idea" by default).
      onClose: () => {
        if (seeded) return
        seeded = true
        const events = seedTasks(tasks, prompt.answers(), { clock, newId, random: this.random })
        store.seed(events).catch((err) => this.failed(err))
      },
    })
  }

  // ---- Drag --------------------------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
    if (!this.active || this.drag || e.button !== 0) return
    const target = this.dragTargetFor(e.target as Element)
    if (!target) return
    const handle = (e.target as Element).closest<SVGElement>('[data-corner]')
    if (handle && this.selection?.kind === 'room') {
      this.selection = { ...this.selection, rectIndex: Number(handle.dataset.rect) }
    }
    this.drag = { pointerId: e.pointerId, target, start: this.contentPoint(e), delta: { dx: 0, dy: 0 }, preview: null }
    this.deps.map.root.setPointerCapture?.(e.pointerId)
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.pointerId) return
    const p = this.contentPoint(e)
    const dx = Math.round((p.x - drag.start.x) / CELL)
    const dy = Math.round((p.y - drag.start.y) / CELL)
    if (dx === drag.delta.dx && dy === drag.delta.dy) return
    drag.delta = { dx, dy }
    const { house } = this.deps.store
    const result = check(house.home, house.rooms, house.items, propose(drag.target, dx, dy))
    if (result.ok) {
      drag.preview = dx === 0 && dy === 0 ? null : result.proposal
      this.deps.render(this.withProposal(drag.preview))
      this.redraw()
    } else {
      this.flashInvalid()
    }
  }

  private async onPointerUp(e: PointerEvent): Promise<void> {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.pointerId) return
    this.drag = null
    this.deps.map.root.releasePointerCapture?.(e.pointerId)
    const proposal = drag.preview
    if (!proposal) return
    try {
      await this.deps.store.updateLayout(proposal.rooms, proposal.items)
    } catch (err) {
      this.deps.render(this.deps.store.house)
      this.failed(err)
    }
    this.redraw()
  }

  private onPointerCancel(e: PointerEvent): void {
    if (this.drag?.pointerId !== e.pointerId) return
    this.drag = null
    this.deps.render(this.deps.store.house)
    this.redraw()
  }

  /** What a press on `el` would drag, given the current selection. */
  private dragTargetFor(element: Element | null): DragTarget | null {
    const sel = this.selection
    if (!element || !sel) return null
    const { store } = this.deps
    if (sel.kind === 'item') {
      const hit = element.closest<SVGElement>('[data-item-id]')
      const item = store.item(sel.itemId)
      return hit?.dataset.itemId === sel.itemId && item ? { kind: 'move-item', item } : null
    }
    const room = this.room(sel.roomId)
    if (!room) return null
    const corner = element.closest<SVGElement>('[data-corner]')
    if (corner) {
      return {
        kind: 'resize',
        room,
        rectIndex: Number(corner.dataset.rect),
        corner: corner.dataset.corner as Corner,
        floor: store.itemsInRoom(room.id).find(isFloorItem),
      }
    }
    const roomEl = element.closest<SVGElement>('.room-floor, .floor-tint, .room-label, .editor-room-body')
    if (roomEl?.dataset.roomId === room.id) return { kind: 'move-room', room, items: store.itemsInRoom(room.id) }
    return null
  }

  private withProposal(p: Proposal | null): Readonly<HouseData> {
    const house = this.deps.store.house
    if (!p) return house
    return {
      ...house,
      rooms: house.rooms.map((r) => p.rooms.find((x) => x.id === r.id) ?? r),
      items: house.items.map((i) => p.items.find((x) => x.id === i.id) ?? i),
    }
  }

  // ---- Drawing -------------------------------------------------------------------------

  private drawSelection(): void {
    const { map } = this.deps
    map.layers.ui.querySelector('.editor-overlay')?.remove()
    if (!this.active || !this.selection) return
    const scale = this.deps.view().scale
    const group = svg('g', { class: 'editor-overlay' })
    const sel = this.selection
    const house = this.drag?.preview ? this.withProposal(this.drag.preview) : this.deps.store.house

    if (sel.kind === 'item') {
      const item = house.items.find((i) => i.id === sel.itemId)
      if (item) {
        const r = gridToUnits(footprint(item))
        group.append(svg('rect', { class: 'selection', x: r.x, y: r.y, width: r.w, height: r.h, rx: 6 }))
      }
    } else {
      const room = house.rooms.find((r) => r.id === sel.roomId)
      room?.cells.forEach((cell, i) => {
        const r = gridToUnits(cell)
        group.append(svg('rect', {
          class: `selection${i === sel.rectIndex ? ' current' : ''}`,
          x: r.x, y: r.y, width: r.w, height: r.h,
        }))
        for (const corner of CORNERS) {
          const cx = corner.endsWith('w') ? r.x : r.x + r.w
          const cy = corner.startsWith('n') ? r.y : r.y + r.h
          group.append(svg('g', { class: 'handle', 'data-corner': corner, 'data-rect': i }, [
            svg('circle', { class: 'handle-hit', cx, cy, r: HANDLE_HIT_PX / scale }),
            svg('circle', { class: 'handle-dot', cx, cy, r: HANDLE_PX / scale }),
          ]))
        }
      })
    }
    map.layers.ui.append(group)
  }

  private flashInvalid(): void {
    const sel = this.deps.map.layers.ui.querySelectorAll('.editor-overlay .selection')
    sel.forEach((s) => {
      s.classList.remove('invalid')
      void (s as SVGElement).getBoundingClientRect() // restart the animation
      s.classList.add('invalid')
    })
  }

  private renderBars(): void {
    const { store } = this.deps
    this.topBar.replaceChildren(
      el('span', { className: 'editor-title', text: `Editing ${store.house.home.name}` }),
      button('Settings', () => this.deps.openSettings(), 'bar-button'),
      button('Done', () => this.exit(), 'bar-button primary'),
    )
    const sel = this.selection
    const bar = (label: string, hint: string, actions: HTMLButtonElement[]) =>
      this.toolbar.replaceChildren(
        el('div', { className: 'toolbar-label' }, [el('strong', { text: label }), el('span', { text: hint })]),
        el('div', { className: 'toolbar-actions' }, actions),
      )
    if (!sel) {
      const empty = store.house.rooms.length === 0
      bar(empty ? 'Start with a room' : 'Nothing selected', empty ? 'Add rooms, then the things in them.' : 'Tap a room or item to select it.', [
        button('Add room', () => this.addRoom(), 'bar-button primary'),
        ...(empty ? [] : [button('Add item', () => this.addItem(), 'bar-button')]),
      ])
    } else if (sel.kind === 'room') {
      const room = this.room(sel.roomId)
      if (!room) return
      bar(room.name, 'Drag to move · drag corners to resize', [
        button('Add item', () => this.addItem(), 'bar-button primary'),
        button('Rename', () => this.renameRoom(room.id), 'bar-button'),
        button('Add section', () => this.addSection(room.id), 'bar-button'),
        ...(room.cells.length > 1 ? [button('Remove section', () => this.removeSection(room.id, sel.rectIndex), 'bar-button')] : []),
        button('Delete', () => this.deleteRoom(room.id), 'bar-button danger'),
      ])
    } else {
      const item = store.item(sel.itemId)
      if (!item) return
      bar(itemTypeLabel(item.type), `${this.room(item.roomId)?.name ?? ''} · drag to move`, [
        ...(this.deps.editChores ? [button('Chores', () => this.deps.editChores!(item.id), 'bar-button')] : []),
        button('Rotate', () => this.rotateItem(item.id), 'bar-button'),
        button('Delete', () => this.deleteItem(item.id), 'bar-button danger'),
      ])
    }
  }

  private iconPreview(type: string): SVGSVGElement {
    const size = 40
    const item: Item = { id: '', roomId: '', type, skin: `${type}.icon`, cell: { x: 0, y: 0 }, size: { w: 1, h: 1 }, rotation: 0 }
    const art = this.deps.skins.resolve(item)({ item, width: size, height: size, label: itemTypeLabel(type) })
    const root = svg('svg', { class: 'picker-icon', viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, 'aria-hidden': 'true' }, [art])
    root.style.setProperty('--item-stroke', '2')
    return root
  }

  // ---- Helpers -------------------------------------------------------------------------

  private validateSelection(): void {
    const sel = this.selection
    if (sel?.kind === 'room') {
      const room = this.room(sel.roomId)
      if (!room) this.selection = null
      else if (sel.rectIndex >= room.cells.length) this.selection = { ...sel, rectIndex: 0 }
    } else if (sel?.kind === 'item' && !this.deps.store.item(sel.itemId)) {
      this.selection = null
    }
  }

  /** Where new items go: the selected room, the selected item's room, the room in view, or the first. */
  private targetRoom(): Room | undefined {
    const { store } = this.deps
    const sel = this.selection
    if (sel?.kind === 'room') return this.room(sel.roomId)
    if (sel?.kind === 'item') return this.room(store.item(sel.itemId)?.roomId ?? '')
    return roomAt(store.house.rooms, this.viewCenterCell()) ?? store.house.rooms[0]
  }

  private rectIndexAt(roomId: Id, client: Point): number {
    const room = this.room(roomId)
    if (!room) return 0
    const r = this.deps.overlay.getBoundingClientRect()
    const p = screenToContent(this.deps.view(), { x: client.x - r.left, y: client.y - r.top })
    const cx = Math.floor(p.x / CELL)
    const cy = Math.floor(p.y / CELL)
    const i = room.cells.findIndex((c) => cx >= c.x && cx < c.x + c.w && cy >= c.y && cy < c.y + c.h)
    return Math.max(0, i)
  }

  private viewCenterCell(): GridCell {
    const r = this.deps.overlay.getBoundingClientRect()
    const p = screenToContent(this.deps.view(), { x: r.width / 2, y: r.height / 2 })
    return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) }
  }

  private contentPoint(e: PointerEvent): Point {
    const r = this.deps.overlay.getBoundingClientRect()
    return screenToContent(this.deps.view(), { x: e.clientX - r.left, y: e.clientY - r.top })
  }

  private room(id: Id): Room | undefined {
    return this.deps.store.house.rooms.find((r) => r.id === id)
  }

  private confirm(message: string, label: string, action: () => Promise<void>): void {
    const { sheets } = this.deps
    sheets.open({
      title: 'Are you sure?',
      body: confirmBody(message, label, () => {
        sheets.close()
        this.run(action)
      }, () => sheets.close()),
    })
  }

  private run(action: () => Promise<void>): void {
    action().catch((err) => this.failed(err))
  }

  private say(message: string): void {
    this.deps.toaster.show(message)
  }

  private failed(err: unknown): void {
    if (err instanceof LayoutError) return this.say(err.message)
    console.error(err)
    this.say('Something went wrong. Try again.')
  }
}
