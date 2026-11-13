/** Sheet sections for Settings (sound, backup), plus the backup file picker the welcome screen shares. */
import { button, el } from '../components/sheet'

/** A button that opens a file picker for a JSON backup and hands over the chosen file. */
export function backupFileButton(label: string, onFile: (file: File) => void, className = 'sheet-button'): HTMLElement {
  const input = el('input', { attrs: { type: 'file', accept: 'application/json,.json', hidden: '' } })
  input.addEventListener('change', () => {
    const f = input.files?.[0]
    if (f) onFile(f)
    input.value = ''
  })
  const b = button(label, () => input.click(), className)
  return el('span', { className: 'file-button' }, [b, input])
}

/** What to tell the user when exporting, importing or restoring a backup fails. */
export function backupErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === 'ValidationError') return `That file isn’t a valid backup: ${err.message}`
  return 'Something went wrong. Try again.'
}

export function soundSection(on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const box = el('input', { attrs: { type: 'checkbox' } })
  box.checked = on
  box.addEventListener('change', () => onChange(box.checked))
  return el('section', { className: 'settings-section' }, [
    el('h3', { text: 'Sound' }),
    el('label', { className: 'toggle-row' }, [el('span', { text: 'Play a chime when a chore is done' }), box]),
    el('p', { className: 'sheet-note', text: 'This is set per device.' }),
  ])
}

export function backupSection(h: { onExport: () => void; onImport: (file: File) => void }): HTMLElement {
  return el('section', { className: 'settings-section' }, [
    el('h3', { text: 'Backup' }),
    el('p', {
      className: 'sheet-note',
      text: 'Everything lives on this device. Export a backup now and then, or to move your house to another device. Importing merges; it never deletes.',
    }),
    el('div', { className: 'sheet-row' }, [button('Export backup', h.onExport), backupFileButton('Import backup…', h.onImport)]),
  ])
}
