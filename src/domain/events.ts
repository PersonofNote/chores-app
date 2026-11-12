/**
 * The append-only event log. Events are only ever created, never edited or deleted:
 * undo is a new 'void' event pointing at the one it cancels. That keeps merging
 * across devices a plain set union keyed by event id.
 */
import type { Clock, IdGenerator } from './time'
import type { Id, ResetEventKind, TaskEvent } from './types'

export interface EventDeps {
  clock: Clock
  newId: IdGenerator
}

export interface RecordOptions {
  /** When it actually happened. Defaults to now; must not be in the future. */
  at?: Date
  note?: string
  by?: Id
}

function record(
  taskId: Id,
  kind: ResetEventKind,
  deps: EventDeps,
  opts: RecordOptions = {},
): TaskEvent {
  const now = deps.clock.now()
  const at = opts.at ?? now
  if (at.getTime() > now.getTime()) {
    throw new RangeError(`Cannot record a '${kind}' in the future (${at.toISOString()})`)
  }
  const event: TaskEvent = {
    id: deps.newId(),
    taskId,
    kind,
    at: at.toISOString(),
    recordedAt: now.toISOString(),
  }
  if (opts.note !== undefined) event.note = opts.note
  if (opts.by !== undefined) event.by = opts.by
  return event
}

/** The chore was done. `opts.at` backdates it ("Done earlier"). */
export const recordDone = (taskId: Id, deps: EventDeps, opts?: RecordOptions) =>
  record(taskId, 'done', deps, opts)

/** The chore was deliberately skipped this cycle. Resets decay, but isn't a completion. */
export const recordSkip = (taskId: Id, deps: EventDeps, opts?: RecordOptions) =>
  record(taskId, 'skip', deps, opts)

/** Onboarding's "last done?" answer. */
export const recordSeed = (taskId: Id, at: Date, deps: EventDeps) =>
  record(taskId, 'seed', deps, { at })

/** Undo: cancels `target`. Voids can't be voided; redo means recording again. */
export function recordVoid(target: TaskEvent, deps: EventDeps, opts: { by?: Id } = {}): TaskEvent {
  if (target.kind === 'void') throw new Error('A void event cannot itself be voided')
  const now = deps.clock.now().toISOString()
  const event: TaskEvent = {
    id: deps.newId(),
    taskId: target.taskId,
    kind: 'void',
    at: now,
    recordedAt: now,
    voids: target.id,
  }
  if (opts.by !== undefined) event.by = opts.by
  return event
}

/** A reset event (done, skip or seed) that hasn't been voided. */
export type EffectiveEvent = TaskEvent & { kind: ResetEventKind }

/**
 * Resolves voids: returns the reset events that still count, in input order.
 * Void events themselves are dropped. Order-independent, so it's safe after a merge.
 */
export function effectiveEvents(events: Iterable<TaskEvent>): EffectiveEvent[] {
  const all = [...events]
  const voided = new Set<Id>()
  for (const e of all) if (e.kind === 'void' && e.voids) voided.add(e.voids)
  return all.filter((e): e is EffectiveEvent => e.kind !== 'void' && !voided.has(e.id))
}

/** Merges logs from two sources (devices, an import) as a set union by event id. */
export function mergeEvents(a: Iterable<TaskEvent>, b: Iterable<TaskEvent>): TaskEvent[] {
  const byId = new Map<Id, TaskEvent>()
  for (const e of a) byId.set(e.id, e)
  for (const e of b) if (!byId.has(e.id)) byId.set(e.id, e)
  return [...byId.values()]
}
