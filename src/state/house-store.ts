/**
 * The loaded house in memory, plus every write the UI makes.
 *
 * Writes go to the repository first and only then into memory, so the UI never
 * shows something that isn't saved. Subscribers hear what changed and react:
 * the map restyles decay, effects play restore animations, and so on. Because
 * every completion path goes through here, they all animate and undo the same way.
 */
import {
  checkChore,
  checkItem,
  checkRoom,
  computeHouseStatus,
  DEFAULT_DECAY_CONFIG,
  describeChoreProblem,
  describeProblem,
  effectiveEvents,
  isFloorItem,
  MAX_ITEM_NAME,
  recordDone,
  recordSkip,
  recordVoid,
  type ChoreProblem,
  type DecayConfig,
  type EffectiveEvent,
  type EventDeps,
  type Home,
  type HouseStatus,
  type Id,
  type Item,
  type LayoutProblem,
  type Room,
  type Task,
  type TaskEvent,
  tidyChoreName,
  validateTask,
} from '../domain'
import type { HouseData, Repository } from '../storage'

export type StoreChange =
  /** Events were appended (done, skip, void...). */
  | { kind: 'events'; events: readonly TaskEvent[] }
  /** An item's details changed without affecting the map (e.g. notes). */
  | { kind: 'item'; item: Item }
  /** Home, rooms or items changed shape: rebuild the map. */
  | { kind: 'layout' }
  /** An item's chores were added, edited or removed: decay may have changed, the map's shape hasn't. */
  | { kind: 'tasks'; itemId: Id }

/** Thrown when a layout write would break a layout rule (see domain/layout.ts). */
export class LayoutError extends Error {
  override name = 'LayoutError'
  constructor(readonly problem: LayoutProblem) {
    super(describeProblem(problem))
  }
}

/** Thrown when a chore edit breaks a chore rule (see domain/tasks.ts). */
export class ChoreError extends Error {
  override name = 'ChoreError'
  constructor(readonly problem: ChoreProblem) {
    super(describeChoreProblem(problem))
  }
}

export type StoreListener = (change: StoreChange) => void

export interface HistoryEntry {
  event: EffectiveEvent
  task: Task
}

export class HouseStore {
  private readonly listeners = new Set<StoreListener>()

  constructor(
    private readonly repo: Repository,
    private readonly data: HouseData,
    private readonly deps: EventDeps,
    readonly config: DecayConfig = DEFAULT_DECAY_CONFIG,
  ) {}

  get house(): Readonly<HouseData> {
    return this.data
  }

