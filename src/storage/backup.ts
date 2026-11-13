/**
 * JSON backup: export the whole database, import by merging.
 *
 * Import is a merge, never a wipe: entities are upserted (the file wins) and events
 * are a set union by id. Importing the same file twice is a no-op, and importing an
 * older backup can't lose events logged since.
 */
import {
  array,
  isoDateTime,
  literal,
  object,
  positiveInt,
  validateHome,
  validateItem,
  validateRoom,
  validateTask,
  validateTaskEvent,
  ValidationError,
  type Clock,
} from '../domain'
import type { HouseData, Repository, Snapshot } from './repository'

export const BACKUP_FORMAT = 'house-monitor-backup'
export const BACKUP_VERSION = 1

export interface Backup extends Snapshot {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
}

export async function createBackup(repo: Repository, clock: Clock): Promise<Backup> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: clock.now().toISOString(),
    ...(await repo.exportAll()),
  }
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

/** e.g. `house-monitor-backup-2026-11-12.json` */
export function backupFileName(exportedAt: Date): string {
  return `${BACKUP_FORMAT}-${exportedAt.toISOString().slice(0, 10)}.json`
}

const validateHeader = object({
  format: literal(BACKUP_FORMAT),
  version: positiveInt,
  exportedAt: isoDateTime,
})

const validateBody = object({
  homes: array(validateHome),
  rooms: array(validateRoom),
  items: array(validateItem),
  tasks: array(validateTask),
  events: array(validateTaskEvent),
})

/** Parses and validates backup file text. Throws ValidationError on anything wrong. */
export function parseBackup(text: string): Backup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ValidationError('backup: not valid JSON')
  }
  const header = validateHeader(json, 'backup')
  if (header.version > BACKUP_VERSION) {
    throw new ValidationError(
      `backup: made by a newer version of the app (format v${header.version}, this app reads up to v${BACKUP_VERSION})`,
    )
  }
  // Older formats would be upgraded here, once there are any.
  const backup: Backup = { ...header, format: BACKUP_FORMAT, ...validateBody(json, 'backup') }
  checkIntegrity(backup)
  return backup
}

/**
 * A backup must be self-consistent: unique ids, and every room, item and task
 * points at a parent in the same file. Events may reference deleted tasks (history).
 */
function checkIntegrity(b: Snapshot): void {
  const ids = (name: string, list: readonly { id: string }[]) => {
    const set = new Set<string>()
    for (const { id } of list) {
      if (set.has(id)) throw new ValidationError(`backup.${name}: duplicate id '${id}'`)
      set.add(id)
    }
    return set
  }
  const parents = <T extends { id: string }>(
    name: string,
    list: readonly T[],
    key: keyof T & string,
    parentIds: Set<string>,
  ) => {
    for (const x of list) {
      if (!parentIds.has(x[key] as string)) {
        throw new ValidationError(`backup.${name}: '${x.id}' references missing ${key} '${String(x[key])}'`)
      }
    }
  }
  const homeIds = ids('homes', b.homes)
  const roomIds = ids('rooms', b.rooms)
  const itemIds = ids('items', b.items)
  ids('tasks', b.tasks)
  ids('events', b.events)
  parents('rooms', b.rooms, 'homeId', homeIds)
  parents('items', b.items, 'roomId', roomIds)
  parents('tasks', b.tasks, 'itemId', itemIds)
}

export interface ImportSummary {
  homes: number
  rooms: number
  items: number
  tasks: number
  events: { total: number; added: number }
}

/** Merges a parsed backup into the repository, atomically. */
export async function importBackup(repo: Repository, backup: Backup): Promise<ImportSummary> {
  const existing = new Set((await repo.exportAll()).events.map((e) => e.id))
  const { homes, rooms, items, tasks, events } = backup
  await repo.save({ homes, rooms, items, tasks, events })
  return {
    homes: homes.length,
    rooms: rooms.length,
    items: items.length,
    tasks: tasks.length,
    events: { total: events.length, added: events.filter((e) => !existing.has(e.id)).length },
  }
}

/**
 * First run on a new device: imports a backup into an empty database and loads the
 * house in it. Throws a ValidationError if the backup has no house.
 */
export async function restoreHouse(repo: Repository, backup: Backup): Promise<HouseData> {
  if (backup.homes.length === 0) throw new ValidationError('backup: there’s no house in it')
  await importBackup(repo, backup)
  const house = await repo.loadHouse(backup.homes[0]!.id)
  if (!house) throw new ValidationError('backup: there’s no house in it')
  return house
}
