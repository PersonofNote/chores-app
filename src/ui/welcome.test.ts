// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../domain'
import type { HouseData } from '../storage'
import { welcome } from './welcome'

const house: HouseData = { home: { id: 'h1', name: 'Flat', gridSize: { w: 10, h: 8 } }, rooms: [], items: [], tasks: [], events: [] }

function setup(restore: (file: File) => Promise<HouseData>) {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const result = welcome(root, { defaultGrid: { w: 16, h: 12 }, newId: () => 'new-id', restore })
  const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!
  const choose = (file: File) => {
    const input = root.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
  }
  return { root, result, button, choose }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('welcome', () => {
  it('starts a new house from the form', async () => {
    const w = setup(async () => house)
    w.button('Start drawing').click()
    await expect(w.result).resolves.toEqual({ kind: 'new', home: { id: 'new-id', name: 'Home', gridSize: { w: 16, h: 12 } } })
  })

  it('offers restoring from a backup, and resolves with the restored house', async () => {
    const restore = vi.fn(async () => house)
    const w = setup(restore)
    expect(w.button('Restore from backup…')).toBeDefined()
    const file = new File(['{}'], 'backup.json')
    w.choose(file)
    await expect(w.result).resolves.toEqual({ kind: 'restored', house })
    expect(restore).toHaveBeenCalledWith(file)
  })

  it('explains a bad file and lets you try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const restore = vi
      .fn<(f: File) => Promise<HouseData>>()
      .mockRejectedValueOnce(new ValidationError('backup: not valid JSON'))
      .mockResolvedValueOnce(house)
    const w = setup(restore)
    w.choose(new File(['nope'], 'bad.json'))
    await tick()
    expect(w.root.querySelector('.welcome-restore .sheet-error')!.textContent).toBe('That file isn’t a valid backup: backup: not valid JSON')

    w.choose(new File(['{}'], 'good.json'))
    await expect(w.result).resolves.toEqual({ kind: 'restored', house })
    expect(w.root.querySelector('.welcome-restore .sheet-error')!.textContent).toBe('')
  })
})
