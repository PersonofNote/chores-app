/**
 * Time and identity are injected so the domain stays deterministic under test:
 * decay logic can be checked "30 days later" without waiting 30 days.
 */

export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

/** A clock frozen at `at`. `advanceDays` moves it forward, for tests. */
export function fixedClock(at: Date | string): Clock & { advanceDays(days: number): void } {
  let ms = new Date(at).getTime()
  return {
    now: () => new Date(ms),
    advanceDays(days: number) {
      ms += days * MS_PER_DAY
    },
  }
}

export type IdGenerator = () => string

export const uuid: IdGenerator = () => crypto.randomUUID()

/** Sequential ids ('id-1', 'id-2', ...) for readable test fixtures. */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0
  return () => `${prefix}-${++n}`
}

/** Returns a value in [0, 1). Injected so seeding is reproducible in tests. */
export type Random = () => number

export const MS_PER_DAY = 24 * 60 * 60 * 1000

export function toMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ISO timestamp: ${iso}`)
  return ms
}

export function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY)
}
