import { describe, expect, it } from 'vitest'
import { lastResetByTask, taskStatus } from './decay'
import { seedOffsetDays, seedTasks, type LastDoneAnswer } from './seeding'
import { MS_PER_DAY, type Random } from './time'
import { task, testDeps } from './test-helpers'

const constant = (v: number): Random => () => v

/** Deterministic PRNG (mulberry32) so spread tests are reproducible. */
function seeded(seed: number): Random {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('seedOffsetDays', () => {
  it.each([
    ['this-week', 0, 7],
    ['this-month', 7, 30],
    ['no-idea', 0, 90],
  ] as const)('%s lands in [%i, %i) days ago', (answer, lo, hi) => {
    expect(seedOffsetDays(answer, 90, constant(0))).toBe(lo)
    expect(seedOffsetDays(answer, 90, constant(0.999999))).toBeLessThan(hi)
  })
})

describe('seedTasks', () => {
  it('creates one backdated seed event per answered task and skips unanswered ones', () => {
    const deps = { ...testDeps(), random: constant(0.5) }
    const tasks = [task('a', 7), task('b', 30), task('c', 7)]
    const answers = new Map<string, LastDoneAnswer>([
      ['a', 'this-week'],
      ['b', 'no-idea'],
    ])
    const events = seedTasks(tasks, answers, deps)

    expect(events.map((e) => [e.taskId, e.kind])).toEqual([
      ['a', 'seed'],
      ['b', 'seed'],
    ])
    const now = deps.clock.now().getTime()
    expect((now - Date.parse(events[0]!.at)) / MS_PER_DAY).toBeCloseTo(3.5)
    expect((now - Date.parse(events[1]!.at)) / MS_PER_DAY).toBeCloseTo(15)
  })

  it('"no idea" spreads a house so it does not all come due at once, and nothing starts overdue', () => {
    const deps = { ...testDeps(), random: seeded(42) }
    const tasks = Array.from({ length: 40 }, (_, i) => task(`t${i}`, 14))
    const answers = new Map(tasks.map((t) => [t.id, 'no-idea' as const]))
    const resets = lastResetByTask(seedTasks(tasks, answers, deps))
    const now = deps.clock.now()

    const pressures = tasks.map((t) => taskStatus(t, resets.get(t.id), { now })!.pressure)
    expect(Math.max(...pressures)).toBeLessThan(1)
    // Roughly uniform: some in each half.
    expect(pressures.filter((p) => p < 0.5).length).toBeGreaterThan(5)
    expect(pressures.filter((p) => p >= 0.5).length).toBeGreaterThan(5)
  })
})
