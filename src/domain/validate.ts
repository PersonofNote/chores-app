/**
 * Tiny runtime validators for untrusted data (imported backups, the task library,
 * and later sync payloads). Each validator returns a typed value or throws a
 * ValidationError naming the offending path, e.g. `backup.items[3].cell.x`.
 *
 * Deliberately minimal: a few combinators, no schema library.
 */
import type { GridCell, GridRect, GridSize, Home, Item, Room, Task, TaskEvent } from './types'

export class ValidationError extends Error {
  override name = 'ValidationError'
}

export type Validator<T> = (value: unknown, path: string) => T

/** Marks an object field as optional: absent (or undefined) keys are omitted from the output. */
export type OptionalValidator<T> = Validator<T | undefined> & { readonly optional: true }

export type Infer<V> = V extends Validator<infer T> ? T : never

function fail(path: string, expected: string): never {
  throw new ValidationError(`${path}: expected ${expected}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const string: Validator<string> = (v, path) =>
  typeof v === 'string' ? v : fail(path, 'a string')

export const nonEmptyString: Validator<string> = (v, path) =>
  typeof v === 'string' && v !== '' ? v : fail(path, 'a non-empty string')

export const int: Validator<number> = (v, path) =>
  Number.isInteger(v) ? (v as number) : fail(path, 'an integer')

export const nonNegativeInt: Validator<number> = (v, path) =>
  Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fail(path, 'a non-negative integer')

export const positiveInt: Validator<number> = (v, path) =>
  Number.isInteger(v) && (v as number) > 0 ? (v as number) : fail(path, 'a positive integer')

export const isoDateTime: Validator<string> = (v, path) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fail(path, 'an ISO date-time string')

export function literal<const L extends readonly (string | number)[]>(...values: L): Validator<L[number]> {
  return (v, path) =>
    values.includes(v as L[number]) ? (v as L[number]) : fail(path, `one of ${values.map((x) => JSON.stringify(x)).join(', ')}`)
}

export function optional<T>(inner: Validator<T>): OptionalValidator<T> {
  const v: Validator<T | undefined> = (value, path) => (value === undefined ? undefined : inner(value, path))
  return Object.assign(v, { optional: true as const })
}

export function array<T>(inner: Validator<T>, opts: { nonEmpty?: boolean } = {}): Validator<T[]> {
  return (v, path) => {
    if (!Array.isArray(v)) fail(path, 'an array')
    if (opts.nonEmpty && v.length === 0) fail(path, 'a non-empty array')
    return v.map((x, i) => inner(x, `${path}[${i}]`))
  }
}

/** A string-keyed map whose values all match `inner`. */
export function record<T>(inner: Validator<T>): Validator<Record<string, T>> {
  return (v, path) => {
    if (!isRecord(v)) fail(path, 'an object')
    const out: Record<string, T> = {}
    for (const [k, x] of Object.entries(v)) out[k] = inner(x, `${path}.${k}`)
    return out
  }
}

type Shape = Record<string, Validator<unknown>>
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends { optional: true } ? K : never }[keyof S]
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>
type Simplify<T> = { [K in keyof T]: T[K] } & {}
export type ObjectOf<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined> }
>

/** An object with known fields. Unknown fields are dropped, so stray data never reaches storage. */
export function object<S extends Shape>(shape: S): Validator<ObjectOf<S>> {
  return (v, path) => {
    if (!isRecord(v)) fail(path, 'an object')
    const out: Record<string, unknown> = {}
    for (const [key, validate] of Object.entries(shape)) {
      const value = validate(v[key], `${path}.${key}`)
      if (value !== undefined) out[key] = value
    }
    return out as ObjectOf<S>
  }
}

// ---- Domain entities -------------------------------------------------------------

const gridCell: Validator<GridCell> = object({ x: nonNegativeInt, y: nonNegativeInt })
const gridSize: Validator<GridSize> = object({ w: positiveInt, h: positiveInt })
const gridRect: Validator<GridRect> = object({ x: nonNegativeInt, y: nonNegativeInt, w: positiveInt, h: positiveInt })

export const validateHome: Validator<Home> = object({ id: nonEmptyString, name: string, gridSize })

export const validateRoom: Validator<Room> = object({
  id: nonEmptyString,
  homeId: nonEmptyString,
  name: string,
  cells: array(gridRect, { nonEmpty: true }),
})

export const validateItem: Validator<Item> = object({
  id: nonEmptyString,
  roomId: nonEmptyString,
  type: nonEmptyString,
  skin: nonEmptyString,
  tint: optional(string),
  cell: gridCell,
  size: gridSize,
  rotation: literal(0, 90, 180, 270),
  notes: optional(string),
})

export const validateTask: Validator<Task> = object({
  id: nonEmptyString,
  itemId: nonEmptyString,
  name: nonEmptyString,
  intervalDays: positiveInt,
  kind: literal('interval'),
  bundleId: optional(string),
})

const validateEventShape = object({
  id: nonEmptyString,
  taskId: nonEmptyString,
  kind: literal('done', 'skip', 'seed', 'void'),
  at: isoDateTime,
  recordedAt: isoDateTime,
  by: optional(nonEmptyString),
  voids: optional(nonEmptyString),
  note: optional(string),
})

export const validateTaskEvent: Validator<TaskEvent> = (v, path) => {
  const e = validateEventShape(v, path)
  if (e.kind === 'void' && e.voids === undefined) fail(`${path}.voids`, 'an event id on a void event')
  if (e.kind !== 'void' && e.voids !== undefined) fail(`${path}.voids`, 'no value on a non-void event')
  return e
}
