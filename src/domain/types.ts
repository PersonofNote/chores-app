/**
 * Domain model. Hierarchy: Home → Room → Item → Task.
 *
 * Entities are mutable records edited in place. TaskEvents are an append-only log
 * and the single source of truth for decay: no decay state is ever stored.
 *
 * Timestamps are ISO-8601 strings in data, so they serialize and sync unchanged.
 */

export type Id = string
export type IsoDateTime = string

export interface GridCell {
  x: number
  y: number
}

export interface GridSize {
  w: number
  h: number
}

export interface GridRect extends GridCell, GridSize {}

export type Rotation = 0 | 90 | 180 | 270

export interface Home {
  id: Id
  name: string
  gridSize: GridSize
}

export interface Room {
  id: Id
  homeId: Id
  name: string
  /** One or more rectangles, so L-shapes work. */
  cells: GridRect[]
}

export interface Item {
  id: Id
  roomId: Id
  /** Library key, e.g. 'bed', 'fridge', 'hvac-filter'. Drives default tasks. */
  type: string
  /** What you call it ("Armoire", "Left nightstand"). Absent: the type's label. */
  name?: string
  /** Renderer key, e.g. 'bed.icon' now, 'bed.wood-queen' later. */
  skin: string
  /** Reserved for the sprite phase; color carries decay in the MVP. */
  tint?: string
  cell: GridCell
  size: GridSize
  rotation: Rotation
  /** Model number, filter size, warranty... */
  notes?: string
}

export type TaskKind = 'interval' // 'calendar' | 'seasonal' later

export interface Task {
  id: Id
  itemId: Id
  name: string
  intervalDays: number
  kind: TaskKind
  /** Seasonal bundles, Phase 3. */
  bundleId?: string
}

/** Event kinds that reset a task's decay clock. */
export type ResetEventKind = 'done' | 'skip' | 'seed'
export type TaskEventKind = ResetEventKind | 'void'

export interface TaskEvent {
  /** UUID, so merging across devices is a set union. */
  id: Id
  taskId: Id
  kind: TaskEventKind
  /** When it happened. Backdatable via "Done earlier". */
  at: IsoDateTime
  /** When it was logged. Separates honest backdating from gaming. */
  recordedAt: IsoDateTime
  /** User id, once households exist. */
  by?: Id
  /** On a 'void' (undo): id of the event it cancels. */
  voids?: Id
  note?: string
}

/** A span during which decay is frozen (vacation mode). `end` absent = still paused. */
export interface PauseWindow {
  start: IsoDateTime
  end?: IsoDateTime
}
