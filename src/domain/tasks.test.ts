import { describe, expect, it } from 'vitest'
import { checkChore, describeChoreProblem, MAX_INTERVAL_DAYS, tidyChoreName } from './tasks'
import type { Task } from './types'

const task = (id: string, name: string, intervalDays = 7): Task => ({ id, itemId: 'counter', name, intervalDays, kind: 'interval' })
const siblings = [task('a', 'Wipe counter', 3), task('b', 'Clear clutter')]

describe('checkChore', () => {
  it('accepts a new chore with a fresh name', () => {
    expect(checkChore({ id: 'new', name: 'Wash rags', intervalDays: 3 }, siblings)).toBeNull()
  })

  it('needs a name', () => {
    expect(checkChore({ id: 'new', name: '   ', intervalDays: 3 }, siblings)).toEqual({ kind: 'empty-name' })
  })

  it('needs a whole number of days in range', () => {
    for (const days of [0, -1, 1.5, Number.NaN, MAX_INTERVAL_DAYS + 1]) {
      expect(checkChore({ id: 'new', name: 'X', intervalDays: days }, siblings)).toEqual({ kind: 'bad-interval' })
    }
    expect(checkChore({ id: 'new', name: 'X', intervalDays: MAX_INTERVAL_DAYS }, siblings)).toBeNull()
  })

  it('rejects a name the item already has, ignoring case and spacing', () => {
    expect(checkChore({ id: 'new', name: ' wipe  COUNTER', intervalDays: 3 }, siblings)).toEqual({ kind: 'duplicate-name', name: 'Wipe counter' })
  })

  it('lets a chore keep its own name when edited', () => {
    expect(checkChore({ id: 'a', name: 'Wipe counter', intervalDays: 2 }, siblings)).toBeNull()
  })

  it('describes every problem', () => {
    expect(describeChoreProblem({ kind: 'duplicate-name', name: 'Wipe counter' })).toContain('Wipe counter')
    expect(describeChoreProblem({ kind: 'bad-interval' })).toContain(String(MAX_INTERVAL_DAYS))
  })
})

describe('tidyChoreName', () => {
  it('trims and collapses spaces but keeps case', () => {
    expect(tidyChoreName('  Wash   Rags ')).toBe('Wash Rags')
  })
})
