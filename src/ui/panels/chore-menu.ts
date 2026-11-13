/** Long-press on a chore: Done earlier, Skip, History. */
import { daysBefore } from '../../domain'
import type { ChoreOption } from '../chores'
import { button, el } from '../components/sheet'
import { dateFromInput, toDateInputValue } from '../format'
import { choreStatusText } from './chore-status'

export interface ChoreMenuHandlers {
  onDoneEarlier: (at: Date) => void
  onSkip: () => void
  onHistory: () => void
}

export function choreMenuBody(option: ChoreOption, now: Date, h: ChoreMenuHandlers): HTMLElement {
  const body = el('div', { className: 'sheet-body' })
  const status = el('p', { className: 'sheet-note', text: choreStatusText(option, now) })

  const showMain = () =>
    body.replaceChildren(
      status,
      el('div', { className: 'sheet-actions' }, [
        button('Done earlier…', showEarlier),
        button('Skip this time', h.onSkip),
        button('History', h.onHistory),
      ]),
    )

  const showEarlier = () => {
    const input = el('input', {
      className: 'date-input',
      attrs: { type: 'date', max: toDateInputValue(now), value: toDateInputValue(daysBefore(now, 1)), 'aria-label': 'Date done' },
    })
    const confirm = button('Log for that day', () => {
      const at = dateFromInput(input.value, now)
      if (at) h.onDoneEarlier(at)
    }, 'sheet-button primary')
    input.addEventListener('input', () => (confirm.disabled = dateFromInput(input.value, now) === null))
    body.replaceChildren(
      el('p', { className: 'sheet-note', text: 'When did you do it?' }),
      el('div', { className: 'sheet-actions' }, [
        button('Yesterday', () => h.onDoneEarlier(daysBefore(now, 1))),
        button('2 days ago', () => h.onDoneEarlier(daysBefore(now, 2))),
        button('3 days ago', () => h.onDoneEarlier(daysBefore(now, 3))),
      ]),
      el('div', { className: 'sheet-row' }, [input, confirm]),
      button('Back', showMain, 'sheet-button subtle'),
    )
  }

  showMain()
  return body
}
