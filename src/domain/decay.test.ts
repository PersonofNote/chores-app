import { describe, expect, it } from 'vitest'
import {
  computeHouseStatus,
  DEFAULT_DECAY_CONFIG,
  lastResetByTask,
  pausedMs,
  stageFor,
  taskStatus,
  worstOf,
  type DecayConfig,
} from './decay'
import { recordDone, recordSeed, recordSkip, recordVoid } from './events'
import { daysBefore, MS_PER_DAY, toMs } from './time'
import { T0, task, testDeps } from './test-helpers'

const day = (n: number) => toMs(T0) + n * MS_PER_DAY
const iso = (n: number) => new Date(day(n)).toISOString()

describe('stageFor', () => {
  it.each([
    [0, 'fresh'],
    [0.49, 'fresh'],
    [0.5, 'fine'],
    [0.79, 'fine'],
    [0.8, 'due-soon'],
    [0.99, 'due-soon'],
    [1, 'overdue'],
    [1.74, 'overdue'],
    [1.75, 'neglected'],
    [50, 'neglected'],
  ] as const)('pressure %f → %s', (pressure, stage) => {
    expect(stageFor(pressure)).toBe(stage)
  })

  it('uses custom thresholds', () => {
    const config: DecayConfig = { thresholds: { ...DEFAULT_DECAY_CONFIG.thresholds, overdue: 1.2 } }
    expect(stageFor(1.1, config)).toBe('due-soon')
  })
})

describe('taskStatus over time', () => {
  it('decays through the stages as the clock advances', () => {
    const deps = testDeps()
    const t = task('sheets', 10)
    const resets = lastResetByTask([recordDone(t.id, deps)])

    const stageAfter = (days: number) => {
      deps.clock.advanceDays(days)
      return taskStatus(t, resets.get(t.id), { now: deps.clock.now() })?.stage
    }
    expect(stageAfter(0)).toBe('fresh')
    expect(stageAfter(5)).toBe('fine') // day 5
    expect(stageAfter(3)).toBe('due-soon') // day 8
    expect(stageAfter(2)).toBe('overdue') // day 10
    expect(stageAfter(8)).toBe('neglected') // day 18
  })

  it('is null for a task that has never been reset', () => {
    expect(taskStatus(task('x', 7), undefined, { now: new Date(T0) })).toBeNull()
  })

  it('reports elapsed days and uncapped pressure', () => {
    const s = taskStatus(task('x', 7), day(0), { now: new Date(day(70)) })
    expect(s?.elapsedDays).toBeCloseTo(70)
    expect(s?.pressure).toBeCloseTo(10)
  })

  it('clamps a reset in the future (clock skew across devices) to zero elapsed', () => {
    const s = taskStatus(task('x', 7), day(1), { now: new Date(day(0)) })
    expect(s?.elapsedDays).toBe(0)
    expect(s?.stage).toBe('fresh')
  })

  it('rejects a non-positive interval', () => {
    expect(() => taskStatus(task('x', 0), day(0), { now: new Date(day(1)) })).toThrow(RangeError)
  })
})

describe('lastResetByTask', () => {
  it('takes the latest effective done, skip or seed per task', () => {
    const deps = testDeps()
    const now = deps.clock.now()
    const events = [
      recordSeed('a', daysBefore(now, 20), deps),
      recordSkip('a', deps, { at: daysBefore(now, 5) }),
      recordDone('a', deps, { at: daysBefore(now, 9) }), // backdated, older than the skip
      recordDone('b', deps, { at: daysBefore(now, 3) }),
    ]
    const resets = lastResetByTask(events)
    expect(resets.get('a')).toBe(daysBefore(now, 5).getTime())
    expect(resets.get('b')).toBe(daysBefore(now, 3).getTime())
  })

  it('falls back to the previous reset when the latest is voided (undo)', () => {
    const deps = testDeps()
    const now = deps.clock.now()
    const older = recordDone('a', deps, { at: daysBefore(now, 6) })
    const latest = recordDone('a', deps)
    const undo = recordVoid(latest, deps)
    expect(lastResetByTask([older, latest, undo]).get('a')).toBe(daysBefore(now, 6).getTime())
  })
})

describe('pause windows', () => {
  it('subtracts paused time from elapsed', () => {
    const s = taskStatus(task('x', 10), day(0), {
      now: new Date(day(14)),
      pauses: [{ start: iso(2), end: iso(9) }],
    })
    expect(s?.elapsedDays).toBeCloseTo(7)
  })

  it('counts overlapping pauses once and clips to the window', () => {
    const pauses = [
      { start: iso(-5), end: iso(3) }, // starts before the reset
      { start: iso(2), end: iso(4) }, // overlaps the first
      { start: iso(8), end: iso(20) }, // ends after now
    ]
    expect(pausedMs(day(0), day(10), pauses) / MS_PER_DAY).toBeCloseTo(4 + 2)
  })

  it('treats an open pause as running until now', () => {
    expect(pausedMs(day(0), day(10), [{ start: iso(7) }]) / MS_PER_DAY).toBeCloseTo(3)
  })
})

describe('computeHouseStatus', () => {
  it('rolls up: item shows its worst task, room shows its worst item', () => {
    const deps = testDeps()
    const now = deps.clock.now()
    const items = [
      { id: 'bed', roomId: 'bedroom' },
      { id: 'plant', roomId: 'bedroom' },
      { id: 'fridge', roomId: 'kitchen' },
      { id: 'new-thing', roomId: 'kitchen' },
    ]
    const tasks = [
      task('sheets', 7, 'bed'),
      task('mattress', 90, 'bed'),
      task('water', 7, 'plant'),
      task('coils', 180, 'fridge'),
      task('unseeded', 7, 'new-thing'),
    ]
    const events = [
      recordDone('sheets', deps, { at: daysBefore(now, 3) }), // 0.43
      recordDone('mattress', deps, { at: daysBefore(now, 80) }), // 0.89
      recordDone('water', deps, { at: daysBefore(now, 9) }), // 1.29
      recordDone('coils', deps, { at: daysBefore(now, 10) }), // 0.06
    ]

    const status = computeHouseStatus({ items, tasks, events }, { now })

    expect(status.tasks.get('unseeded')).toBeNull()
    expect(status.items.get('bed')?.taskId).toBe('mattress')
    expect(status.items.get('bed')?.stage).toBe('due-soon')
    expect(status.items.get('new-thing')).toBeNull()
    expect(status.rooms.get('bedroom')?.taskId).toBe('water')
    expect(status.rooms.get('bedroom')?.stage).toBe('overdue')
    expect(status.rooms.get('kitchen')?.taskId).toBe('coils') // unknowns ignored
  })

  it('worstOf ignores unknowns and is null when nothing is known', () => {
    expect(worstOf([null, undefined])).toBeNull()
  })
})
