/** Sheet bodies for editing an item's chores: the list, and the add / edit form. */
import { MAX_INTERVAL_DAYS, type Id, type LastDoneAnswer, type LibraryTask } from '../../domain'
import type { ChoreOption } from '../chores'
import { button, el } from '../components/sheet'
import { intervalLabel } from '../format'
import { choreDot } from './chore-status'
import { lastDoneChoice } from './seed-prompt'

/** The intervals offered by name; anything else is "Custom". */
export const INTERVAL_PRESETS = [1, 3, 7, 14, 30, 90, 180, 365] as const
const CUSTOM = 'custom'

const capitalized = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`

export interface IntervalPicker {
  element: HTMLElement
  /** Days, or NaN if the custom field isn't a number. */
  value(): number
  set(days: number): void
}

/** A preset dropdown, with a number field for "Custom". */
export function intervalPicker(initial: number): IntervalPicker {
  const select = el('select', { className: 'text-input', attrs: { 'aria-label': 'How often' } }, [
    ...INTERVAL_PRESETS.map((d) => el('option', { text: capitalized(intervalLabel(d)), attrs: { value: String(d) } })),
    el('option', { text: 'Custom…', attrs: { value: CUSTOM } }),
  ])
  const days = el('input', {
    className: 'text-input',
    attrs: { type: 'number', min: '1', max: String(MAX_INTERVAL_DAYS), inputmode: 'numeric', 'aria-label': 'Every how many days' },
  })
  const custom = el('label', { className: 'field interval-custom' }, [el('span', { text: 'Every … days' }), days])
  const sync = () => (custom.hidden = select.value !== CUSTOM)
  select.addEventListener('change', () => {
    if (select.value === CUSTOM && !days.value) days.value = '10'
    sync()
  })
  const set = (d: number) => {
    const preset = (INTERVAL_PRESETS as readonly number[]).includes(d)
    select.value = preset ? String(d) : CUSTOM
    days.value = String(d)
    sync()
  }
  set(initial)
  return {
    element: el('div', { className: 'interval-picker' }, [el('label', { className: 'field' }, [el('span', { text: 'How often' }), select]), custom]),
    value: () => Number(select.value === CUSTOM ? days.value : select.value),
    set,
  }
}

/** An item's chores, each tappable to edit, and "Add chore". */
export function choresListBody(options: readonly ChoreOption[], h: { onEdit: (taskId: Id) => void; onAdd: () => void }): HTMLElement {
  const rows = options.map((o) => {
    const b = button('', () => h.onEdit(o.task.id), 'chore-row')
    b.append(
      choreDot(o),
      el('span', { className: 'chore-row-text' }, [
        el('span', { className: 'chore-row-name', text: o.task.name }),
        el('span', { className: 'chore-row-status', text: capitalized(intervalLabel(o.task.intervalDays)) }),
      ]),
      el('span', { className: 'chore-row-chevron', text: '›', attrs: { 'aria-hidden': 'true' } }),
    )
    b.setAttribute('aria-label', `Edit ${o.task.name}`)
    return el('li', {}, [b])
  })
  return el('div', { className: 'sheet-body' }, [
    rows.length
      ? el('ul', { className: 'chore-list' }, rows)
      : el('p', { className: 'sheet-note', text: 'No chores yet. Without any, this stays fresh and never decays.' }),
    button('Add chore', h.onAdd, 'sheet-button primary'),
  ])
}

export interface ChoreDraft {
  name: string
  intervalDays: number
  /** Only when adding. */
  lastDone?: LastDoneAnswer
}

export interface ChoreFormOptions {
  initial: { name: string; intervalDays: number }
  saveLabel: string
  /** Adding: quick picks that fill in the name and interval. */
  suggestions?: readonly LibraryTask[]
  /** Adding: ask when it was last done, so the new chore starts with a real decay. */
  askLastDone?: boolean
  /** Returns why the draft can't be saved, or null if it can. */
  check: (draft: ChoreDraft) => string | null
  onSave: (draft: ChoreDraft) => void
  onCancel: () => void
  /** Editing: offer "Remove chore". */
  onRemove?: () => void
}

export function choreFormBody(o: ChoreFormOptions): HTMLElement {
  const name = el('input', { className: 'text-input', attrs: { type: 'text', maxlength: '60', 'aria-label': 'Chore name', placeholder: 'e.g. Wash rags' } })
  name.value = o.initial.name
  const interval = intervalPicker(o.initial.intervalDays)
  const error = el('p', { className: 'sheet-error', attrs: { role: 'alert' } })
  let lastDone: LastDoneAnswer = 'no-idea'

  const draft = (): ChoreDraft => ({ name: name.value, intervalDays: interval.value(), ...(o.askLastDone ? { lastDone } : {}) })
  const save = button(o.saveLabel, () => {
    const d = draft()
    const problem = o.check(d)
    error.textContent = problem ?? ''
    if (!problem) o.onSave(d)
  }, 'sheet-button primary')
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click()
  })
  name.addEventListener('input', () => (error.textContent = ''))

  const parts: HTMLElement[] = []
  if (o.suggestions?.length) {
    parts.push(
      el('div', { className: 'chips', attrs: { 'aria-label': 'Suggestions' } }, o.suggestions.map((s) =>
        button(s.name, () => {
          name.value = s.name
          interval.set(s.intervalDays)
          error.textContent = ''
        }, 'chip'),
      )),
    )
  }
  parts.push(el('label', { className: 'field' }, [el('span', { text: 'Name' }), name]), interval.element)
  if (o.askLastDone) {
    parts.push(
      el('div', { className: 'field' }, [
        el('span', { text: 'Last done' }),
        lastDoneChoice('new-chore-last-done', 'Last done', (a) => (lastDone = a)),
      ]),
    )
  }
  parts.push(error, el('div', { className: 'sheet-row' }, [button('Cancel', o.onCancel), save]))
  if (o.onRemove) parts.push(button('Remove chore', o.onRemove, 'sheet-button subtle danger-text'))
  return el('div', { className: 'sheet-body chore-form' }, parts)
}
