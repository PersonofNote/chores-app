// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../domain'
import type { Repository } from '../storage'
import type { BackupService } from './settings'
import { testApp } from './test-app'

let repo: Repository | undefined
afterEach(() => repo?.close())

async function app(backup: Partial<BackupService> = {}) {
  const a = await testApp({ backup })
  repo = a.repo
  return a
}

const sheetTitle = (overlay: HTMLElement) => overlay.querySelector('dialog.sheet h2')?.textContent
const soundBox = (overlay: HTMLElement) => overlay.querySelector<HTMLInputElement>('dialog.sheet input[type=checkbox]')!

function chooseFile(overlay: HTMLElement, label: string, file: File) {
  const input = [...overlay.querySelectorAll('dialog.sheet .file-button')]
    .find((b) => b.textContent?.trim() === label)!
    .querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
}

describe('Settings', () => {
  it('opens from the map, without entering the editor', async () => {
    const a = await app()
    a.click('Settings')
    expect(sheetTitle(a.overlay)).toBe('Settings')
    expect(a.editor.isActive).toBe(false)
  })

  it('opens from the editor’s top bar too', async () => {
    const a = await app()
    a.editor.enter()
    const topBar = a.overlay.querySelector('.editor-topbar')!
    ;[...topBar.querySelectorAll('button')].find((b) => b.textContent === 'Settings')!.click()
    expect(sheetTitle(a.overlay)).toBe('Settings')
  })

  it('toggles sound right away, without Save', async () => {
    const a = await app()
    a.settings.open()
    const box = soundBox(a.overlay)
    expect(box.checked).toBe(true)
    box.click()
    expect(a.prefs.sound).toBe(false)
    a.settings.open()
    expect(soundBox(a.overlay).checked).toBe(false)
  })

  it('saves a new name', async () => {
    const a = await app()
    a.settings.open()
    a.overlay.querySelector<HTMLInputElement>('dialog.sheet input[aria-label="Home name"]')!.value = 'Flat'
    a.click('Save')
    await a.settle()
    expect(a.store.house.home.name).toBe('Flat')
    expect(a.ui.sheet()).toBeNull()
  })

  it('exports a backup', async () => {
    const exportFile = vi.fn(async () => {})
    const a = await app({ exportFile })
    a.settings.open()
    a.click('Export backup')
    expect(exportFile).toHaveBeenCalledOnce()
  })

  it('imports a backup, says what it added, then reloads', async () => {
    const importFile = vi.fn(async () => ({ homes: 1, rooms: 0, items: 0, tasks: 0, events: { total: 3, added: 2 } }))
    const a = await app({ importFile })
    a.settings.open()
    chooseFile(a.overlay, 'Import backup…', new File(['{}'], 'backup.json'))
    await a.settle()
    expect(importFile).toHaveBeenCalledOnce()
    expect(a.ui.toast().textContent).toContain('Imported 2 new log entries')
    await vi.waitFor(() => expect(a.reloads).toHaveLength(1), { timeout: 3000 })
  })

  it('explains a bad backup file and doesn’t reload', async () => {
    const a = await app({
      importFile: async () => {
        throw new ValidationError('backup: not valid JSON')
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    a.settings.open()
    chooseFile(a.overlay, 'Import backup…', new File(['nope'], 'backup.json'))
    await a.settle()
    expect(a.ui.toast().textContent).toContain('That file isn’t a valid backup: backup: not valid JSON')
    expect(a.reloads).toHaveLength(0)
  })
})
