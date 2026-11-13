/**
 * First run: name the home and size its grid, or restore a house from a backup
 * (how a house drawn on one device gets onto another).
 */
import type { GridSize, Home, Id } from '../domain'
import type { HouseData } from '../storage'
import { el } from './components/sheet'
import { houseSettingsBody } from './panels/editor-panels'
import { backupErrorMessage, backupFileButton } from './panels/settings-panel'

export type WelcomeResult = { kind: 'new'; home: Home } | { kind: 'restored'; house: HouseData }

export interface WelcomeOptions {
  defaultGrid: GridSize
  newId: () => Id
  /** Imports the backup and loads the house in it. Rejects if the file is no good. */
  restore: (file: File) => Promise<HouseData>
}

export function welcome(root: HTMLElement, opts: WelcomeOptions): Promise<WelcomeResult> {
  return new Promise((resolve) => {
    const start = houseSettingsBody({ name: 'Home', width: opts.defaultGrid.w, height: opts.defaultGrid.h }, 'Start drawing', ({ name, width, height }) =>
      resolve({ kind: 'new', home: { id: opts.newId(), name, gridSize: { w: width, h: height } } }),
    )
    const error = el('p', { className: 'sheet-error', attrs: { role: 'alert' } })
    let busy = false
    const restore = backupFileButton('Restore from backup…', (file) => {
      if (busy) return
      busy = true
      error.textContent = ''
      opts.restore(file).then(
        (house) => resolve({ kind: 'restored', house }),
        (err) => {
          console.error(err)
          busy = false
          error.textContent = backupErrorMessage(err)
        },
      )
    })
    root.replaceChildren(
      el('main', { className: 'welcome' }, [
        el('h1', { text: 'Your house, mapped' }),
        el('p', { className: 'sheet-note', text: 'Draw your home as a grid of rooms, then add the things in it that need looking after.' }),
        start,
        el('section', { className: 'welcome-restore sheet-body' }, [
          el('p', { className: 'sheet-note', text: 'Already set up a house on another device? Export a backup there from Settings, then restore it here.' }),
          restore,
          error,
        ]),
      ]),
    )
  })
}
