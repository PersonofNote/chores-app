/**
 * IndexedDB schema. Each migration upgrades from version i to i + 1; never edit a
 * shipped migration, append a new one. DB_VERSION follows from the list's length.
 */
import type { Upgrade } from './idb'

export const DB_NAME = 'house-monitor'

export const STORES = {
  homes: 'homes',
  rooms: 'rooms',
  items: 'items',
  tasks: 'tasks',
  events: 'events',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

const migrations: Upgrade[] = [
  // v0 → v1: initial schema
  (db) => {
    db.createObjectStore(STORES.homes, { keyPath: 'id' })
    db.createObjectStore(STORES.rooms, { keyPath: 'id' }).createIndex('homeId', 'homeId')
    db.createObjectStore(STORES.items, { keyPath: 'id' }).createIndex('roomId', 'roomId')
    db.createObjectStore(STORES.tasks, { keyPath: 'id' }).createIndex('itemId', 'itemId')
    db.createObjectStore(STORES.events, { keyPath: 'id' }).createIndex('taskId', 'taskId')
  },
]

export const DB_VERSION = migrations.length

export const upgrade: Upgrade = (db, tx, fromVersion) => {
  for (let v = fromVersion; v < migrations.length; v++) migrations[v]!(db, tx, v)
}
