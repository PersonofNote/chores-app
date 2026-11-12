/**
 * The default library: item type → label, default footprint and default tasks.
 * Data lives in JSON so it can be edited (and later user-extended) without code
 * changes, and is validated at load so a bad edit fails loudly instead of rendering
 * NaN decay.
 */
import defaultLibraryJson from './data/default-library.json'
import type { IdGenerator } from './time'
import type { GridSize, Id, Task } from './types'
import { array, nonEmptyString, object, positiveInt, record, type Validator } from './validate'

export interface LibraryTask {
  name: string
  intervalDays: number
}

export interface LibraryItemType {
  label: string
  size: GridSize
  tasks: LibraryTask[]
}

export interface Library {
  version: number
  items: Record<string, LibraryItemType>
}

/** Thrown for library lookups that fail, e.g. an unknown item type. */
export class LibraryError extends Error {
  override name = 'LibraryError'
}

const validateLibrary: Validator<Library> = object({
  version: positiveInt,
  items: record(
    object({
      label: nonEmptyString,
      size: object({ w: positiveInt, h: positiveInt }),
      tasks: array(object({ name: nonEmptyString, intervalDays: positiveInt }), { nonEmpty: true }),
    }),
  ),
})

/** Validates untrusted JSON into a Library. Throws ValidationError naming the bad path. */
export function parseLibrary(json: unknown): Library {
  return validateLibrary(json, 'library')
}

export const defaultLibrary: Library = parseLibrary(defaultLibraryJson)

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
