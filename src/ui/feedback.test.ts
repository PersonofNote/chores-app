// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repository } from '../storage'
import { connectFeedback } from './feedback'
import { testApp } from './test-app'

let repo: Repository | undefined
afterEach(() => repo?.close())

async function setup() {
  const a = await testApp()
  repo = a.repo
  const effects = { restore: vi.fn(), restoreFloor: vi.fn(), skip: vi.fn() }
  const sound = { restore: vi.fn(), skip: vi.fn() }
  connectFeedback(a.store, effects, sound)
  return { ...a, effects, sound }
}

describe('connectFeedback', () => {
  it('a room of completions restores each item once, sparkles the floor, and plays one sound', async () => {
    const a = await setup()
    const kitchen = a.roomOf('Kitchen')
    const tasks = a.store.itemsInRoom(kitchen.id).flatMap((i) => a.store.tasksForItem(i.id))
    await a.store.complete(tasks.map((t) => t.id))

    const drawn = a.store.itemsInRoom(kitchen.id).filter((i) => i.type !== 'floor')
    expect(a.effects.restore.mock.calls.map((c) => c[0]).sort()).toEqual(drawn.map((i) => i.id).sort())
    expect(a.effects.restoreFloor).toHaveBeenCalledExactlyOnceWith(kitchen.id)
    expect(a.sound.restore).toHaveBeenCalledOnce()
  })

  it('a skip plays the quiet effect and sound, not a restore', async () => {
    const a = await setup()
    const toilet = a.itemOf('toilet')
    await a.store.skip(a.store.tasksForItem(toilet.id)[0]!.id)
    expect(a.effects.skip).toHaveBeenCalledWith(toilet.id)
    expect(a.effects.restore).not.toHaveBeenCalled()
    expect(a.sound.skip).toHaveBeenCalledOnce()
    expect(a.sound.restore).not.toHaveBeenCalled()
  })

  it('undo is silent', async () => {
    const a = await setup()
    const events = await a.store.complete([a.store.tasksForItem(a.itemOf('toilet').id)[0]!.id])
    a.effects.restore.mockClear()
    a.sound.restore.mockClear()
    await a.store.undo(events)
    expect(a.effects.restore).not.toHaveBeenCalled()
    expect(a.sound.restore).not.toHaveBeenCalled()
  })
})
