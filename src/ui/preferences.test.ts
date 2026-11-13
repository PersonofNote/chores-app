import { describe, expect, it } from 'vitest'
import { Preferences } from './preferences'
import { memoryStorage } from './test-app'

describe('Preferences', () => {
  it('has sound on by default', () => {
    expect(new Preferences(memoryStorage()).sound).toBe(true)
  })

  it('remembers sound off across instances on the same storage', () => {
    const storage = memoryStorage()
    new Preferences(storage).sound = false
    expect(new Preferences(storage).sound).toBe(false)
  })

  it('falls back to defaults when storage throws, and still changes in memory', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const prefs = new Preferences(broken)
    expect(prefs.sound).toBe(true)
    prefs.sound = false
    expect(prefs.sound).toBe(false)
  })

  it('works without any storage', () => {
    const prefs = new Preferences(null)
    prefs.sound = false
    expect(prefs.sound).toBe(false)
  })
})
