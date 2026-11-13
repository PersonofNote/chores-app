/**
 * The loaded house in memory, plus every write the UI makes.
 *
 * Writes go to the repository first and only then into memory, so the UI never
 * shows something that isn't saved. Subscribers hear what changed and react:
 * the map restyles decay, effects play restore animations, and so on. Because
 * every completion path goes through here, they all animate and undo the same way.
 */
import {
  computeHouseStatus,
  DEFAULT_DECAY_CONFIG,
  effectiveEvents,
  recordDone,
  recordSkip,
  recordVoid,
  type DecayConfig,
  type EffectiveEvent,
  type EventDeps,
  type HouseStatus,
  type Id,
  type Item,
  type Task,
  type TaskEvent,
} from '../domain'
import type { HouseData, Repository } from '../storage'

export type StoreChange =
  /** Events were appended (done, skip, void...). */
  | { kind: 'events'; events: readonly TaskEvent[] }
  /** An item's details changed without affecting the map (e.g. notes). */
  | { kind: 'item'; item: Item }

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

  async updateItem(item: Item): Promise<void> {
    const index = this.data.items.findIndex((i) => i.id === item.id)
    if (index < 0) throw new Error(`Unknown item ${item.id}`)
    await this.repo.save({ items: [item] })
    this.data.items[index] = item
    this.emit({ kind: 'item', item })
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
