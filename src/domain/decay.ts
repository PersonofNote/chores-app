/**
 * Decay engine. Everything here is derived from the event log at a given `now`;
 * nothing is stored.
 *
 *   lastReset = max(at) over a task's effective done/skip/seed events
 *   pressure  = (elapsed days − paused days) / intervalDays
 *
 * An item shows its worst task, and a room shows its worst item.
 */
import { effectiveEvents } from './events'
import { MS_PER_DAY, toMs } from './time'
import type { Id, Item, PauseWindow, Task, TaskEvent } from './types'

export const STAGES = ['fresh', 'fine', 'due-soon', 'overdue', 'neglected'] as const
export type Stage = (typeof STAGES)[number]

export interface DecayConfig {
  /** Lower pressure bound of each stage after 'fresh'. Must be ascending. */
  thresholds: { fine: number; dueSoon: number; overdue: number; neglected: number }
}

/** Starting guesses from the design doc; tune after living with Phase 0. */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  thresholds: { fine: 0.5, dueSoon: 0.8, overdue: 1.0, neglected: 1.75 },
}

export function stageFor(pressure: number, config: DecayConfig = DEFAULT_DECAY_CONFIG): Stage {
  const t = config.thresholds
  if (pressure >= t.neglected) return 'neglected'
  if (pressure >= t.overdue) return 'overdue'
  if (pressure >= t.dueSoon) return 'due-soon'
  if (pressure >= t.fine) return 'fine'
  return 'fresh'
}

export interface DecayContext {
  now: Date
  pauses?: readonly PauseWindow[]
  config?: DecayConfig
}

/** Decay of one task, or of the worst task under an item or room. */
export interface DecayStatus {
  /** The task this status comes from (for rollups: the worst one). */
  taskId: Id
  lastReset: Date
  /** Unpaused days since lastReset. Never negative. */
  elapsedDays: number
  /** Uncapped; the visual cap is the 'neglected' stage. */
  pressure: number
  stage: Stage
}

/** Latest effective reset time (ms) per task, in one pass over the log. */
export function lastResetByTask(events: Iterable<TaskEvent>): Map<Id, number> {
  const latest = new Map<Id, number>()
  for (const e of effectiveEvents(events)) {
    const at = toMs(e.at)
    const prev = latest.get(e.taskId)
    if (prev === undefined || at > prev) latest.set(e.taskId, at)
  }
  return latest
}

/** Total milliseconds of [fromMs, untilMs] covered by pause windows. Overlaps count once. */
export function pausedMs(fromMs: number, untilMs: number, pauses: readonly PauseWindow[]): number {
  const clipped = pauses
    .map((p) => ({
      start: Math.max(toMs(p.start), fromMs),
      end: Math.min(p.end === undefined ? untilMs : toMs(p.end), untilMs),
    }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start)

  let total = 0
  let cursor = -Infinity
  for (const p of clipped) {
    const start = Math.max(p.start, cursor)
    if (p.end > start) total += p.end - start
    cursor = Math.max(cursor, p.end)
  }
  return total
}

/** Status of one task given its last reset, or null if it has never been reset. */
export function taskStatus(
  task: Task,
  lastResetMs: number | undefined,
  ctx: DecayContext,
): DecayStatus | null {
  if (lastResetMs === undefined) return null
  if (!(task.intervalDays > 0)) {
    throw new RangeError(`Task ${task.id} has a non-positive interval (${task.intervalDays})`)
  }
  const nowMs = ctx.now.getTime()
  const rawMs = Math.max(0, nowMs - lastResetMs)
  const activeMs = rawMs - pausedMs(lastResetMs, nowMs, ctx.pauses ?? [])
  const elapsedDays = Math.max(0, activeMs) / MS_PER_DAY
  const pressure = elapsedDays / task.intervalDays
  return {
    taskId: task.id,
    lastReset: new Date(lastResetMs),
    elapsedDays,
    pressure,
    stage: stageFor(pressure, ctx.config),
  }
}

/** The highest-pressure status, ignoring unknowns. Null if none are known. */
export function worstOf(statuses: Iterable<DecayStatus | null | undefined>): DecayStatus | null {
  let worst: DecayStatus | null = null
  for (const s of statuses) if (s && (!worst || s.pressure > worst.pressure)) worst = s
  return worst
}

export interface HouseSnapshot {
  items: readonly Pick<Item, 'id' | 'roomId'>[]
  tasks: readonly Task[]
  events: Iterable<TaskEvent>
}

export interface HouseStatus {
  /** Every task id is present; null = never reset, so decay is unknown. */
  tasks: Map<Id, DecayStatus | null>
  /** Worst task per item; null if the item has no known task. */
  items: Map<Id, DecayStatus | null>
  /** Worst item per room; only rooms that contain items appear. */
  rooms: Map<Id, DecayStatus | null>
}

/** Derives decay for the whole house at `ctx.now`. */
export function computeHouseStatus(house: HouseSnapshot, ctx: DecayContext): HouseStatus {
  const resets = lastResetByTask(house.events)

  const tasks = new Map<Id, DecayStatus | null>()
  const tasksByItem = new Map<Id, (DecayStatus | null)[]>()
  for (const task of house.tasks) {
    const status = taskStatus(task, resets.get(task.id), ctx)
    tasks.set(task.id, status)
    const bucket = tasksByItem.get(task.itemId) ?? []
    bucket.push(status)
    tasksByItem.set(task.itemId, bucket)
  }

  const items = new Map<Id, DecayStatus | null>()
  const itemsByRoom = new Map<Id, (DecayStatus | null)[]>()
  for (const item of house.items) {
    const status = worstOf(tasksByItem.get(item.id) ?? [])
    items.set(item.id, status)
    const bucket = itemsByRoom.get(item.roomId) ?? []
    bucket.push(status)
    itemsByRoom.set(item.roomId, bucket)
  }

  const rooms = new Map<Id, DecayStatus | null>()
  for (const [roomId, statuses] of itemsByRoom) rooms.set(roomId, worstOf(statuses))

  return { tasks, items, rooms }
}
