/**
 * The default library: item type → label, default footprint and default tasks.
 * Data lives in JSON so it can be edited (and later user-extended) without code
 * changes, and is validated at load so a bad edit fails loudly instead of rendering
 * NaN decay.
 */
import defaultLibraryJson from './data/default-library.json'
import type { IdGenerator } from './time'
import type { GridSize, Id, Item, Task } from './types'
import { array, nonEmptyString, object, optional, positiveInt, record, type Validator } from './validate'

export interface LibraryTask {
  name: string
  intervalDays: number
}

export interface LibraryItemType {
  label: string
  size: GridSize
  /** What a new item of this type starts with. */
  tasks: LibraryTask[]
  /** Other chores worth offering when adding one to an item of this type. */
  suggestions?: LibraryTask[]
}

export interface Library {
  version: number
  items: Record<string, LibraryItemType>
}

/** Thrown for library lookups that fail, e.g. an unknown item type. */
export class LibraryError extends Error {
  override name = 'LibraryError'
}

const validateLibraryTask = object({ name: nonEmptyString, intervalDays: positiveInt })

const validateLibrary: Validator<Library> = object({
  version: positiveInt,
  items: record(
    object({
      label: nonEmptyString,
      size: object({ w: positiveInt, h: positiveInt }),
      tasks: array(validateLibraryTask, { nonEmpty: true }),
      suggestions: optional(array(validateLibraryTask)),
    }),
  ),
})

/** Validates untrusted JSON into a Library. Throws ValidationError naming the bad path. */
export function parseLibrary(json: unknown): Library {
  return validateLibrary(json, 'library')
}

export const defaultLibrary: Library = parseLibrary(defaultLibraryJson)

/**
 * Every room has an implicit floor item covering its empty cells. It isn't drawn as
 * an object: its decay shows as a tint over the room instead.
 */
export const FLOOR_TYPE = 'floor'

export const isFloorItem = (item: { type: string }) => item.type === FLOOR_TYPE

/** Display label for an item type, falling back to the raw type key. */
export function itemTypeLabel(type: string, library: Library = defaultLibrary): string {
  return library.items[type]?.label ?? type
}

/** Longest item name, in characters. */
export const MAX_ITEM_NAME = 40

/** An item's name: what you called it, else its type's label. */
export function itemName(item: Pick<Item, 'type' | 'name'>, library: Library = defaultLibrary): string {
  return item.name?.trim() || itemTypeLabel(item.type, library)
}

/** Creates an item's default tasks from its library type. */
export function createDefaultTasks(
  itemId: Id,
  type: string,
  newId: IdGenerator,
  library: Library = defaultLibrary,
): Task[] {
  const entry = library.items[type]
  if (!entry) throw new LibraryError(`Unknown item type '${type}'`)
  return entry.tasks.map((t) => ({
    id: newId(),
    itemId,
    name: t.name,
    intervalDays: t.intervalDays,
    kind: 'interval',
  }))
}

/**
 * Chores to offer when adding one to an item of `type`: its defaults (so a removed
 * one can come back), then its suggestions. Names are unique, ignoring case.
 */
export function choreSuggestions(type: string, library: Library = defaultLibrary): LibraryTask[] {
  const entry = library.items[type]
  if (!entry) return []
  const seen = new Set<string>()
  return [...entry.tasks, ...(entry.suggestions ?? [])].filter((t) => {
    const key = choreNameKey(t.name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Chore names compare case- and space-insensitively ("Wash rags" = "wash  rags "). */
export const choreNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