  now(): Date {
    return this.deps.clock.now()
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  status(now: Date = this.now()): HouseStatus {
    return computeHouseStatus(this.data, { now, config: this.config })
  }

  item(id: Id): Item | undefined {
    return this.data.items.find((i) => i.id === id)
  }

  task(id: Id): Task | undefined {
    return this.data.tasks.find((t) => t.id === id)
  }

  tasksForItem(itemId: Id): Task[] {
    return this.data.tasks.filter((t) => t.itemId === itemId)
  }

  itemsInRoom(roomId: Id): Item[] {
    return this.data.items.filter((i) => i.roomId === roomId)
  }

  /** Logs each task as done. `at` backdates them ("Done earlier"). */
  complete(taskIds: readonly Id[], opts: { at?: Date } = {}): Promise<TaskEvent[]> {
    return this.append(taskIds.map((id) => recordDone(id, this.deps, opts)))
  }

  skip(taskId: Id): Promise<TaskEvent[]> {
    return this.append([recordSkip(taskId, this.deps)])
  }

  /** Voids the given events. Voids and already-voided events are ignored. */
  undo(events: readonly TaskEvent[]): Promise<TaskEvent[]> {
    const live = new Set(effectiveEvents(this.data.events).map((e) => e.id))
    return this.append(events.filter((e) => live.has(e.id)).map((e) => recordVoid(e, this.deps)))
  }

  /**
   * Names an item ("Armoire"); an empty name goes back to its type's label. A layout
   * change, since the map's labels show it.
   */
  async renameItem(itemId: Id, name: string): Promise<Item> {
    const index = this.data.items.findIndex((i) => i.id === itemId)
    if (index < 0) throw new Error(`Unknown item ${itemId}`)
    const tidy = name.trim().replace(/\s+/g, ' ').slice(0, MAX_ITEM_NAME)
    const { name: _old, ...rest } = this.data.items[index]!
    const item: Item = tidy ? { ...rest, name: tidy } : rest
    await this.repo.save({ items: [item] })
    this.data.items[index] = item
    this.emit({ kind: 'layout' })
    return item
  }

  async updateItem(item: Item): Promise<void> {
    const index = this.data.items.findIndex((i) => i.id === item.id)
    if (index < 0) throw new Error(`Unknown item ${item.id}`)
    await this.repo.save({ items: [item] })
    this.data.items[index] = item
    this.emit({ kind: 'item', item })
  }

  // ---- Chores --------------------------------------------------------------------
  // Each item has its own chores; these change them. Names are tidied, and every op
  // checks the chore rules before saving.

  /**
   * Adds a chore to an existing item, with its "Last done?" seed (if any) in the same
   * write, so the new chore never shows as unknown.
   */
  async addTask(task: Task, seed: readonly TaskEvent[] = []): Promise<Task> {
    if (!this.item(task.itemId)) throw new Error(`Unknown item ${task.itemId}`)
    if (this.task(task.id)) throw new Error(`Task ${task.id} already exists`)
    if (seed.some((e) => e.taskId !== task.id)) throw new Error('Seed events must be for the new task')
    const tidy = this.checkedTask(task)
    await this.repo.save({ tasks: [tidy], events: [...seed] })
    this.data.tasks.push(tidy)
    this.data.events.push(...seed)
    this.emit({ kind: 'tasks', itemId: tidy.itemId })
    return tidy
  }

  /** Renames a chore or changes how often it's due. Its history is kept. */
  async updateTask(task: Task): Promise<Task> {
    const index = this.data.tasks.findIndex((t) => t.id === task.id)
    const current = this.data.tasks[index]
    if (!current) throw new Error(`Unknown task ${task.id}`)
    if (current.itemId !== task.itemId) throw new Error('A chore can’t move to another item')
    const tidy = this.checkedTask(task)
    await this.repo.save({ tasks: [tidy] })
    this.data.tasks[index] = tidy
    this.emit({ kind: 'tasks', itemId: tidy.itemId })
    return tidy
  }

  /** Removes a chore. Its events stay in the log (and in backups) as history. */
  async deleteTask(taskId: Id): Promise<void> {
    const task = this.task(taskId)
    if (!task) return
    await this.repo.deleteTask(taskId)
    replaceAll(this.data.tasks, this.data.tasks.filter((t) => t.id !== taskId))
    this.emit({ kind: 'tasks', itemId: task.itemId })
  }

  private checkedTask(task: Task): Task {
    const tidy = { ...task, name: tidyChoreName(task.name) }
    // Chore rules first, so the user gets a readable reason; then the full shape check.
    const problem = checkChore(tidy, this.tasksForItem(task.itemId))
    if (problem) throw new ChoreError(problem)
    return validateTask(tidy, 'task')
  }

  // ---- Layout -------------------------------------------------------------------
  // Each op validates the resulting house before saving, so nothing invalid is stored.

  /** Adds a room with its floor item and the floor's chores. */
  async addRoom(room: Room, floor: Item, floorTasks: readonly Task[]): Promise<void> {
    this.assertRooms([room], this.data.items)
    await this.repo.save({ rooms: [room], items: [floor], tasks: [...floorTasks] })
    this.data.rooms.push(room)
    this.data.items.push(floor)
    this.data.tasks.push(...floorTasks)
    this.emit({ kind: 'layout' })
  }

  /**
   * Saves edited rooms together with any items that moved with them (moving a room
   * carries its items), atomically.
   */
  async updateLayout(rooms: readonly Room[], items: readonly Item[] = []): Promise<void> {
    const nextItems = this.data.items.map((i) => items.find((x) => x.id === i.id) ?? i)
    this.assertRooms(rooms, nextItems)
    const nextRooms = this.data.rooms.map((r) => rooms.find((x) => x.id === r.id) ?? r)
    for (const item of items) this.assertItem(item, nextRooms, nextItems)
    await this.repo.save({ rooms: [...rooms], items: [...items] })
    replaceAll(this.data.rooms, nextRooms)
    replaceAll(this.data.items, nextItems)
    this.emit({ kind: 'layout' })
  }

  async deleteRoom(roomId: Id): Promise<void> {
    await this.repo.deleteRoom(roomId)
    const itemIds = new Set(this.itemsInRoom(roomId).map((i) => i.id))
    replaceAll(this.data.rooms, this.data.rooms.filter((r) => r.id !== roomId))
    replaceAll(this.data.items, this.data.items.filter((i) => !itemIds.has(i.id)))
    replaceAll(this.data.tasks, this.data.tasks.filter((t) => !itemIds.has(t.itemId)))
    this.emit({ kind: 'layout' })
  }

  /** Adds an item with its chores. Its `roomId` is set from where it lands. */
  async addItem(item: Item, tasks: readonly Task[]): Promise<Item> {
    const placed = this.assertItem(item, this.data.rooms, [...this.data.items, item])
    await this.repo.save({ items: [placed], tasks: [...tasks] })
    this.data.items.push(placed)
    this.data.tasks.push(...tasks)
    this.emit({ kind: 'layout' })
    return placed
  }

  /** Moves or rotates an item; its room follows where it lands. */
  async placeItem(item: Item): Promise<Item> {
    const others = this.data.items.map((i) => (i.id === item.id ? item : i))
    const placed = this.assertItem(item, this.data.rooms, others)
    await this.updateLayout([], [placed])
    return placed
  }

  async deleteItem(itemId: Id): Promise<void> {
    await this.repo.deleteItem(itemId)
    replaceAll(this.data.items, this.data.items.filter((i) => i.id !== itemId))
    replaceAll(this.data.tasks, this.data.tasks.filter((t) => t.itemId !== itemId))
    this.emit({ kind: 'layout' })
  }

  async updateHome(home: Home): Promise<void> {
    for (const room of this.data.rooms) {
      const problem = checkRoom(home, this.data.rooms, this.data.items, room)
      if (problem) throw new LayoutError(problem)
    }
    await this.repo.save({ homes: [home] })
    this.data.home = home
    this.emit({ kind: 'layout' })
  }

  /** Onboarding "last done?" answers. Silent: seeds aren't completions. */
  seed(events: readonly TaskEvent[]): Promise<TaskEvent[]> {
    return this.append([...events])
  }

  private assertRooms(rooms: readonly Room[], items: readonly Item[]): void {
    const all = [...this.data.rooms.filter((r) => !rooms.some((x) => x.id === r.id)), ...rooms]
    for (const room of rooms) {
      const problem = checkRoom(this.data.home, all, items, room)
      if (problem) throw new LayoutError(problem)
    }
  }

  /** Validates an item's spot and returns it with `roomId` set to where it landed. */
  private assertItem(item: Item, rooms: readonly Room[], items: readonly Item[]): Item {
    if (isFloorItem(item)) return item
    const placed = checkItem(this.data.home, rooms, items, item)
    if (!placed.ok) throw new LayoutError(placed.problem)
    return placed.roomId === item.roomId ? item : { ...item, roomId: placed.roomId }
  }

  /** An item's effective events (voided ones hidden), newest first. */
  history(itemId: Id): HistoryEntry[] {
    const tasks = new Map(this.tasksForItem(itemId).map((t) => [t.id, t]))
    return effectiveEvents(this.data.events)
      .filter((e) => tasks.has(e.taskId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((event) => ({ event, task: tasks.get(event.taskId)! }))
  }

  private async append(events: TaskEvent[]): Promise<TaskEvent[]> {
    if (events.length === 0) return events
    await this.repo.appendEvents(events)
    this.data.events.push(...events)
    this.emit({ kind: 'events', events })
    return events
  }

  private emit(change: StoreChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change)
      } catch (err) {
        // One broken subscriber (say, an animation) must not stop the others.
        console.error('Store listener failed', err)
      }
    }
  }
}

function replaceAll<T>(target: T[], next: readonly T[]): void {
  target.splice(0, target.length, ...next)
}
