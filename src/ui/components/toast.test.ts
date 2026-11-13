// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, Toaster } from './toast'

describe('Toaster', () => {
  let host: HTMLElement
  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
  })
  afterEach(() => vi.useRealTimers())

  const toast = () => host.querySelector<HTMLElement>('.toast')!

  it('shows a message with an action, then hides after the timeout', () => {
    const t = new Toaster(host)
    const run = vi.fn()
    t.show('Done', { label: 'Undo', run })
    expect(toast().hidden).toBe(false)
    expect(toast().textContent).toBe('DoneUndo')
    vi.advanceTimersByTime(TOAST_MS)
    expect(toast().hidden).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('runs the action once and dismisses', () => {
    const t = new Toaster(host)
    const run = vi.fn()
    t.show('Done', { label: 'Undo', run })
    toast().querySelector('button')!.click()
    expect(run).toHaveBeenCalledOnce()
    expect(toast().hidden).toBe(true)
  })

  it('a new toast replaces the old one and restarts the timer', () => {
    const t = new Toaster(host)
    t.show('First', { label: 'Undo', run: () => {} })
    vi.advanceTimersByTime(TOAST_MS - 100)
    t.show('Second')
    vi.advanceTimersByTime(200)
    expect(toast().textContent).toBe('Second')
    expect(toast().hidden).toBe(false)
  })
})
