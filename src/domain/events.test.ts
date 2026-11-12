import { describe, expect, it } from 'vitest'
import { effectiveEvents, mergeEvents, recordDone, recordSeed, recordSkip, recordVoid } from './events'
import { daysBefore } from './time'
import { T0, testDeps } from './test-helpers'

describe('recording events', () => {
  it('stamps at and recordedAt with now by default', () => {
    const e = recordDone('t1', testDeps())
    expect(e).toMatchObject({ id: 'evt-1', taskId: 't1', kind: 'done', at: T0, recordedAt: T0 })
  })

  it('backdates "done earlier" while recordedAt stays now', () => {
    const deps = testDeps()
    const earlier = daysBefore(deps.clock.now(), 2)
    const e = recordDone('t1', deps, { at: earlier, note: 'forgot to log' })
    expect(e.at).toBe(earlier.toISOString())
    expect(e.recordedAt).toBe(T0)
    expect(e.note).toBe('forgot to log')
  })

  it('omits optional fields rather than setting them to undefined', () => {
    expect(Object.keys(recordSkip('t1', testDeps()))).not.toContain('note')
  })

  it('rejects events in the future', () => {
    const deps = testDeps()
    const future = new Date(deps.clock.now().getTime() + 1000)
    expect(() => recordDone('t1', deps, { at: future })).toThrow(RangeError)
    expect(() => recordSeed('t1', future, deps)).toThrow(RangeError)
  })

  it('voids point at their target and cannot themselves be voided', () => {
    const deps = testDeps()
    const done = recordDone('t1', deps)
    const v = recordVoid(done, deps)
    expect(v).toMatchObject({ kind: 'void', taskId: 't1', voids: done.id })
    expect(() => recordVoid(v, deps)).toThrow()
  })
})

describe('effectiveEvents', () => {
  it('drops voided events and the voids themselves', () => {
    const deps = testDeps()
    const a = recordDone('t1', deps)
    const b = recordSkip('t1', deps)
    const v = recordVoid(a, deps)
    expect(effectiveEvents([a, b, v])).toEqual([b])
  })

  it('is order-independent (a void can arrive before its target after a merge)', () => {
    const deps = testDeps()
    const a = recordDone('t1', deps)
    const v = recordVoid(a, deps)
    expect(effectiveEvents([v, a])).toEqual([])
  })
})

describe('mergeEvents', () => {
  it('is a set union by id', () => {
    const deps = testDeps()
    const a = recordDone('t1', deps)
    const b = recordDone('t2', deps)
    const c = recordDone('t3', deps)
    const merged = mergeEvents([a, b], [b, c])
    expect(merged.map((e) => e.id).sort()).toEqual([a.id, b.id, c.id].sort())
  })
})
