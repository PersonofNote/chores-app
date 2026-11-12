/**
 * Persistence boundary. The UI talks to `Repository`; sync (Phase 2) will plug in
 * behind the same interface.
 *
 * Entities are upserted in place. Events are append-only: appending an id that
 * already exists is a no-op (first write wins), which makes re-imports and merges
 * idempotent.
 */
import type { Home, Id, Item, Room, Task, TaskEvent } from '../domain'
import { openDatabase, request, transactionDone } from './idb'
import { DB_NAME, DB_VERSION, STORES, upgrade, type StoreName } from './schema'

/** Everything needed to render and derive decay for one home. */
export interface HouseData {
  home: Home
  rooms: Room[]
  items: Item[]
  tasks: Task[]
  /** Events of this home's current tasks, including voids. */
  events: TaskEvent[]
}

/** The whole database, e.g. for backup. Events of deleted tasks are included. */
export interface Snapshot {
  homes: Home[]
  rooms: Room[]
  items: Item[]
  tasks: Task[]
  events: TaskEvent[]
}

/** A set of writes applied atomically. */
export type Changes = Partial<Snapshot>

export interface Repository {
  listHomes(): Promise<Home[]>
  /** Null if the home doesn't exist. */
  loadHouse(homeId: Id): Promise<HouseData | null>
  /** Upserts entities and appends events in one transaction. */
  save(changes: Changes): Promise<void>
  appendEvents(events: readonly TaskEvent[]): Promise<void>
  /** Deletes a room with its items and their tasks. Events are kept as history. */
  deleteRoom(id: Id): Promise<void>
  /** Deletes an item with its tasks. Events are kept as history. */
  deleteItem(id: Id): Promise<void>
  /** Deletes a task. Its events are kept as history. */
  deleteTask(id: Id): Promise<void>
  exportAll(): Promise<Snapshot>
  close(): void
}

export interface IdbRepositoryOptions {
  name?: string
  /** Injectable for tests (fake-indexeddb). */
  factory?: IDBFactory
}

export async function openIdbRepository(opts: IdbRepositoryOptions = {}): Promise<Repository> {
  const db = await openDatabase({
    name: opts.name ?? DB_NAME,
    version: DB_VERSION,
    upgrade,
    ...(opts.factory ? { factory: opts.factory } : {}),
  })
  return new IdbRepository(db)
}

const ENTITY_STORES = [STORES.homes, STORES.rooms, STORES.items, STORES.tasks] as const
const ALL_STORES: StoreName[] = [...ENTITY_STORES, STORES.events]

class IdbRepository implements Repository {
  constructor(private readonly db: IDBDatabase) {}

  async listHomes(): Promise<Home[]> {
    return request(this.db.transaction(STORES.homes).objectStore(STORES.homes).getAll())
  }

  async loadHouse(homeId: Id): Promise<HouseData | null> {
    const tx = this.db.transaction(ALL_STORES)
    // At household scale, reading whole stores and joining in memory is simpler
    // and as fast as walking indexes per room and item.
    const [home, rooms, items, tasks, events] = await Promise.all([
      request<Home | undefined>(tx.objectStore(STORES.homes).get(homeId)),
      request<Room[]>(tx.objectStore(STORES.rooms).index('homeId').getAll(homeId)),
      request<Item[]>(tx.objectStore(STORES.items).getAll()),
      request<Task[]>(tx.objectStore(STORES.tasks).getAll()),
      request<TaskEvent[]>(tx.objectStore(STORES.events).getAll()),
    ])
    if (!home) return null

    const roomIds = new Set(rooms.map((r) => r.id))
    const homeItems = items.filter((i) => roomIds.has(i.roomId))
    const itemIds = new Set(homeItems.map((i) => i.id))
    const homeTasks = tasks.filter((t) => itemIds.has(t.itemId))
    const taskIds = new Set(homeTasks.map((t) => t.id))
    return {
      home,
      rooms,
      items: homeItems,
      tasks: homeTasks,
      events: events.filter((e) => taskIds.has(e.taskId)),
    }
  }

  save(changes: Changes): Promise<void> {
    return this.write(ALL_STORES, (tx) => {
      for (const store of ENTITY_STORES) {
        for (const entity of changes[store] ?? []) tx.objectStore(store).put(entity)
      }
      const events = tx.objectStore(STORES.events)
      for (const event of changes.events ?? []) {
        const req = events.add(event)
        // Duplicate id: the event is already in the log. Swallow it so the
        // transaction isn't aborted.
        req.onerror = (e) => {
          if (req.error?.name === 'ConstraintError') {
            e.preventDefault()
            e.stopPropagation()
          }
        }
      }
    })
  }

  appendEvents(events: readonly TaskEvent[]): Promise<void> {
    return this.save({ events: [...events] })
  }

  deleteRoom(id: Id): Promise<void> {
    return this.write([STORES.rooms, STORES.items, STORES.tasks], async (tx) => {
      const itemIds = await request(tx.objectStore(STORES.items).index('roomId').getAllKeys(id))
      for (const itemId of itemIds) await this.deleteItemIn(tx, itemId as Id)
      tx.objectStore(STORES.rooms).delete(id)
    })
  }

  deleteItem(id: Id): Promise<void> {
    return this.write([STORES.items, STORES.tasks], (tx) => this.deleteItemIn(tx, id))
  }

  deleteTask(id: Id): Promise<void> {
    return this.write([STORES.tasks], (tx) => {
      tx.objectStore(STORES.tasks).delete(id)
    })
  }

  async exportAll(): Promise<Snapshot> {
    const tx = this.db.transaction(ALL_STORES)
    const [homes, rooms, items, tasks, events] = await Promise.all(
      ALL_STORES.map((s) => request(tx.objectStore(s).getAll())),
    )
    return {
      homes: homes as Home[],
      rooms: rooms as Room[],
      items: items as Item[],
      tasks: tasks as Task[],
      events: events as TaskEvent[],
    }
  }

  close(): void {
    this.db.close()
  }

  /**
   * Runs `fn` in a readwrite transaction and resolves once it commits. If `fn`
   * throws, the transaction is aborted so a partial write never lands.
   */
  private async write(stores: StoreName[], fn: (tx: IDBTransaction) => void | Promise<void>): Promise<void> {
    const tx = this.db.transaction(stores, 'readwrite')
    const done = transactionDone(tx)
    try {
      await fn(tx)
    } catch (err) {
      done.catch(() => {}) // the abort rejection is expected; report `err` instead
      try {
        tx.abort()
      } catch {
        // already finished
      }
      throw err
    }
    await done
  }

  private async deleteItemIn(tx: IDBTransaction, itemId: Id): Promise<void> {
    const tasks = tx.objectStore(STORES.tasks)
    const taskIds = await request(tasks.index('itemId').getAllKeys(itemId))
    for (const taskId of taskIds) tasks.delete(taskId)
    tx.objectStore(STORES.items).delete(itemId)
  }
}
