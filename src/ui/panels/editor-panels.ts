/** Sheet bodies for the editor: naming rooms, confirming deletes, picking items, house settings. */
import { FLOOR_TYPE, type Library } from '../../domain'
import { button, el } from '../components/sheet'

export const ROOM_NAME_SUGGESTIONS = [
  'Bedroom', 'Bathroom', 'Kitchen', 'Living room', 'Dining room', 'Hallway', 'Office', 'Laundry', 'Garage', 'Entry',
]

/** A name field with quick picks. `onSave` gets the trimmed name. */
export function roomNameBody(initial: string, saveLabel: string, onSave: (name: string) => void): HTMLElement {
  const input = el('input', { className: 'text-input', attrs: { type: 'text', 'aria-label': 'Room name', maxlength: '40' } })
  input.value = initial
  const save = button(saveLabel, () => {
    const name = input.value.trim()
    if (name) onSave(name)
  }, 'sheet-button primary')
  const sync = () => (save.disabled = input.value.trim() === '')
  input.addEventListener('input', sync)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click()
  })
  sync()
  const picks = el('div', { className: 'chips' }, ROOM_NAME_SUGGESTIONS.map((name) =>
    button(name, () => {
      input.value = name
      sync()
    }, 'chip'),
  ))
  return el('div', { className: 'sheet-body' }, [input, picks, save])
}

export function confirmBody(message: string, confirmLabel: string, onConfirm: () => void, onCancel: () => void): HTMLElement {
  return el('div', { className: 'sheet-body' }, [
    el('p', { className: 'sheet-note', text: message }),
    el('div', { className: 'sheet-row' }, [
      button('Cancel', onCancel),
      button(confirmLabel, onConfirm, 'sheet-button danger'),
    ]),
  ])
}

/** Every drawable library type as a tappable tile with its icon. */
export function libraryPickerBody(
  library: Library,
  renderIcon: (type: string) => SVGSVGElement,
  onPick: (type: string) => void,
): HTMLElement {
  const types = Object.entries(library.items)
    .filter(([type]) => type !== FLOOR_TYPE)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
  return el('div', { className: 'sheet-body' }, [
    el('div', { className: 'picker' }, types.map(([type, entry]) => {
      const b = button('', () => onPick(type), 'picker-tile')
      b.append(renderIcon(type), el('span', { text: entry.label }))
      b.setAttribute('aria-label', entry.label)
      return b
    })),
  ])
}

export interface HouseSettings {
  name: string
  width: number
  height: number
}

export interface HouseSettingsHandlers {
  onSave: (s: HouseSettings) => void
  onExport: () => void
  onImport: (file: File) => void
}

export const GRID_LIMITS = { min: 4, max: 60 }

/** Size and name of the house, plus backup. Also used for the first-run form. */
export function houseSettingsBody(initial: HouseSettings, saveLabel: string, h: Partial<HouseSettingsHandlers> & Pick<HouseSettingsHandlers, 'onSave'>): HTMLElement {
  const name = el('input', { className: 'text-input', attrs: { type: 'text', maxlength: '40', 'aria-label': 'Home name' } })
  name.value = initial.name
  const size = (label: string, value: number) => {
    const input = el('input', {
      className: 'text-input',
      attrs: { type: 'number', min: String(GRID_LIMITS.min), max: String(GRID_LIMITS.max), inputmode: 'numeric', 'aria-label': label },
    })
    input.value = String(value)
    return input
  }
  const width = size('Width in cells', initial.width)
  const height = size('Height in cells', initial.height)
  const error = el('p', { className: 'sheet-error', attrs: { role: 'alert' } })

  const save = button(saveLabel, () => {
    const w = Number(width.value)
    const hh = Number(height.value)
    const ok = (n: number) => Number.isInteger(n) && n >= GRID_LIMITS.min && n <= GRID_LIMITS.max
    if (!name.value.trim()) return void (error.textContent = 'Give your home a name.')
    if (!ok(w) || !ok(hh)) return void (error.textContent = `Size must be ${GRID_LIMITS.min}–${GRID_LIMITS.max} cells each way.`)
    error.textContent = ''
    h.onSave({ name: name.value.trim(), width: w, height: hh })
  }, 'sheet-button primary')

  const body = el('div', { className: 'sheet-body' }, [
    el('label', { className: 'field' }, [el('span', { text: 'Name' }), name]),
    el('div', { className: 'sheet-row' }, [
      el('label', { className: 'field' }, [el('span', { text: 'Width (cells)' }), width]),
      el('label', { className: 'field' }, [el('span', { text: 'Height (cells)' }), height]),
    ]),
    el('p', { className: 'sheet-note', text: 'One cell is about a toilet’s width; a bed takes 2 × 2. You can change this later.' }),
    error,
    save,
  ])

  if (h.onExport && h.onImport) {
    const file = el('input', { attrs: { type: 'file', accept: 'application/json,.json', hidden: '' } })
    const onImport = h.onImport
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      if (f) onImport(f)
      file.value = ''
    })
    body.append(
      el('h3', { text: 'Backup' }),
      el('p', { className: 'sheet-note', text: 'Everything lives on this device. Export a backup now and then; importing merges, it never deletes.' }),
      el('div', { className: 'sheet-row' }, [button('Export backup', h.onExport), button('Import backup…', () => file.click())]),
      file,
    )
  }
  return body
}
