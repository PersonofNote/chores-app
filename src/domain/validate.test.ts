import { describe, expect, it } from 'vitest'
import { recordDone, recordVoid } from './events'
import { testDeps } from './test-helpers'
import { validateItem, validateTaskEvent, ValidationError } from './validate'

const item = {
  id: 'i1', roomId: 'r1', type: 'bed', skin: 'bed.icon',
  cell: { x: 0, y: 0 }, size: { w: 2, h: 2 }, rotation: 90,
}

describe('entity validators', () => {
  it('accepts a valid item and omits absent optional fields', () => {
    const v = validateItem(item, 'item')
    expect(v).toEqual(item)
    expect(Object.keys(v)).not.toContain('notes')
  })

  it('keeps present optional fields', () => {
    expect(validateItem({ ...item, notes: 'Model X' }, 'item').notes).toBe('Model X')
  })

  it.each([
    [{ ...item, rotation: 45 }, 'item.rotation'],
    [{ ...item, cell: { x: -1, y: 0 } }, 'item.cell.x'],
    [{ ...item, size: { w: 0, h: 1 } }, 'item.size.w'],
    [{ ...item, notes: 3 }, 'item.notes'],
  ])('rejects with a path (%#)', (bad, path) => {
    expect(() => validateItem(bad, 'item')).toThrow(ValidationError)
    expect(() => validateItem(bad, 'item')).toThrow(path)
  })

  it('round-trips real events and enforces the void/voids pairing', () => {
    const deps = testDeps()
    const done = recordDone('t1', deps)
    const v = recordVoid(done, deps)
    expect(validateTaskEvent(done, 'e')).toEqual(done)
    expect(validateTaskEvent(v, 'e')).toEqual(v)

    const { voids: _, ...orphanVoid } = v
    expect(() => validateTaskEvent(orphanVoid, 'e')).toThrow('e.voids')
    expect(() => validateTaskEvent({ ...done, voids: 'x' }, 'e')).toThrow('e.voids')
    expect(() => validateTaskEvent({ ...done, at: 'yesterday' }, 'e')).toThrow('e.at')
  })
})
