/**
 * What taps and long-presses on the map do (the gesture table in the design doc):
 *
 *   Target              Tap                                   Long-press
 *   item, 1 chore       complete, with Undo toast             details + history
 *   item, 2–5 chores    ring of chores around the item        details + history
 *   item, 6+ chores     list sheet                            details + history
 *   empty floor         floor chores (ring at the tap point)  floor history
 *   room label          room checklist                        –
 *
 * While the ring is open, a tap anywhere on the map just closes it.
 */
import { isFloorItem, type Id, type Item, type TaskEvent } from '../domain'
import type { DecayPalette } from '../render/decay-style'
import type { Point } from '../render/geometry'
import type { MapView } from '../render/map-view'
import type { HouseStore, StoreChange } from '../state/house-store'
import { choreOptions, isDue, itemLabel, type ChoreOption } from './chores'
import { ChoreRing, type RingAnchor } from './components/chore-ring'
import type { SheetHost } from './components/sheet'
import type { Toaster } from './components/toast'
import { relativeDay } from './format'
import type { Gesture } from './gestures'
import { choreList, type ChoreList } from './panels/chore-list'
import { choreMenuBody } from './panels/chore-menu'
import { roomChecklistBody, type ChecklistEntry } from './panels/room-checklist'
import { itemDetailsBody } from './panels/item-details'
import { screenToContent, type ViewState } from './viewport-math'

/** Most chores a ring shows before falling back to a list. */
export const MAX_RING_CHORES = 5
/** Ring radius around a tap point on the floor, in CSS px. */
const FLOOR_RING_RADIUS = 72
/** Space between an item's edge and its ring buttons, in CSS px. */
const RING_GAP = 40
const MIN_RING_RADIUS = 72

export interface MapControllerDeps {
  store: HouseStore
  map: MapView
  /** Element the overlay UI (ring, sheets, toast) lives in; same origin as the map. */
  overlay: HTMLElement
  view: () => ViewState
  palette: () => DecayPalette
  /** Shared with the editor, so only one sheet or toast shows at a time. */
  sheets: SheetHost
  toaster: Toaster
  /** Opens the chore editor for an item. */
  editChores?: (itemId: Id) => void
}

export class MapController {
  private readonly ring: ChoreRing
  private readonly sheets: SheetHost
  private readonly toaster: Toaster
  /** The list sheet currently open, to refresh it after logging. */
  private openList: { itemId: Id; list: ChoreList } | null = null
  private readonly abort = new AbortController()

