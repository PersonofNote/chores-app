/** Item details: notes, its chores, and its history (the event log, newest first). */
import type { Id, Item, TaskEvent } from '../../domain'
import type { HistoryEntry } from '../../state/house-store'
import type { ChoreOption } from '../chores'
import { el } from '../components/sheet'
import { relativeDay, shortDate } from '../format'
import { choreDot, choreStatusText } from './chore-status'

export interface ItemDetailsInput {
  item: Item
  /** This item's chores (worst first). */
  options: readonly ChoreOption[]
  history: readonly HistoryEntry[]
  now: Date
  /** Show only this chore's history at first. */
  filterTaskId?: Id
  /** Floors have no notes of their own. */
  showNotes?: boolean
}

const KIND_LABEL: Record<TaskEvent['kind'], string> = {
  done: 'Done',
  skip: 'Skipped',
  seed: 'Starting point',
  void: 'Undone',
}

/** Logged this much later than it happened = backdated ("Done earlier"). */
const BACKDATED_MS = 60 * 60 * 1000

export function itemDetailsBody(input: ItemDetailsInput, onNotes: (notes: string) => void): HTMLElement {
  const { item, options, history, now } = input
  const body = el('div', { className: 'sheet-body' })

  if (input.showNotes !== false) {
    const notes = el('textarea', {
      className: 'notes',
      attrs: { rows: '2', placeholder: 'Model number, filter size, warranty…', 'aria-label': 'Notes' },
    })
    notes.value = item.notes ?? ''
    let saved = notes.value
    const save = () => {
      if (notes.value === saved) return
      saved = notes.value
      onNotes(notes.value)
    }
    notes.addEventListener('blur', save)
    notes.addEventListener('change', save)
    body.append(notes)
  }

  body.append(
    el('ul', { className: 'chore-summary' }, options.map((o) =>
      el('li', {}, [
        choreDot(o),
        el('span', { className: 'chore-row-text' }, [
          el('span', { className: 'chore-row-name', text: o.task.name }),
          el('span', { className: 'chore-row-status', text: choreStatusText(o, now) }),
        ]),
      ]),
    )),
  )

  const list = el('ol', { className: 'history' })
  let filter: Id | '' = input.filterTaskId ?? ''
  const renderHistory = () => {
    const entries = history.filter((h) => !filter || h.task.id === filter)
    list.replaceChildren(
      ...(entries.length === 0
        ? [el('li', { className: 'sheet-note', text: 'No history yet.' })]
        : entries.map(({ event, task }) => {
            const at = new Date(event.at)
            const backdated = Date.parse(event.recordedAt) - at.getTime() > BACKDATED_MS && event.kind !== 'seed'
            return el('li', { className: 'history-row', attrs: { 'data-kind': event.kind } }, [
              el('span', { className: 'history-date', text: shortDate(at, now) }),
              el('span', { className: 'chore-row-text' }, [
                el('span', { className: 'chore-row-name', text: `${KIND_LABEL[event.kind]}${options.length > 1 ? ` · ${task.name}` : ''}` }),
                el('span', {
                  className: 'chore-row-status',
                  text: [relativeDay(at, now), backdated ? 'logged later' : '', event.note ?? ''].filter(Boolean).join(' · '),
                }),
              ]),
            ])
          })),
    )
  }

  const heading = el('div', { className: 'history-heading' }, [el('h3', { text: 'History' })])
  if (options.length > 1) {
    const select = el('select', { attrs: { 'aria-label': 'Filter by chore' } }, [
      el('option', { text: 'All chores', attrs: { value: '' } }),
      ...options.map((o) => el('option', { text: o.task.name, attrs: { value: o.task.id } })),
    ])
    select.value = filter
    select.addEventListener('change', () => {
      filter = select.value
      renderHistory()
    })
    heading.append(select)
  }
  renderHistory()
  body.append(heading, list)
  return body
}
