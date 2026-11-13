import { afterEach, describe, expect, it } from 'vitest'
import { fixedClock, recordDone, ValidationError } from '../domain'
import { BACKUP_VERSION, backupFileName, createBackup, importBackup, parseBackup, restoreHouse, serializeBackup } from './backup'
import type { Repository } from './repository'
import { openTestRepository, smallHouse } from './test-fixtures'

const repos: Repository[] = []
afterEach(() => repos.splice(0).forEach((r) => r.close()))
async function newRepo() {
  const r = await openTestRepository()
  repos.push(r)
  return r
}

async function seededRepo() {
  const repo = await newRepo()
  const h = smallHouse()
  await repo.save({ homes: [h.home], rooms: h.rooms, items: h.items, tasks: h.tasks, events: h.events })
  return { repo, h }
}

describe('backup round trip', () => {
  it('restores everything into an empty database', async () => {
    const { repo, h } = await seededRepo()
    const text = serializeBackup(await createBackup(repo, h.clock))

    const target = await newRepo()
    const summary = await importBackup(target, parseBackup(text))

    expect(await target.exportAll()).toEqual(await repo.exportAll())
    expect(summary.events).toEqual({ total: h.events.length, added: h.events.length })
  })

  it('merges: re-importing is a no-op and newer local events survive an older backup', async () => {
    const { repo, h } = await seededRepo()
    const backup = parseBackup(serializeBackup(await createBackup(repo, h.clock)))

    const later = recordDone(h.tasks[0]!.id, h)
    await repo.appendEvents([later])

    const summary = await importBackup(repo, backup)
    expect(summary.events.added).toBe(0)
    const all = await repo.exportAll()
    expect(all.events).toHaveLength(h.events.length + 1)
    expect(all.events.some((e) => e.id === later.id)).toBe(true)
  })

  it('restores a house onto a new device and loads it', async () => {
    const { repo, h } = await seededRepo()
    const backup = parseBackup(serializeBackup(await createBackup(repo, h.clock)))
    const target = await newRepo()
    const house = await restoreHouse(target, backup)
    expect(house).toEqual(await repo.loadHouse(h.home.id))
  })

  it('refuses to restore a backup with no house in it', async () => {
    const empty = await newRepo()
    const backup = parseBackup(serializeBackup(await createBackup(empty, fixedClock('2026-03-01T09:00:00.000Z'))))
    await expect(restoreHouse(await newRepo(), backup)).rejects.toThrow(ValidationError)
  })

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-11-12T20:00:00Z'))).toBe('house-monitor-backup-2026-11-12.json')
  })
})

describe('parseBackup rejects bad files', () => {
  async function validText(mutate: (b: Record<string, any>) => void = () => {}) {
    const { repo, h } = await seededRepo()
    const b = JSON.parse(serializeBackup(await createBackup(repo, h.clock)))
    mutate(b)
    return JSON.stringify(b)
  }

  it('rejects non-JSON', () => {
    expect(() => parseBackup('{oops')).toThrow('not valid JSON')
  })

  it('rejects other formats', async () => {
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(ValidationError)
  })

  it('rejects a newer format version', async () => {
    const text = await validText((b) => (b.version = BACKUP_VERSION + 1))
    expect(() => parseBackup(text)).toThrow('newer version')
  })

  it('reports the path of an invalid entity', async () => {
    const text = await validText((b) => (b.items[1].rotation = 45))
    expect(() => parseBackup(text)).toThrow('backup.items[1].rotation')
  })

  it('rejects dangling parent references', async () => {
    const text = await validText((b) => (b.tasks[0].itemId = 'ghost'))
    expect(() => parseBackup(text)).toThrow("references missing itemId 'ghost'")
  })

  it('rejects duplicate ids', async () => {
    const text = await validText((b) => b.rooms.push(b.rooms[0]))
    expect(() => parseBackup(text)).toThrow('duplicate id')
  })

  it('drops unknown fields', async () => {
    const text = await validText((b) => (b.homes[0].surprise = true))
    expect(parseBackup(text).homes[0]).not.toHaveProperty('surprise')
  })
})