  constructor(private readonly deps: MapControllerDeps) {
    this.ring = new ChoreRing(deps.overlay, {
      onPick: (taskId) => {
        void this.complete([taskId]).then((ok) => ok && this.ring.markDone(taskId))
      },
      onMenu: (taskId) => this.openChoreMenu(taskId),
    })
    this.sheets = deps.sheets
    this.toaster = deps.toaster

    deps.store.subscribe((change) => this.onStoreChange(change))
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.ring.isOpen && !this.sheets.isOpen) this.ring.close()
      },
      { signal: this.abort.signal },
    )
  }

  destroy(): void {
    this.abort.abort()
    this.dismiss()
  }

  /** Closes any open ring or sheet (e.g. when switching to edit mode). */
  dismiss(): void {
    this.ring.close()
    this.sheets.close()
  }

  handle(g: Gesture): void {
    if (g.type === 'tap' && this.ring.isOpen) {
      this.ring.close()
      return
    }
    if (g.type === 'tap') {
      const t = g.target
      if (!t) return
      if (t.kind === 'item') this.tapItem(t.itemId)
      else if (t.kind === 'floor') this.tapFloor(t.roomId, this.local(g.point))
      else this.openRoomChecklist(t.roomId)
    } else {
      const t = g.target
      this.ring.close()
      if (t.kind === 'item') this.openDetails(t.itemId)
      else if (t.kind === 'floor') {
        const floor = this.floorOf(t.roomId)
        if (floor) this.openDetails(floor.id)
      }
    }
  }

  /** Call when the view pans or zooms, so the ring follows its item. */
  onViewChange(): void {
    this.ring.reposition()
  }

  // ---- Taps --------------------------------------------------------------------

  private tapItem(itemId: Id): void {
    const item = this.deps.store.item(itemId)
    if (!item) return
    this.offerChores(item, this.itemAnchor(itemId))
  }

  private tapFloor(roomId: Id, at: Point): void {
    const floor = this.floorOf(roomId)
    if (!floor) return
    // Pin the ring to the floor spot that was tapped, in content coordinates.
    const spot = screenToContent(this.deps.view(), at)
    this.offerChores(floor, { center: () => this.toScreen(spot), radius: () => FLOOR_RING_RADIUS })
  }

  private offerChores(item: Item, anchor: RingAnchor): void {
    const options = this.options(item.id)
    if (options.length === 0) return this.openDetails(item.id)
    if (options.length === 1) {
      void this.complete([options[0]!.task.id])
      return
    }
    if (options.length <= MAX_RING_CHORES) {
      this.ring.open(item.id, this.label(item), anchor, options)
      return
    }
    this.openChoreList(item, options)
  }

  // ---- Writes --------------------------------------------------------------------

  /** Logs chores as done and offers Undo. Resolves false if saving failed. */
  private async complete(taskIds: Id[], opts: { at?: Date; message?: string } = {}): Promise<boolean> {
    const { store } = this.deps
    try {
      const events = await store.complete(taskIds, opts.at ? { at: opts.at } : {})
      const message =
        opts.message ??
        (opts.at
          ? `${this.taskName(taskIds[0]!)}: logged for ${relativeDay(opts.at, store.now())}`
          : `${this.taskName(taskIds[0]!)}: done`)
      this.offerUndo(message, events)
      return true
    } catch (err) {
      this.saveFailed(err)
      return false
    }
  }

  private async skip(taskId: Id): Promise<void> {
    try {
      const events = await this.deps.store.skip(taskId)
      this.offerUndo(`${this.taskName(taskId)}: skipped`, events)
    } catch (err) {
      this.saveFailed(err)
    }
  }

  private offerUndo(message: string, events: TaskEvent[]): void {
    this.toaster.show(message, {
      label: 'Undo',
      run: () => {
        this.deps.store.undo(events).then(
          () => this.toaster.show('Undone'),
          (err) => this.saveFailed(err),
        )
      },
    })
  }

  private saveFailed(err: unknown): void {
    console.error(err)
    this.toaster.show("Couldn't save that. Try again.")
  }

  // ---- Sheets --------------------------------------------------------------------

  private openChoreList(item: Item, options: ChoreOption[]): void {
    const list = choreList(options, this.deps.store.now(), {
      onPick: (taskId) => void this.complete([taskId]),
      onMenu: (taskId) => this.openChoreMenu(taskId),
    })
    this.openList = { itemId: item.id, list }
    this.sheets.open({
      title: this.label(item),
      subtitle: this.roomName(item.roomId),
      body: list.body,
      onClose: () => (this.openList = null),
    })
  }

  private openChoreMenu(taskId: Id): void {
    const { store } = this.deps
    const task = store.task(taskId)
    const option = task && this.options(task.itemId).find((o) => o.task.id === taskId)
    if (!task || !option) return
    this.sheets.open({
      title: task.name,
      subtitle: this.label(store.item(task.itemId)!),
      body: choreMenuBody(option, store.now(), {
        onDoneEarlier: (at) => {
          this.sheets.close()
          void this.complete([taskId], { at })
        },
        onSkip: () => {
          this.sheets.close()
          void this.skip(taskId)
        },
        onHistory: () => this.openDetails(task.itemId, taskId),
      }),
    })
  }

  private openRoomChecklist(roomId: Id): void {
    const { store } = this.deps
    const entries: ChecklistEntry[] = store
      .itemsInRoom(roomId)
      .flatMap((item) => this.options(item.id).map((option) => ({ option, itemLabel: this.label(item) })))
      .filter((e) => isDue(e.option, store.config))
      .sort((a, b) => (b.option.status?.pressure ?? 0) - (a.option.status?.pressure ?? 0))
    const roomName = this.roomName(roomId)
    this.sheets.open({
      title: roomName,
      subtitle: 'Due chores',
      body: roomChecklistBody(entries, (taskIds) => {
        this.sheets.close()
        void this.complete(taskIds, {
          message: taskIds.length === 1 ? `${this.taskName(taskIds[0]!)}: done` : `${roomName}: ${taskIds.length} chores done`,
        })
      }),
    })
  }

  private openDetails(itemId: Id, filterTaskId?: Id): void {
    const { store } = this.deps
    const item = store.item(itemId)
    if (!item) return
    this.sheets.open({
      title: this.label(item),
      subtitle: this.roomName(item.roomId),
      body: itemDetailsBody(
        {
          item,
          options: this.options(itemId),
          history: store.history(itemId),
          now: store.now(),
          showNotes: !isFloorItem(item),
          ...(filterTaskId ? { filterTaskId } : {}),
        },
        {
          onNotes: (notes) => {
            const current = store.item(itemId)
            if (!current) return
            const { notes: _old, ...rest } = current
            store.updateItem(notes.trim() ? { ...rest, notes } : rest).catch((err) => this.saveFailed(err))
          },
          ...(this.deps.editChores ? { onEditChores: () => this.deps.editChores!(itemId) } : {}),
        },
      ),
    })
  }

  // ---- Keeping open UI current ------------------------------------------------------

  private onStoreChange(change: StoreChange): void {
    if (change.kind !== 'events' && change.kind !== 'tasks') return
    const owner = this.ring.openFor
    // A chore edit can leave too few or too many chores for a ring; just close it then.
    if (owner) {
      const options = this.options(owner)
      if (options.length < 2 || options.length > MAX_RING_CHORES) this.ring.close()
      else this.ring.refresh(options)
    }
    if (this.openList) this.openList.list.refresh(this.options(this.openList.itemId), this.deps.store.now())
  }

  // ---- Helpers ---------------------------------------------------------------------

  private options(itemId: Id): ChoreOption[] {
    const { store } = this.deps
    return choreOptions(store.tasksForItem(itemId), store.status(), this.deps.palette(), store.config)
  }

  private itemAnchor(itemId: Id): RingAnchor {
    return {
      center: () => this.toScreen(this.deps.map.itemCenter(itemId) ?? { x: 0, y: 0 }),
      radius: () => {
        const b = this.deps.map.itemBounds(itemId)
        const half = b ? (Math.max(b.w, b.h) / 2) * this.deps.view().scale : 0
        return Math.max(MIN_RING_RADIUS, half + RING_GAP)
      },
    }
  }

  private toScreen(p: Point): Point {
    const v = this.deps.view()
    return { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty }
  }

  /** Client coordinates → overlay coordinates. */
  private local(p: Point): Point {
    const r = this.deps.overlay.getBoundingClientRect()
    return { x: p.x - r.left, y: p.y - r.top }
  }

  private floorOf(roomId: Id): Item | undefined {
    return this.deps.store.itemsInRoom(roomId).find(isFloorItem)
  }

  private label(item: Item): string {
    return itemLabel(item, this.deps.store.house.rooms)
  }

  private roomName(roomId: Id): string {
    return this.deps.store.house.rooms.find((r) => r.id === roomId)?.name ?? ''
  }

  private taskName(taskId: Id): string {
    return this.deps.store.task(taskId)?.name ?? 'Chore'
  }
}
