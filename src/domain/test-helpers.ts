// Shared fixtures for domain tests. Not exported from the domain index.
import { fixedClock, sequentialIds } from './time'
import type { Task } from './types'

export const T0 = '2026-01-01T12:00:00.000Z'

export function testDeps(start = T0) {
  return { clock: fixedClock(start), newId: sequentialIds('evt') }
}

export function task(id: string, intervalDays: number, itemId = 'item-1'): Task {
  return { id, itemId, name: id, intervalDays, kind: 'interval' }
}
